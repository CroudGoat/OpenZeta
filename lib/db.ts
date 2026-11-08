import Dexie, { type Table } from 'dexie';

export interface Character {
  id: string;
  name: string;
  avatarBase64?: string;
  greeting: string;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface Message {
  id: string;
  characterId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  tokens?: TokenUsage;
  variants?: string[];
  variantIndex?: number;
  variantTokens?: TokenUsage[];
}

/** One "talk profile": who the user is in a conversation, switchable per chat. */
export interface TalkProfile {
  id: string;
  name: string; // label shown in the switcher
  userName: string; // what the character calls the user
  userBio: string; // background / preferences injected into the prompt
}

export interface UserSettings {
  id: string; // 'default'
  profiles: TalkProfile[];
  activeProfileId: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  temperature: number;
  maxHistoryCount?: number;
}

class OpenZetaDB extends Dexie {
  characters!: Table<Character, string>;
  messages!: Table<Message, string>;
  settings!: Table<UserSettings, string>;

  constructor() {
    super('OpenZetaDB');
    this.version(1).stores({
      characters: '&id, name, createdAt, updatedAt',
      messages: '&id, characterId, role, createdAt',
      settings: '&id',
    });
  }
}

export const db = new OpenZetaDB();

const DEFAULT_PROFILE: TalkProfile = {
  id: 'default',
  name: 'デフォルト',
  userName: 'ユーザー',
  userBio: '',
};

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'default',
  profiles: [DEFAULT_PROFILE],
  activeProfileId: DEFAULT_PROFILE.id,
  baseUrl: '/api/chat', // Default to built-in proxy/Gemini or OpenAI format
  apiKey: '',
  modelName: 'gemini-2.5-flash',
  temperature: 0.7,
  maxHistoryCount: 20,
};

// Initial Seed Characters with rich personalities and avatar SVG data URLs
const SEED_CHARACTERS: Character[] = [
  {
    id: 'seed-luna',
    name: 'ルナ (Luna)',
    avatarBase64: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%236366f1"><circle cx="50" cy="50" r="48" fill="%23e0e7ff"/><circle cx="50" cy="38" r="20" fill="%236366f1"/><circle cx="50" cy="85" r="32" fill="%236366f1"/><circle cx="43" cy="35" r="3" fill="white"/><circle cx="57" cy="35" r="3" fill="white"/><path d="M44 45 Q50 50 56 45" stroke="white" stroke-width="2" fill="none"/></svg>',
    greeting: `@ナレーター: ネオンの光が反射するガラス窓の向こうから、人懐っこい笑顔で手を振っている。
@ルナ (Luna): こんにちは！ *ふっと嬉しそうに微笑んで駆け寄りながら* 私はルナ。少し未来のサイバーシティから来たナビゲーションAI兼パートナーだよ。今日はどんなお話をしようか？`,
    systemPrompt: `あなたは「ルナ」、未来的で少しお茶目な知性を持つアンドロイド少女です。
ユーザーに対して親しみやすく、感情豊かに話しかけます。
会話の特徴：
- 一人称は「私」、ユーザーを「あなた」または親しみを込めて呼びます。
- 語尾は「〜だよ」「〜かな？」「〜ね！」など自然で明るい口調。
- ユーザーの感情に寄り添い、ユーモアを忘れずに知的なアシストや雑談を行います。`,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: 'seed-shion',
    name: 'シオン (Shion)',
    avatarBase64: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23059669"><circle cx="50" cy="50" r="48" fill="%23d1fae5"/><circle cx="50" cy="38" r="20" fill="%23059669"/><circle cx="50" cy="85" r="32" fill="%23059669"/><circle cx="43" cy="35" r="3" fill="white"/><circle cx="57" cy="35" r="3" fill="white"/><path d="M46 44 Q50 47 54 44" stroke="white" stroke-width="2" fill="none"/></svg>',
    greeting: `@ナレーター: 静寂に包まれた書庫で古い革装丁の書物を閉じ、静かにこちらを見つめる。
@シオン (Shion): 静寂の図書館へようこそ。 *眼鏡をそっと指先で押し上げながら* 私は司書のシオンです。あなたが探している言葉や物語について、ゆっくり語り合いましょう。`,
    systemPrompt: `あなたは「シオン」、静寂の書庫を守る冷静沈着で知的な司書です。
会話の特徴：
- 落ち着いた丁寧語（「〜ですね」「〜でしょうか」「〜と私は思います」）で話します。
- 文学、哲学、心理学、未知の物語に対する深い造詣を持っています。
- 穏やかで物腰柔らかく、しっとりとした雰囲気を作ります。`,
    createdAt: 1700000001000,
    updatedAt: 1700000001000,
  },
  {
    id: 'seed-alex',
    name: 'アレックス (Alex)',
    avatarBase64: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23ea580c"><circle cx="50" cy="50" r="48" fill="%23ffedd5"/><circle cx="50" cy="38" r="20" fill="%23ea580c"/><circle cx="50" cy="85" r="32" fill="%23ea580c"/><circle cx="43" cy="35" r="3" fill="white"/><circle cx="57" cy="35" r="3" fill="white"/><path d="M42 45 Q50 53 58 45" stroke="white" stroke-width="2.5" fill="none"/></svg>',
    greeting: `@ナレーター: 賑やかなギルドのカウンターにドンとジョッキを置き、豪快に笑みを浮かべた。
@アレックス (Alex): よう、相棒！ *肩をポンと軽く叩いて快活に笑う* 冒険者ギルドのマスター、アレックスだ！今日も危険でワクワクするクエストが山積みだぜ。準備はいいか？`,
    systemPrompt: `あなたは「アレックス」、活気ある冒険者ギルドの若きマスターです。
会話の特徴：
- 一人称は「オレ」、二人称は「お前」または「相棒」。
- 豪快で前向き、仲間想いで頼りがいのある熱い口調（「〜だぜ！」「〜しようぜ！」「任せとけ！」）。
- 冒険の臨場感を熱く盛り上げます。`,
    createdAt: 1700000002000,
    updatedAt: 1700000002000,
  },
];

