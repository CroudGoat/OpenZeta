# OpenZeta

大規模言語モデル（LLM）を活用した、**ローカルファースト**なキャラクター対話・ロールプレイ Web アプリケーション。
会話履歴・キャラクター設定・アバターはすべてブラウザ内（IndexedDB）に保存され、外部データベースを必要としません。

- 🐳 **Docker で 1 コマンド起動**
- 🔑 **BYOK**（自分の API キーを持ち込む）または サーバー側 Gemini キー
- 🔒 **ローカルファースト** — 会話データはサーバーに保存されない
- 🎭 マルチロール（`@キャラ名:` / `@ナレーター:`）、行動描写、返答バリアント、スマートリプライ

---

## クイックスタート

### 方法 1: Docker（推奨・Node.js 不要）

必要なのは **Docker だけ**です。3 行で動きます。

```bash
git clone https://github.com/CroudGoat/OpenZeta.git
cd OpenZeta
docker compose up -d
```

ブラウザで **http://localhost:3000** を開いてください。

停止するとき:

```bash
docker compose down
```

> **イメージを自分でビルドしたくない場合**
> GitHub Actions が `ghcr.io/croudgoat/openzeta` を自動ビルド・公開しています
> （`.github/workflows/docker-publish.yml`）。ビルド不要で、次の 1 行で動きます。
>
> ```bash
> docker run -d -p 3000:3000 --name openzeta ghcr.io/croudgoat/openzeta:latest
> ```
>
> 本番では `:latest` ではなく `:0.1.0` のようなバージョン固定タグを使ってください。

### 方法 2: ローカルで直接動かす（Node.js が必要）

**Node.js 20.9 以上**（推奨: 22）が必要です。

```bash
git clone https://github.com/CroudGoat/OpenZeta.git
cd OpenZeta
npm ci
npm run dev
```

http://localhost:3000 を開きます。

本番相当で動かす場合:

```bash
npm run build
npm start
```

---

## API キーの設定

チャットを使うには LLM の API キーが必要です。**どちらか一方**で構いません。

### A. アプリ内で設定する（BYOK）

起動後、左下の **Settings → API設定** で入力します。

| 項目 | 値の例 |
|---|---|
| Base URL | `/api/chat`（組み込み Gemini を使う場合）または `https://api.openai.com/v1` |
| API Key | 各自のキー |
| Model Name | `gemini-2.5-flash` / `gpt-4o-mini` など |

「接続テストを実行」ボタンで疎通確認できます。キーはブラウザ内にのみ保存されます。

### B. サーバー側で設定する（推奨・複数人で使う場合）

`.env` を作成します。

```bash
cp .env.example .env
# .env を編集して GEMINI_API_KEY を設定
```

```env
GEMINI_API_KEY=your_api_key_here
```

Docker の場合は `docker compose up -d` が `.env` を自動で読み込みます。
この場合、利用者はアプリ内でキーを入力する必要がありません。

Gemini のキーは https://aistudio.google.com/apikey で取得できます。

---

## よくあるトラブル

| 症状 | 原因と対処 |
|---|---|
| 起動後 `Gemini API Key is not configured` と出る | キー未設定です。上記「API キーの設定」A または B を行ってください |
| `Error: Cannot find module ...` | `npm ci` をやり直してください（`node_modules` を削除してから実行） |
| `Bind for 0.0.0.0:3000 failed: port is already allocated` | 3000 番が他のアプリ/コンテナに使われています。`HOST_PORT=3001 docker compose up -d` で別ポートを使うか、占有しているものを止めてください |
| 会話履歴が消えた | データは**ブラウザごと**の IndexedDB に保存されます。別ブラウザ・シークレットモードでは見えません。Settings → データ管理 からバックアップできます |
| 外部エンドポイントに繋がらない | サーバー側の SSRF 対策により、プライベート IP・localhost・クラウドメタデータ宛は意図的にブロックされます（[SECURITY.md](SECURITY.md)） |
| Node のバージョンエラー | Node.js 22 を使用してください（`.nvmrc` あり。`nvm use` で切り替え可能） |

---

## 主要機能

### 1. 対話・ロールプレイエンジン
- **マルチロールセグメンテーション**: `@話者名:` や `@ナレーター:` を解析し、吹き出しと地の文ブロックを描き分け
- **アクション構文**: `*行動*` を自動認識し、セリフと仕草を視覚的に整理
- **メッセージ分岐・バリアント管理**: 応答の再生成と、生成済みバリエーション間の切り替え

### 2. マルチプロバイダー LLM 統合
- **OpenAI 互換 API** および Gemini に対応
- **カスタムエンドポイント**: URL とキーがあれば任意のプロバイダに接続可能
- **接続診断**: キーとエンドポイントの疎通確認を内蔵

