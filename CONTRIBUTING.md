# Contributing to OpenZeta

## 方針 — Open Source, not Open Contribution

OpenZeta は**ソースコードを公開していますが、外部からの Pull Request は受け付けていません。**
プロジェクトの一貫性と品質を一人で保つための方針です。利用・フォーク・改変は
[MIT ライセンス](LICENSE) の下で自由に行えます。

| 歓迎 | 受け付けない |
|---|---|
| バグ報告（Issue） | Pull Request |
| 機能要望・使い方の質問（Issue） | コードの直接提供 |
| 脆弱性の非公開報告（[SECURITY.md](SECURITY.md)） | — |

---

## バグ報告

[Issue](https://github.com/CroudGoat/OpenZeta/issues) に以下の形で書いてもらえると助かります。

```
【環境】OS / ブラウザ、Docker か npm か、コミットハッシュ
【手順】1. ... 2. ... 3. ...
【期待】こうなるはず
【実際】こうなった（スクリーンショット / エラーメッセージ）
【補足】F12 → Console の赤字があれば貼る
```

チャットが動かない系の多くは API キー設定が原因です。先に
README の「[よくあるトラブル](README.md#よくあるトラブル)」を確認してください。

---

## 自分で改変する場合

フォークして各自のリポジトリで管理してください。開発コマンドは以下です。

```bash
npm ci                # 依存関係（Node.js 20.9 以上 / .nvmrc は 22）
npm run dev           # 開発サーバー (http://localhost:3000)
npm run build         # 本番ビルド
npx tsc --noEmit      # 型チェック
npm run lint          # ESLint
docker compose up -d  # Docker で起動
```

### 変更前に知っておくと良いこと

- **データはすべてブラウザ内の IndexedDB**（Dexie.js）にあります。サーバーに DB はありません
- **LLM 呼び出しは必ず `/api/chat` を経由**します。外部エンドポイントは
  [lib/safe-url.ts](lib/safe-url.ts) で SSRF 検証されます。ここを迂回する変更は入れないでください
- リクエストの検証は [lib/external-chat.ts](lib/external-chat.ts) に集約されています
- 構成図は [ARCHITECTURE.md](ARCHITECTURE.md) にあります

### コミット前の確認

```bash
npx tsc --noEmit && npm run lint && npm run build
```

3 つとも通る状態を保ってください。

---

## ライセンス

本プロジェクトは [MIT ライセンス](LICENSE) です。フォークした派生版も同じライセンスで
公開してください。
