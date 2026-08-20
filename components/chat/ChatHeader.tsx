'use client';

import React from 'react';
import {
  Menu,
  MoreHorizontal,
  Edit,
  Download,
  RotateCcw,
  Settings as SettingsIcon,
} from 'lucide-react';
import { Character, UserSettings } from '@/lib/db';
import { exportCharacterToFile } from '@/lib/llm-client';
import { AvatarImage } from '../AvatarImage';
import { TokenUsagePopover } from './TokenUsagePopover';

interface ConversationStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  messageCount: number;
}

interface ChatHeaderProps {
  character: Character;
  settings: UserSettings;
  conversationStats: ConversationStats;
  showOptionsMenu: boolean;
  setShowOptionsMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showTokenUsagePopover: boolean;
  setShowTokenUsagePopover: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenEditCharacterModal: () => void;
  onOpenSettingsModal: () => void;
  onToggleMobileSidebar: () => void;
  onClearHistory: () => void;
}

export function ChatHeader({
  character,
  settings,
  conversationStats,
  showOptionsMenu,
  setShowOptionsMenu,
  showTokenUsagePopover,
  setShowTokenUsagePopover,
  onOpenEditCharacterModal,
  onOpenSettingsModal,
  onToggleMobileSidebar,
  onClearHistory,
}: ChatHeaderProps) {
  return (
    <header
      id="chat-header"
      className="h-16 border-b border-zinc-800 bg-[#09090b] px-4 sm:px-8 flex items-center justify-between shrink-0 z-20"
    >
      {/* Left: Mobile Toggle & Character Info */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          id="mobile-sidebar-toggle-btn"
          onClick={onToggleMobileSidebar}
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg md:hidden cursor-pointer"
          title="サイドバーを開く"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div
          id="chat-character-info"
          onClick={onOpenEditCharacterModal}
          className="flex items-center gap-3 cursor-pointer group min-w-0"
          title="キャラクター設定を編集"
        >
          <div className="relative shrink-0">
            <AvatarImage src={character.avatarBase64} name={character.name} size="md" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#09090b]"></span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-xs sm:text-sm text-zinc-100 group-hover:text-indigo-300 transition-colors truncate max-w-[110px] xs:max-w-[160px] sm:max-w-xs">
                {character.name}
              </h1>
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 truncate max-w-[110px] xs:max-w-[160px] sm:max-w-xs font-mono">
              {character.systemPrompt || 'アシスタントプロンプト'}
            </p>
          </div>
        </div>
      </div>

      {/* Right Action Tools */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Token Usage Stats Popover */}
        <TokenUsagePopover
          stats={conversationStats}
          modelName={settings.modelName || 'gemini-2.5-flash'}
          isOpen={showTokenUsagePopover}
          onToggle={(e) => {
            e.stopPropagation();
            setShowTokenUsagePopover((prev) => !prev);
            setShowOptionsMenu(false);
          }}
        />

        {/* Export Character */}
        <button
          type="button"
          id="chat-export-char-btn"
          onClick={() => exportCharacterToFile(character)}
          className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer hidden sm:flex"
          title="キャラクターをJSONファイルで保存"
        >
          <Download className="w-5 h-5" />
        </button>

        {/* Options Dropdown */}
        <div className="relative">
          <button
            type="button"
            id="chat-options-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowOptionsMenu((prev) => !prev);
              setShowTokenUsagePopover(false);
            }}
            className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {showOptionsMenu && (
            <div
              className="absolute right-0 top-full mt-1.5 z-40 w-48 bg-zinc-900 text-zinc-200 rounded-xl shadow-2xl border border-zinc-800 py-1 text-xs animate-in fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setShowOptionsMenu(false);
                  onOpenEditCharacterModal();
                }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-zinc-800 text-zinc-200 text-left cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5 text-zinc-400" />
                キャラクター編集
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOptionsMenu(false);
                  onOpenSettingsModal();
                }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-zinc-800 text-zinc-200 text-left cursor-pointer"
              >
                <SettingsIcon className="w-3.5 h-3.5 text-zinc-400" />
                API・モデル設定
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOptionsMenu(false);
                  exportCharacterToFile(character);
                }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-zinc-800 text-zinc-200 text-left cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" />
                JSONエクスポート
              </button>
              <div className="my-1 border-t border-zinc-800" />
              <button
                type="button"
                onClick={onClearHistory}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-rose-500/10 text-rose-400 text-left cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                会話履歴をリセット
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
