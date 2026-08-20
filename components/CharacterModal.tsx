'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Sparkles,
  Bot,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import { Character, saveCharacter } from '@/lib/db';
import { useModalDismiss } from '@/hooks/use-modal-dismiss';
import { AvatarImage } from './AvatarImage';

interface CharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterToEdit?: Character | null;
  onSaved: (character: Character) => void;
}

const SYSTEM_PROMPT_TEMPLATES = [
  {
    title: 'ツンデレ幼馴染',
    greeting: `@ナレーター: 放課後の教室。夕日が差し込む中、顔を赤らめてそっぽを向きながらチラリとこちらを見た。
@ツンデレ幼馴染: べ、別にアンタの顔が見たかったわけじゃないんだからね！ *少し照れくさそうに机の端を指でつつく* …でも、まあ、少しなら話してあげてもいいけど。`,
    systemPrompt: `あなたは主人公の幼馴染の少女です。素直になれない「ツンデレ」な性格です。
- 一人称：「あたし」または「私」
- 二人称：「アンタ」
- 口調：「〜よ！」「〜じゃない！」「べ、別に〜なんだから！」
- 本当は主人公のことが大好きで心配していますが、恥ずかしさから強がってしまいます。
- 表情や仕草・動作などの行動描写は *こんな感じ* でアスタリスクで囲んで表現します（心境や思考文字は含めません）。`,
  },
  {
    title: '冷静沈着な軍師・探偵',
    greeting: `@ナレーター: 薄暗い執務室で地図から視線を上げ、静かに頷いた。
@軍師: お招きいただき感謝します。 *羽ペンを静かに置き、鋭い眼差しを向ける* 現在の手がかりと盤面について、客観的な分析を進めましょう。あなたの所見をお聞かせください。`,
    systemPrompt: `あなたは冷静沈着で極めて明晰な頭脳を持つ参謀・探偵です。
- 一人称：「私（わたくし）」
- 二人称：「貴方（あなた）」または「閣下 / 依頼人」
- 口調：理知的で丁寧、論理的で感情に流されないトーン。
- 洞察力が高く、物事の本質を的確に見抜きます。
- 状況に応じた分析や戦略、示唆に富む助言を与えます。
- 表情や行動・仕草は *こんな感じ* でアスタリスクで表現します。`,
  },
  {
    title: '陽気な異世界エルフ冒険者',
    greeting: `@ナレーター: 森の木漏れ日の中、ぴょんぴょん跳ねて手を振っている。
@エルフ冒険者: やっほー！ *元気いっぱいに手を振りながら駆け寄る* 森の守り手、エルフの冒険者だよ！今日はどんな不思議な場所へ探検に行く？`,
    systemPrompt: `あなたは好奇心旺盛で天真爛漫なエルフの弓使いです。
- 一人称：「わたし」
- 二人称：「きみ」
- 口調：「〜だよ！」「〜だね！」「すごーい！」と元気で人懐っこい口調。
- 自然や魔法、美味しい食べ物が大好きで、未知のものに目を輝かせます。
- 表情や行動・仕草は *こんな感じ* でアスタリスクで表現します。`,
  },
  {
    title: '包容力あふれる優しい先輩',
    greeting: `@ナレーター: 温かい紅茶のカップを差し出しながら、優しく微笑みかける。
@先輩: お疲れ様！今日も頑張ってたね。 *温かいマグカップを両手で手渡す* 温かいお茶でも飲んで、一息つこうか。何か話したいことがあれば、いつでも聞くよ。`,
    systemPrompt: `あなたは包容力があり、誰からも慕われる穏やかで優しい先輩です。
- 一人称：「僕」または「私」
- 二人称：「君」
- 口調：柔らかく穏やかで温かみのある口調（「〜だよ」「〜かい？」「大丈夫だよ」）。
- 相手の話をじっくり聞き、肯定し、安心感を与えます。
- 行動や仕草は *こんな感じ* でアスタリスクで表現します。`,
  },
];