### 3. スマートリプライ
- 直前の会話文脈から、ユーザーの返答候補を 3 つ生成

### 4. トークン使用量解析
- メッセージ単位のプロンプト／完了トークン数、会話全体の集計

### 5. データ管理
- キャラクターの JSON エクスポート／インポート
- 全データのバックアップ／復元
- すべてブラウザ内で完結

---

## アーキテクチャ

構成図（コンポーネント構成・ストリーミングシーケンス・データモデル）は
**[ARCHITECTURE.md](ARCHITECTURE.md)** を参照してください。

```
Client (Browser)
├── React 19 UI Components (Streaming / Markdown Rendering)
├── Local State & Event Loop (requestAnimationFrame Throttle)
├── Dexie.js / IndexedDB (キャラクター定義, 会話ログ, 設定)
└── LLM Client Interface

Server (Next.js API Routes)
├── /api/chat        (SSE ストリーミングプロキシ / サーバーサイド Gemini 統合)
├── /api/smart-reply (コンテキスト考慮型 Structured Outputs)
└── /api/health      (ヘルスチェック)
```

- **プライバシー**: 会話履歴、キャラクター設定、アバター、接続設定はすべてブラウザ内に保存
- **高効率ストリーミング**: SSE を `requestAnimationFrame` で約 60fps に間引き、UI のフレームドロップを防止
- **再描画の抑制**: `React.memo` とカスタム比較関数で、ストリーミング中の不要な再描画を遮断

---

## 技術スタック

| 区分 | 採用技術 |
|---|---|
| フレームワーク | Next.js 15 (App Router, React 19) |
| 開発言語 | TypeScript |
| スタイリング | Tailwind CSS v4 |
| データベース | Dexie.js (IndexedDB) |
| アイコン | Lucide React |
| Markdown | react-markdown |
| 配布 | Docker / docker compose / GitHub Actions (GHCR) |

---

## ディレクトリ構成

```
├── app/
│   ├── api/
│   │   ├── chat/           # SSE ストリーミング / API プロキシ
│   │   ├── smart-reply/    # 返答候補生成
│   │   └── health/         # ヘルスチェック
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── chat/               # チャット領域・メッセージ・ヘッダー・入力バー
│   ├── CharacterModal.tsx
│   ├── SettingsModal.tsx
│   └── Sidebar.tsx
├── lib/
│   ├── db.ts               # Dexie スキーマ・CRUD
│   ├── llm-client.ts       # LLM クライアント・ストリーム制御
│   ├── message-parser.ts   # ロールプレイ構文パーサー
│   ├── external-chat.ts    # リクエスト検証・外部エンドポイント中継
│   └── safe-url.ts         # SSRF 対策
├── Dockerfile
├── docker-compose.yml
└── public/
```

---

## バージョニング

[Semantic Versioning](https://semver.org/lang/ja/) に従います。`0.x` の間は破壊的変更が入る可能性があります。

- リリースは git タグ `vX.Y.Z` で切り、`package.json` の `version` と一致させます
- 修正のみ: `X.Y.Z+1` / 機能追加: `X.Y+1.0` / 破壊的変更: `X+1.0.0`
- Docker イメージはタグから自動ビルドされます:
  `ghcr.io/croudgoat/openzeta:X.Y.Z`（バージョン固定）と `:latest`（main の最新）
- 本番では `:latest` ではなくバージョン固定タグを推奨します

---

## 開発

```bash
npm run dev     # 開発サーバー
npm run build   # 本番ビルド
npm run lint    # ESLint
npm test        # テスト (Node.js 22 以上)
npx tsc --noEmit # 型チェック
```

依存関係の管理は **npm に統一**しています（`package-lock.json` をコミット）。
Node.js のバージョンは `.nvmrc` / `engines` を参照してください。

---

## セキュリティ

脆弱性の報告方法と、実装済みの対策（SSRF 防止・入力検証・依存関係の監査など）は
**[SECURITY.md](SECURITY.md)** を参照してください。

---

## コントリビューションについて

本プロジェクトは **「Open Source, not Open Contribution」** の形態をとっています。

- **利用とフォークの自由**: MIT ライセンスの下で自由にフォーク、改変、利用できます
- **Pull Request について**: プロジェクトの一貫性と品質を保つため、外部からの Pull Request は受け付けていません。機能追加が必要な場合は各自のリポジトリへフォークしてください
- **フィードバック**: バグ報告やディスカッションは Issue にて歓迎します

詳しくは **[CONTRIBUTING.md](CONTRIBUTING.md)** を参照してください。

## ライセンス

本プロジェクトは [MIT ライセンス](LICENSE) の下で公開されています。
