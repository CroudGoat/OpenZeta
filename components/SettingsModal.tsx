'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Key,
  Globe,
  Cpu,
  Thermometer,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Database,
  Download,
  Upload,
  RefreshCw,
  User,
  MessageSquare,
  Users,
  Info,
} from 'lucide-react';
import { Character, Message, TalkProfile, UserSettings, activeProfile, saveSettings, db, DEFAULT_SETTINGS } from '@/lib/db';
import { useModalDismiss } from '@/hooks/use-modal-dismiss';
import { downloadJsonFile } from '@/lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onSettingsSaved: (newSettings: UserSettings) => void;
}

function SettingsFormModal({
  onClose,
  settings,
  onSettingsSaved,
}: {
  onClose: () => void;
  settings: UserSettings;
  onSettingsSaved: (newSettings: UserSettings) => void;
}) {
  const [activeTab, setActiveTab] = useState<'api' | 'data' | 'user'>('api');

  // API Settings State
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl || '/api/chat');
  const [apiKey, setApiKey] = useState(settings.apiKey || '');
  const [modelName, setModelName] = useState(settings.modelName || 'gemini-2.5-flash');
  const [temperature, setTemperature] = useState(settings.temperature ?? 0.7);
  const [maxHistoryCount, setMaxHistoryCount] = useState(settings.maxHistoryCount ?? 20);
  const [showApiKey, setShowApiKey] = useState(false);

  // User Settings State
  // Talk profiles: the whole library is edited here, the active one is what gets used.
  const [profiles, setProfiles] = useState<TalkProfile[]>(settings.profiles);
  const [activeId, setActiveId] = useState(settings.activeProfileId);
  const profile = activeProfile({ ...settings, profiles, activeProfileId: activeId });

  const updateActiveProfile = (patch: Partial<TalkProfile>) =>
    setProfiles((prev) => prev.map((p) => (p.id === profile.id ? { ...p, ...patch } : p)));

  const addProfile = () => {
    const created: TalkProfile = {
      id: crypto.randomUUID(),
      name: `プロフィール ${profiles.length + 1}`,
      userName: profile.userName,
      userBio: '',
    };
    setProfiles((prev) => [...prev, created]);
    setActiveId(created.id);
  };

  const removeProfile = () => {
    if (profiles.length <= 1) return;
    const remaining = profiles.filter((p) => p.id !== profile.id);
    setProfiles(remaining);
    setActiveId(remaining[0].id);
  };

  useModalDismiss(true, onClose);

  // DB Stats State
  const [dbStats, setDbStats] = useState<{ charCount: number; msgCount: number }>({
    charCount: 0,
    msgCount: 0,
  });

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      try {
        const charCount = await db.characters.count();
        const msgCount = await db.messages.count();
        if (isMounted) {
          setDbStats({ charCount, msgCount });
        }
      } catch (e) {
        console.error('Failed to load DB stats', e);
      }
    }
    loadStats();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('接続テスト中...');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a test assistant.' },
            { role: 'user', content: 'Ping' },
          ],
          baseUrl,
          apiKey,
          modelName,
          temperature: 0.5,
        }),
      });

      await res.body?.cancel();

      if (res.ok) {
        setTestStatus('success');
        setTestMessage('接続成功！ストリーミングAPIの動作を確認しました。');
      } else {
        const errData = await res.json().catch(() => ({}));
        setTestStatus('error');
        setTestMessage(errData.error || `エラーステータス: ${res.status}`);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setTestStatus('error');
      setTestMessage(error.message || '接続に失敗しました');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const normalizedProfiles = profiles.map((p) => ({
        ...p,
        name: p.name.trim() || 'プロフィール',
        userName: p.userName.trim() || 'ユーザー',
        userBio: p.userBio.trim(),
      }));

      const newSettings: UserSettings = {
        id: 'default',
        profiles: normalizedProfiles,
        activeProfileId: normalizedProfiles.some((p) => p.id === activeId)
          ? activeId
          : normalizedProfiles[0].id,
        baseUrl: baseUrl.trim() || '/api/chat',
        apiKey: apiKey.trim(),
        modelName: modelName.trim() || 'gemini-2.5-flash',
        temperature: Number(temperature),
        maxHistoryCount: Number(maxHistoryCount),
      };
      await saveSettings(newSettings);
      onSettingsSaved(newSettings);
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('設定の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportFullBackup = async () => {
    const chars = await db.characters.toArray();
    const msgs = await db.messages.toArray();
    const setts = await db.settings.toArray();

    const backup = {
      version: '1.0',
      app: 'OpenZeta',
      exportedAt: new Date().toISOString(),
      characters: chars,
      messages: msgs,
      settings: setts,
    };

    downloadJsonFile(
      `openzeta-full-backup-${new Date().toISOString().slice(0, 10)}.json`,
      backup
    );
  };

  /**
   * Minimal schema validation for full-backup files. Rejects anything that
   * does not look like an OpenZeta backup so a malformed/hostile file can
   * never be silently bulk-loaded into IndexedDB.
   */
  function validateBackupShape(backup: unknown): void {
    if (typeof backup !== 'object' || backup === null || Array.isArray(backup)) {
      throw new Error('無効なバックアップファイルです。');
    }
    const obj = backup as Record<string, unknown>;
    if (!Array.isArray(obj.characters)) {
      throw new Error('無効なバックアップファイルです。characters アレイがありません。');
    }
    for (let i = 0; i < obj.characters.length; i++) {
      const c = obj.characters[i] as Record<string, unknown> | null;
      if (typeof c !== 'object' || c === null || typeof c.id !== 'string' || c.id.length === 0) {
        throw new Error(`characters[${i}] が無効です（id が必要です）。`);
      }
      if (typeof c.name !== 'string' || typeof c.systemPrompt !== 'string') {
        throw new Error(`characters[${i}] が無効です（name / systemPrompt が必要です）。`);
      }
    }
    if (obj.messages !== undefined) {
      if (!Array.isArray(obj.messages)) throw new Error('無効なバックアップファイルです。');
      for (let i = 0; i < obj.messages.length; i++) {
        const m = obj.messages[i] as Record<string, unknown> | null;
        if (typeof m !== 'object' || m === null || typeof m.id !== 'string' || typeof m.characterId !== 'string') {
          throw new Error(`messages[${i}] が無効です（id / characterId が必要です）。`);
        }
      }
    }
    if (obj.settings !== undefined && !Array.isArray(obj.settings)) {
      throw new Error('無効なバックアップファイルです。');
    }
  }

  const handleImportFullBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const backup: unknown = JSON.parse(content);
        validateBackupShape(backup);
        const backupData = backup as {
          characters: unknown[];
          messages?: unknown[];
          settings?: unknown[];
        };

        if (confirm('既存のデータを上書きして復元しますか？')) {
          await db.transaction('rw', [db.characters, db.messages, db.settings], async () => {
            await db.characters.clear();
            await db.messages.clear();
            await db.settings.clear();

            // Shapes were validated above; cast to the Dexie table types.
            await db.characters.bulkAdd(backupData.characters as Character[]);
            if (backupData.messages && backupData.messages.length > 0) {
              await db.messages.bulkAdd(backupData.messages as Message[]);
            }
            if (backupData.settings && backupData.settings.length > 0) {
              await db.settings.bulkAdd(backupData.settings as UserSettings[]);
            }
          });
          alert('バックアップの復元が完了しました。ページを再読み込みします。');
          window.location.reload();
        }
      } catch (err: unknown) {
        const error = err as Error;
        alert(`復元エラー: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleResetDatabase = async () => {
    if (
      confirm(
        '本当にすべてのキャラクターと会話履歴をリセットしますか？この操作は取り消せません。'
      )
    ) {
      await db.characters.clear();
      await db.messages.clear();
      await db.settings.clear();
      await db.settings.put(DEFAULT_SETTINGS);
      alert('データベースをリセットしました。');
      window.location.reload();
    }
  };

  return (
    <div
      id="settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="環境設定"
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#0c0c0e] text-zinc-100 rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#09090b]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">環境設定 (Settings)</h2>
              <p className="text-xs text-zinc-500">
                API接続、データバックアップ、ユーザープロフィールの管理
              </p>
            </div>
          </div>
          <button
            id="close-settings-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-zinc-800 bg-[#09090b]/50 px-6 pt-2 gap-4 text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            id="tab-btn-api"
            onClick={() => setActiveTab('api')}
            className={`pb-2.5 border-b-2 transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === 'api'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>API設定 (BYOK)</span>
          </button>

          <button
            type="button"
            id="tab-btn-user"
            onClick={() => setActiveTab('user')}
            className={`pb-2.5 border-b-2 transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === 'user'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>ユーザー設定</span>
          </button>

          <button
            type="button"
            id="tab-btn-data"
            onClick={() => setActiveTab('data')}
            className={`pb-2.5 border-b-2 transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === 'data'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>データ管理 & バックアップ</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: API Settings */}
          {activeTab === 'api' && (
            <>
              {/* Base URL */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-zinc-500" />
                  Base URL (エンドポイント)
                </label>
                <input
                  id="settings-base-url-input"
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="e.g. https://api.openai.com/v1 または /api/chat"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 text-sm font-mono transition-all"
                />
                <p className="text-[11px] text-zinc-500">
                  標準の「/api/chat」を指定するとサーバー組み込みのGeminiモデルを使用します。
                </p>
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-zinc-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-zinc-500" />
                    API Key (BYOK)
                  </span>
                  <span className="text-xs text-zinc-500 font-normal">
                    ブラウザ内に暗号化されずローカル保存されます
                  </span>
                </label>
                <div className="relative">
                  <input
                    id="settings-api-key-input"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 text-sm font-mono transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Model Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-zinc-500" />
                  Model Name (モデル名)
                </label>
                <input
                  id="settings-model-name-input"
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g. gpt-4o, gpt-4o-mini, llama3.2, gemini-2.5-flash"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 text-sm font-mono transition-all"
                />
              </div>

              {/* Temperature & History Count */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Thermometer className="w-4 h-4 text-zinc-500" />
                      Temperature (創造性)
                    </label>
                    <span className="text-xs font-mono font-bold text-indigo-400">
                      {temperature}
                    </span>
                  </div>
                  <input
                    id="settings-temperature-slider"
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>正確 (0.0)</span>
                    <span>バランス (0.7)</span>
                    <span>創造的 (1.5)</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-zinc-200">
                      過去コンテキスト件数
                    </label>
                    <span className="text-xs font-mono font-bold text-indigo-400">
                      {maxHistoryCount} 件
                    </span>
                  </div>
                  <input
                    id="settings-max-history-slider"
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={maxHistoryCount}
                    onChange={(e) => setMaxHistoryCount(parseInt(e.target.value, 10))}
                    className="w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>最小 (5件)</span>
                    <span>標準 (20件)</span>
                    <span>最大 (50件)</span>
                  </div>
                </div>
              </div>

              {/* Test Connection Button and Result */}
              <div className="pt-2">
                <button
                  type="button"
                  id="test-connection-btn"
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testStatus === 'testing' ? 'animate-spin' : ''}`} />
                  接続テストを実行
                </button>

                {testStatus === 'success' && (
                  <div className="mt-2.5 p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{testMessage}</span>
                  </div>
                )}
                {testStatus === 'error' && (
                  <div className="mt-2.5 p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="break-all">{testMessage}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: User Settings */}
          {activeTab === 'user' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-zinc-100">
                  <User className="w-4 h-4 text-indigo-400" />
                  ユーザープロファイル・会話の基本呼び名設定
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  ここで設定したユーザー名や背景設定は、すべてのAIキャラクターとの会話コンテキストのシステムプロンプトに自動注入されます。AIがあなたを正しく認識し、好みの距離感で会話できるようになります。
                </p>
              </div>

              {/* Talk profile switcher */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-zinc-200 flex items-center justify-between">
                  <span>トークプロフィール</span>
                  <span className="text-xs text-zinc-500 font-normal">{profiles.length} 件</span>
                </label>
                <div className="flex items-center gap-2">
                  <select
                    id="settings-profile-select"
                    value={profile.id}
                    onChange={(e) => setActiveId(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm cursor-pointer focus:outline-none focus:border-indigo-500/50"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || '(無題)'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    id="add-profile-btn"
                    onClick={addProfile}
                    className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
                  >
                    追加
                  </button>
                  <button
                    type="button"
                    id="remove-profile-btn"
                    onClick={removeProfile}
                    disabled={profiles.length <= 1}
                    className="px-3 py-2 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-400 text-xs font-medium hover:bg-rose-950/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  >
                    削除
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  プロフィールは会話履歴とは別に保存されます。チャット画面のヘッダーから、いつでも切り替えられます。
                </p>
              </div>

              {/* Profile label */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-zinc-500" />
                  プロフィール名（一覧に表示される名前）
                </label>
                <input
                  id="settings-profile-name-input"
                  type="text"
                  value={profile.name}
                  onChange={(e) => updateActiveProfile({ name: e.target.value })}
                  placeholder="例: マスター, 仕事用, 休日モード"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-all"
                />
              </div>

              {/* User Display Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-zinc-500" />
                  ユーザー名（AIからの呼び名）
                </label>
                <input
                  id="settings-username-input"
                  type="text"
                  value={profile.userName}
                  onChange={(e) => updateActiveProfile({ userName: e.target.value })}
                  placeholder="例: マスター, ユーザー, タカシ"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-all"
                />
                <p className="text-[11px] text-zinc-500">
                  キャラクターが会話内であなたを呼ぶ際の名前を指定します（デフォルト: 「ユーザー」）。
                </p>
              </div>

              {/* User Bio / Personal Preferences */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-zinc-200 flex items-center justify-between">
                  <span>ユーザー背景・好み（任意）</span>
                  <span className="text-xs text-zinc-500 font-normal">System Promptに注入</span>
                </label>
                <textarea
                  id="settings-userbio-textarea"
                  rows={4}
                  value={profile.userBio}
                  onChange={(e) => updateActiveProfile({ userBio: e.target.value })}
                  placeholder="例:&#10;- 日常会話は敬語ではなく、フランクで親しみやすい口調が好きです。&#10;- サイバーパンク、SF小説、プログラミングに興味があります。&#10;- アドバイスは具体的かつ論理的に説明してください。"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 text-sm leading-relaxed transition-all resize-y"
                />
                <p className="text-[11px] text-zinc-500">
                  AIに知っておいてほしいあなたに関する好みや口調の指示を自由に記述できます。
                </p>
              </div>

              {/* Prompt Injection Preview Box */}
              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1.5 text-xs">
                <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-indigo-400" />
                  コンテキスト自動挿入プレビュー:
                </div>
                <div className="p-2.5 bg-zinc-950 rounded-lg font-mono text-[11px] text-zinc-400 leading-relaxed border border-zinc-800/60">
                  <div>【対話相手（ユーザー）の情報】</div>
                  <div>- ユーザーの呼び名/名前: {profile.userName.trim() || 'ユーザー'}</div>
                  {profile.userBio.trim() && (
                    <div className="mt-1 whitespace-pre-wrap text-zinc-300">
                      - ユーザーに関する背景設定・要望: {profile.userBio.trim()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Data Management */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              {/* Storage Stats Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-950/60 border border-indigo-500/30 text-indigo-400 rounded-lg">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-500 font-medium">登録キャラクター数</div>
                    <div className="text-base font-bold text-zinc-100 font-mono">
                      {dbStats.charCount} 体
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-950/60 border border-indigo-500/30 text-indigo-400 rounded-lg">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-500 font-medium">保存メッセージ数</div>
                    <div className="text-base font-bold text-zinc-100 font-mono">
                      {dbStats.msgCount} 件
                    </div>
                  </div>
                </div>
              </div>

              {/* Backup and Restore */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  バックアップと復元
                </h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={handleExportFullBackup}
                    className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-indigo-400" />
                    全データをJSONエクスポート
                  </button>

                  <label className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer">
                    <Upload className="w-4 h-4 text-indigo-400" />
                    JSONバックアップから復元
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportFullBackup}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="pt-4 border-t border-zinc-800 space-y-2">
                <h3 className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                  デンジャーゾーン
                </h3>
                <p className="text-xs text-zinc-500">
                  ローカルのすべてのキャラクターと会話履歴を完全に消去します。
                </p>
                <button
                  type="button"
                  onClick={handleResetDatabase}
                  className="px-4 py-2 rounded-xl bg-rose-950/30 hover:bg-rose-950/50 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer"
                >
                  ローカルデータベースを全初期化
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-[#09090b]">
          <button
            type="button"
            id="cancel-settings-btn"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            id="save-settings-btn"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            {isSaving ? '保存中...' : '設定を保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsSaved,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <SettingsFormModal
      key={`${settings.baseUrl}-${settings.modelName}-${settings.temperature}-${settings.activeProfileId}`}
      onClose={onClose}
      settings={settings}
      onSettingsSaved={onSettingsSaved}
    />
  );
}