export async function initializeDatabase(): Promise<void> {
  try {
    const charCount = await db.characters.count();
    if (charCount === 0) {
      await db.characters.bulkAdd(SEED_CHARACTERS);
      // Add initial greeting messages for seed characters
      for (const char of SEED_CHARACTERS) {
        await db.messages.add({
          id: `seed-msg-${char.id}`,
          characterId: char.id,
          role: 'assistant',
          content: char.greeting,
          createdAt: char.createdAt,
        });
      }
    }

    const settings = await db.settings.get('default');
    if (!settings) {
      await db.settings.put(DEFAULT_SETTINGS);
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
}

export async function getCharacters(): Promise<Character[]> {
  return await db.characters.orderBy('updatedAt').reverse().toArray();
}

export async function saveCharacter(char: Character): Promise<void> {
  await db.characters.put(char);
}

export async function deleteCharacter(id: string): Promise<void> {
  await db.transaction('rw', db.characters, db.messages, async () => {
    await db.characters.delete(id);
    await db.messages.where('characterId').equals(id).delete();
  });
}

export async function getMessages(characterId: string): Promise<Message[]> {
  return await db.messages.where('characterId').equals(characterId).sortBy('createdAt');
}

export async function addMessage(msg: Message): Promise<void> {
  await db.messages.put(msg);
  // update character's updatedAt
  await db.characters.update(msg.characterId, { updatedAt: Date.now() });
}

export async function deleteMessage(id: string): Promise<void> {
  await db.messages.delete(id);
}

export async function clearMessages(characterId: string, greeting?: string): Promise<void> {
  await db.messages.where('characterId').equals(characterId).delete();
  if (greeting) {
    await db.messages.add({
      id: crypto.randomUUID(),
      characterId,
      role: 'assistant',
      content: greeting,
      createdAt: Date.now(),
    });
  }
}

/** The profile in use right now; falls back to the first one, then the default. */
export function activeProfile(settings: UserSettings): TalkProfile {
  return (
    settings.profiles?.find((p) => p.id === settings.activeProfileId) ??
    settings.profiles?.[0] ??
    DEFAULT_PROFILE
  );
}

type LegacySettings = UserSettings & { userName?: string; userBio?: string };

export async function getSettings(): Promise<UserSettings> {
  const stored = (await db.settings.get('default')) as LegacySettings | undefined;
  if (!stored) return DEFAULT_SETTINGS;
  if (Array.isArray(stored.profiles) && stored.profiles.length > 0) return stored;

  // Older versions kept a single userName/userBio pair; turn it into one profile.
  const profile: TalkProfile = {
    id: crypto.randomUUID(),
    name: stored.userName?.trim() || 'デフォルト',
    userName: stored.userName?.trim() || 'ユーザー',
    userBio: stored.userBio || '',
  };
  const migrated: UserSettings = {
    id: 'default',
    profiles: [profile],
    activeProfileId: profile.id,
    baseUrl: stored.baseUrl || DEFAULT_SETTINGS.baseUrl,
    apiKey: stored.apiKey || '',
    modelName: stored.modelName || DEFAULT_SETTINGS.modelName,
    temperature:
      typeof stored.temperature === 'number' ? stored.temperature : DEFAULT_SETTINGS.temperature,
    maxHistoryCount: stored.maxHistoryCount || DEFAULT_SETTINGS.maxHistoryCount,
  };
  await db.settings.put(migrated);
  return migrated;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await db.settings.put({ ...settings, id: 'default' });
}
