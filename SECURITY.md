# セキュリティレポート — OpenZeta

最終更新: 2026-11-08

このドキュメントは、2026-11-08 に実施したセキュリティ審査・リファクタリングの結果をまとめたものである。

---

## 修正した脆弱性

### 1. SSRF（サーバーサイドリクエストフォージング）— 重大 【修正済み】

**箇所**: app/api/chat/route.ts、app/api/smart-reply/route.ts

クライアントから送られた baseUrl がサーバー上でそのまま fetch されていたため、
公開デプロイ時は誰でもサーバー経由で内部ネットワークへリクエストを叩ける状態だった。
例:

- http://169.254.169.254/ （クラウドメタデータ = サービスアカウントトークンの漏洩リスク）
- http://127.0.0.1:xxxx / http://10.x.x.x / http://192.168.x.x （内部サービス探索）
- file:// / gopher:// などの非 HTTP スキーム

**修正内容**（lib/safe-url.ts を新設）:

- http/https のみ許可（その他プロトコルは拒否）
- ホスト名を DNS 解決し、全 A/AAAA レコードがプライベート・ループバック・
  リンクローカル・マルチキャスト・予約範囲でないことを検証
  （IPv4/IPv6 双方、IPv4-mapped アドレスも対象）
- localhost / *.local / *.internal / クラウドメタデータホスト名の早期拒否
- 解決不能・タイムアウト（5秒）も拒否
- 外部エンドポイントへの fetch にハードタイムアウトを追加
  （チャット 120 秒 / スマートリプライ 30 秒 → 504）

**既知の限界**: DNS リバインディング（検証と fetch の間で解決先が変わる攻撃）は、
カスタム DNS 解決を持つ HTTP エージェント実装でなければ完全に防げない。
ローカルファースト単一ユーザーアプリとしては実害が低いと判断している。

### 2. リクエストボディの未検証 — 中 【修正済み】

**箇所**: 上記 2 ルート

messages が配列か、各要素の role/content が正しい型か検証されておらず、
不正なボディは 500 エラーを誘発できた（DoS 的利用も可能）。

**修正内容**（lib/external-chat.ts を新設）:

- messages: 空でない配列（最大 500 件）、role は system/user/assistant のみ、
  content は文字列（最大 100,000 文字）
- temperature は 0〜2 にクランプ、modelName は 200 文字までに制限
- 検証失敗は 400 を返し、内部情報は漏らさない
- スマートリプライの characterName は改行除去・100 文字制限で
  プロンプト構造破壊を防止

### 3. 依存パッケージの脆弱性 8 件（moderate）— 中 【修正済み】

npm audit の結果を package.json の overrides で修正:

| パッケージ | 経路 | 内容 |
|---|---|---|
| minimatch < 11.0.1 | @typescript-eslint/typescript-estree | glob パターンによる DoS (CVE-2026-118764)。該当ツリーのみ 11.0.1 以上へ固定 |
| postcss-selector-parser < 6.1.5 | @tailwindcss/typography | セレクタ解析の二次関数コンプレキシティ |

修正後 npm audit: found 0 vulnerabilities。
※ 両者とも dev 依存（ビルド時ツール）で、アプリのランタイムバンドルには含まれない。

### 4. アバター URL の未検証 — 低 【修正済み】

**箇所**: components/AvatarImage.tsx

インポートしたキャラクター JSON の avatarBase64 がそのまま <img src> として
描画されていた（javascript: / data:text/html / http 等の悪意ある値も受理）。

**修正内容**: data:image/(png|jpeg|webp|gif|svg+xml|bmp|avif); か https:// の
み許可（isValidAvatarSrc）。それ以外は初期文字アバターにフォールバック。

### 5. バックアップ復元のスキーマ未検証 — 中 【修正済み】

**箇所**: components/SettingsModal.tsx

復元用 JSON の characters / messages 配列の内容を検証せずに
clear() → bulkAdd() していた。不正ファイルでトランザクションが失敗すると
最悪の場合、復元前のデータが残ったまま UI が不整合になる。

**修正内容**: validateBackupShape() で各要素の必須フィールド
（id / name / systemPrompt / characterId など）を検証し、
不正ファイルはトランザクション開始前に拒否。

### 6. 他（軽微）

- next.config.ts にセキュリティヘッダー追加:
  X-Content-Type-Options: nosniff、X-Frame-Options: DENY、
  Referrer-Policy: no-referrer、Permissions-Policy
- 外部 API のエラー本文をクライアントにそのまま返していた箇所に
  500 文字の長さ制限を追加
- .env は gitignore 済み（.env* / !.env.example）。
  git 履歴の全コミットをスキャンしたが機密情報の漏洩は確認されなかった

---

## 設計上の注意点（残存リスク）

1. **API キーの保存**: BYOK のキーはブラウザの IndexedDB に
   平文で保存される（UI にも明記済み）。サーバーはキーを外部エンドポイントへ
   転送するのみで保持しないが、SSRF 対策と合わせて設計理解を推奨する。
2. **レート制限**: 公開デプロイ時、/api/chat は認証なしで誰でも叩ける。
   サーバー側 GEMINI_API_KEY を設定している場合、キーの使いすぎ（金銭的コスト）
   に注意。必要であれば Cloud Run / リバースプロキシでレート制限を推奨。
3. **DNS リバインディング**: 上記「既知の限界」を参照。

---

## 実施したリファクタリング

| 変更 | 内容 |
|---|---|
| app/api/chat/route.ts、app/api/smart-reply/route.ts | 共通の検証・fetch・エラー変換を lib/external-chat.ts / lib/safe-url.ts に抽出（重複排除 + 上記のセキュリティ修正） |
| components/ChatArea.tsx | handleSendMessage と handleRegenerate の重複するストリーミング処理（約 200 行）を runCompletionStream() に抽出。状態リセットも一元化 |
| lib/utils.ts | downloadJsonFile()（Blob + ObjectURL）を追加。data: URI による大容量バックアップエクスポート時のメモリ枯渇問題を解消 |
| lib/llm-client.ts、components/SettingsModal.tsx | 上記 downloadJsonFile() を活用し重複したアンカー生成コードを削除 |
| lib/safe-url.ts、lib/external-chat.ts | 新設（上記） |
| hooks/use-mobile.ts | 未使用のため削除 |
| .eslintrc.json | eslint.config.mjs（フラット構文）と重複するため削除 |
| next.config.ts | 未使用の picsum.photos remotePatterns を削除、セキュリティヘッダーを追加 |
| package.json | overrides で脆弱依存を修正、eslint.config.mjs が使用する @eslint/eslintrc を明示的な devDependency 化 |

## 検証結果

- npm audit: 0 vulnerabilities（修正前: 8 moderate）
- npx tsc --noEmit: エラー 0
- npx eslint .: エラー 0 / 警告 0
- git 履歴のシークレットスキャン: 検出なし
- 静的パターン検査: dangerouslySetInnerHTML / eval / document.write / ハードコード鍵 なし
