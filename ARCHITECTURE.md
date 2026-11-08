# OpenZeta アーキテクチャ

このドキュメントは OpenZeta の内部構成を Mermaid 図でまとめたものです。
（GitHub 上では自動的にレンダリングされます）

## 1. 全体アーキテクチャ

```mermaid
flowchart TB
    subgraph B["🖥️ ブラウザ (ローカルファースト)"]
        subgraph UI["components/ — React UI"]
            PAGE["app/page.tsx<br/>全体状態管理"]
            SB["Sidebar<br/>キャラ一覧・検索・管理"]
            CA["ChatArea<br/>チャット中核: 送信/ストリーミング/再生成"]
            CH["chat/ChatHeader + TokenUsagePopover"]
            CI["chat/ChatInputArea<br/>入力・スマートリプライチップ"]
            CMI["chat/ChatMessageItem (memo化)"]
            MDL["CharacterModal / SettingsModal /<br/>ImportCharacterModal"]
            AV["AvatarImage (src検証付き)"]
        end

        subgraph LIB["lib/ — クライアントロジック"]
            DBT["db.ts<br/>Dexie CRUD・シードキャラ"]
            LLC["llm-client.ts<br/>buildPromptMessages / streamChatCompletion<br/>fetchSmartReplies / estimateTokens"]
            MPT["message-parser.ts<br/>@話者 / *行動* / thought除去"]
            UT["utils.ts<br/>downloadJsonFile ほか"]
        end

        IDX[("IndexedDB<br/>characters / messages / settings")]
    end

    subgraph SRV["⚡ Next.js API Routes (サーバー側)"]
        CHAT["POST /api/chat<br/>SSE ストリーミングプロキシ"]
        SMART["POST /api/smart-reply<br/>返答候補 JSON 生成"]
        EXT["lib/external-chat.ts<br/>ボディ検証 + 共通fetch + タイムアウト"]
        SU["lib/safe-url.ts<br/>SSRF対策 (DNS解決・プライベートIP拒否)"]
    end

    BYOK["OpenAI互換エンドポイント<br/>(ユーザー指定 BYOK)"]
    GEM["Gemini API<br/>(サーバー側 GEMINI_API_KEY)"]

    PAGE --> SB
    PAGE --> CA
    PAGE --> MDL
    PAGE --> DBT
    CA --> CH
    CA --> CI
    CA --> CMI
    CMI --> AV
    CMI --> MPT
    CA --> LLC
    CA --> DBT
    MDL --> DBT
    MDL --> UT
    DBT --> IDX
    LLC --> CHAT
    LLC --> SMART
    CHAT --> EXT
    SMART --> EXT
    EXT --> SU
    SU --> BYOK
    CHAT --> GEM
    SMART --> GEM
```

設計上のポイント:

- **ローカルファースト**: 会話・キャラ・設定はすべてブラウザ内 IndexedDB に完結し、サーバーに永続化されない
- **プロキシ方式**: クライアントは必ず `/api/chat` を経由。外部 BYOK の場合はサーバーが SSRF 検証 (`safe-url.ts`) をしてから中継し、Gemini の場合はサーバー側キーで呼び出し
- **描画パイプライン**: ストリームは requestAnimationFrame で間引き → `ChatMessageItem` (memo) が `message-parser.ts` で `@話者` / `*行動*` を解析して吹き出しと地の文を描き分け

## 2. チャット送信〜ストリーミングのシーケンス

```mermaid
sequenceDiagram
    actor U as ユーザー
    participant CA as ChatArea
    participant DB as IndexedDB (Dexie)
    participant LC as llm-client
    participant API as /api/chat
    participant V as external-chat (検証)
    participant S as safe-url (SSRF検証)
    participant LLM as 外部LLM / Gemini

    U->>CA: メッセージ送信
    CA->>DB: addMessage(ユーザーメッセージ + トークン)
    CA->>CA: 空のassistantメッセージを仮表示
    CA->>LC: runCompletionStream()
    LC->>API: POST { messages, baseUrl, apiKey, ... }
    API->>V: parseChatRequestBody()
    V-->>API: 検証済みペイロード (不正なら400)

    alt 外部エンドポイント (BYOK)
        API->>S: validateExternalBaseUrl(baseUrl)
        S-->>API: OK (プライベートIP等は拒否)
        API->>LLM: fetch /chat/completions (stream)
    else ビルトイン Gemini
        API->>LLM: GoogleGenAI generateContentStream
    end

    loop SSEチャンク受信
        LLM-->>API: テキスト / usageMetadata
        API-->>LC: data: {delta.content} / usage / [DONE]
        LC-->>CA: onChunk(text)
        CA->>CA: requestAnimationFrame スロットルで表示更新
    end

    LC-->>CA: { fullText, usage }
    CA->>DB: addMessage(完成メッセージ + バリアント + トークン)
```

## 3. データモデル (IndexedDB / Dexie)

```mermaid
erDiagram
    CHARACTER ||--o{ MESSAGE : "has"

    CHARACTER {
        string id PK
        string name
        string avatarBase64 "data:image/* か https のみ許可"
        string greeting
        string systemPrompt
        number createdAt
        number updatedAt
    }

    MESSAGE {
        string id PK
        string characterId FK
        string role "user | assistant | system"
        string content
        number createdAt
        TokenUsage tokens "prompt / completion / total"
        string variants "再生成バリアント配列"
        number variantIndex
        TokenUsage variantTokens
    }

    USER_SETTINGS {
        string id PK "'default' 固定"
        string userName "AIへの呼び名"
        string userBio "システムプロンプトに注入"
        string baseUrl "デフォルト /api/chat"
        string apiKey "平文 (BYOK)"
        string modelName
        number temperature
        number maxHistoryCount
    }
```

セキュリティ設計の詳細は [SECURITY.md](SECURITY.md) を参照してください。