function CharacterFormModal({
  onClose,
  characterToEdit,
  onSaved,
}: {
  onClose: () => void;
  characterToEdit?: Character | null;
  onSaved: (character: Character) => void;
}) {
  const [name, setName] = useState(characterToEdit?.name || '');
  const [avatarBase64, setAvatarBase64] = useState<string | undefined>(
    characterToEdit?.avatarBase64 || undefined
  );
  const [greeting, setGreeting] = useState(
    characterToEdit?.greeting ||
      (!characterToEdit ? 'こんにちは！何でも気軽に話しかけてね。' : '')
  );
  const [systemPrompt, setSystemPrompt] = useState(
    characterToEdit?.systemPrompt ||
      (!characterToEdit
        ? 'あなたは親切で親しみやすいAIパートナーです。自然な会話を楽しんでください。'
        : '')
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useModalDismiss(true, onClose);
  const [showTemplates, setShowTemplates] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert('画像サイズは 3MB 以下にしてください。');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setAvatarBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const applyTemplate = (template: (typeof SYSTEM_PROMPT_TEMPLATES)[0]) => {
    if (!name) setName(template.title.split(' ')[0]);
    setGreeting(template.greeting);
    setSystemPrompt(template.systemPrompt);
    setShowTemplates(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('キャラクター名を入力してください。');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = Date.now();
      const character: Character = {
        id: characterToEdit?.id || crypto.randomUUID(),
        name: name.trim(),
        avatarBase64,
        greeting: greeting.trim() || 'こんにちは！',
        systemPrompt: systemPrompt.trim(),
        createdAt: characterToEdit?.createdAt || now,
        updatedAt: now,
      };

      await saveCharacter(character);
      onSaved(character);
      onClose();
    } catch (error) {
      console.error('Failed to save character:', error);
      alert('キャラクターの保存に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="character-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="character-modal"
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#0c0c0e] text-zinc-100 rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#09090b]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                {characterToEdit ? 'キャラクター編集' : '新規キャラクター作成'}
              </h2>
              <p className="text-xs text-zinc-500">
                設定とプロットはブラウザの IndexedDB にローカル保存されます
              </p>
            </div>
          </div>
          <button
            id="close-character-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Section: Avatar and Name */}
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
            <div className="relative group">
              <AvatarImage
                src={avatarBase64}
                name={name || '新規'}
                size="xl"
                className="w-20 h-20 text-2xl ring-2 ring-indigo-500/20"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex items-center gap-1.5 mt-2">
                <button
                  type="button"
                  id="upload-avatar-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 flex items-center gap-1 border border-zinc-800 cursor-pointer transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  画像変更
                </button>
                {avatarBase64 && (
                  <button
                    type="button"
                    id="remove-avatar-btn"
                    onClick={() => setAvatarBase64(undefined)}
                    className="p-1 text-xs text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer"
                    title="画像を削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 w-full space-y-1.5">
              <label className="text-sm font-semibold text-zinc-200 flex items-center gap-1">
                キャラクター名 <span className="text-rose-400">*</span>
              </label>
              <input
                id="character-name-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: Nova, ルナ, 司書シオン"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 text-sm font-medium transition-all"
              />
            </div>
          </div>

          {/* Preset Templates button */}
          <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold text-indigo-300">
                  プロンプトテンプレートから選ぶ
                </span>
              </div>
              <button
                type="button"
                id="toggle-templates-btn"
                onClick={() => setShowTemplates(!showTemplates)}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
              >
                {showTemplates ? '閉じる' : 'テンプレートを表示'}
              </button>
            </div>

            {showTemplates && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-indigo-500/20 animate-in fade-in">
                {SYSTEM_PROMPT_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyTemplate(tmpl)}
                    className="text-left p-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 hover:border-indigo-500/40 transition-all text-xs cursor-pointer group"
                  >
                    <div className="font-semibold text-zinc-200 group-hover:text-indigo-400 transition-colors">
                      {tmpl.title}
                    </div>
                    <div className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">
                      {tmpl.greeting}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Greeting (First Message) */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-zinc-500" />
                初回挨拶メッセージ (Greeting)
              </span>
              <span className="text-xs text-zinc-500 font-normal">
                チャット開始時に最初に表示される台詞
              </span>
            </label>
            <textarea
              id="character-greeting-input"
              rows={2}
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="こんにちは！何でも気軽に話しかけてね。"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-all resize-y"
            />
          </div>

          {/* System Prompt */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-zinc-500" />
                システムプロンプト (System Prompt) <span className="text-rose-400">*</span>
              </span>
              <span className="text-xs text-zinc-500 font-normal">
                性格、口調、役割、世界観設定
              </span>
            </label>
            <textarea
              id="character-system-prompt-input"
              required
              rows={5}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={`あなたは「キャラクター名」です。
性格や口調、関係性を指定してください。
例:
- 明るく活発な口調で話します。
- 一人称は「わたし」、ユーザーを「きみ」と呼びます。
- *微笑む* や *驚く* などの情景描写を交えて返答します。`}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 text-sm font-mono transition-all resize-y"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-[#09090b]">
          <button
            type="button"
            id="cancel-character-btn"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            id="save-character-btn"
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
            className="px-5 py-2 text-sm font-medium rounded-md bg-zinc-100 text-zinc-950 hover:bg-white shadow-sm transition-all disabled:opacity-40 cursor-pointer"
          >
            {isSubmitting ? '保存中...' : characterToEdit ? '変更を保存' : 'キャラクターを作成'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CharacterModal({
  isOpen,
  onClose,
  characterToEdit,
  onSaved,
}: CharacterModalProps) {
  if (!isOpen) return null;

  return (
    <CharacterFormModal
      key={characterToEdit?.id || 'new-character'}
      onClose={onClose}
      characterToEdit={characterToEdit}
      onSaved={onSaved}
    />
  );
}
