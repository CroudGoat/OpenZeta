'use client';

import React, { useState } from 'react';
import {
  Plus,
  Search,
  Settings,
  MoreVertical,
  Edit2,
  Copy,
  Download,
  Trash2,
  FileJson,
  Sparkles,
} from 'lucide-react';
import { Character, deleteCharacter, saveCharacter } from '@/lib/db';
import { AvatarImage } from './AvatarImage';
import { exportCharacterToFile } from '@/lib/llm-client';

interface SidebarProps {
  characters: Character[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string) => void;
  onOpenNewCharacterModal: () => void;
  onOpenEditCharacterModal: (character: Character) => void;
  onOpenSettingsModal: () => void;
  onOpenImportModal: () => void;
  onCharactersChanged: () => void;
  className?: string;
}

export function Sidebar({
  characters,
  selectedCharacterId,
  onSelectCharacter,
  onOpenNewCharacterModal,
  onOpenEditCharacterModal,
  onOpenSettingsModal,
  onOpenImportModal,
  onCharactersChanged,
  className = '',
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuCharId, setActiveMenuCharId] = useState<string | null>(null);

  const filteredCharacters = characters.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.greeting.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDuplicate = async (char: Character, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuCharId(null);
    const newChar: Character = {
      ...char,
      id: crypto.randomUUID(),
      name: `${char.name} (コピー)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveCharacter(newChar);
    onCharactersChanged();
  };

  const handleDelete = async (char: Character, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuCharId(null);
    if (confirm(`「${char.name}」とその会話履歴を削除しますか？`)) {
      await deleteCharacter(char.id);
      onCharactersChanged();
    }
  };

  const handleExport = (char: Character, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuCharId(null);
    exportCharacterToFile(char);
  };

  const formatTimestamp = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
  };

  return (
    <aside
      id="openzeta-sidebar"
      className={`w-72 sm:w-80 h-full flex flex-col bg-[#020203] border-r border-zinc-800 text-zinc-100 select-none shrink-0 ${className}`}
    >
      {/* App Header */}
      <div className="p-5 border-b border-zinc-800 bg-[#020203]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <svg
              viewBox="0 0 100 100"
              className="w-7 h-7 text-white fill-current shrink-0"
              aria-hidden="true"
            >
              <path d="M 30,26 C 36,13 56,8 82,12 C 90,13 93,12 88,17 C 84,21 78,21 70,20 C 58,18 44,21 35,27 L 83,16 C 88,15 91,18 86,23 L 17,81 C 12,86 8,84 13,78 C 19,78 41,75 63,76 C 73,77 74,88 68,96 C 65,100 63,98 65,91 C 68,84 63,81 51,81 C 36,81 20,83 10,85 C 7,86 6,83 12,78 L 75,20 C 60,19 46,22 36,30 C 31,34 28,31 30,26 Z" />
            </svg>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                OpenZeta
              </h1>
            </div>
          </div>
        </div>

        {/* New Character Button - High contrast elegant dark pill */}
        <button
          type="button"
          id="sidebar-new-character-btn"
          onClick={onOpenNewCharacterModal}
          className="w-full py-2.5 px-4 bg-zinc-100 text-zinc-950 rounded-md font-medium text-sm flex items-center justify-center gap-2 hover:bg-white transition-colors cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Character</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="px-4 pt-3 pb-1">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            id="sidebar-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="キャラクターを検索..."
            className="w-full pl-8.5 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder:text-zinc-600 text-xs focus:outline-none focus:border-zinc-700 focus:ring-1 focus:ring-indigo-500/30"
          />
        </div>
      </div>

      {/* Character Section Header */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold px-1">
          Recent Characters
        </p>
      </div>

      {/* Character List */}
      <div
        id="sidebar-character-list"
        className="flex-1 overflow-y-auto px-3 py-1 space-y-1"
      >
        {filteredCharacters.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500">
            <Sparkles className="w-5 h-5 mx-auto text-zinc-600 mb-2" />
            <p>キャラクターが見つかりません</p>
          </div>
        ) : (
          filteredCharacters.map((char) => {
            const isSelected = char.id === selectedCharacterId;
            const isMenuOpen = activeMenuCharId === char.id;

            return (
              <div
                key={char.id}
                id={`character-item-${char.id}`}
                onClick={() => onSelectCharacter(char.id)}
                className={`relative group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-zinc-800/50 rounded-lg border border-zinc-700/50'
                    : 'hover:bg-zinc-900 border border-transparent rounded-lg'
                }`}
              >
                <AvatarImage
                  src={char.avatarBase64}
                  name={char.name}
                  size="md"
                  className={isSelected ? 'ring-1 ring-indigo-500/50' : ''}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-sm font-medium truncate ${
                        isSelected ? 'text-zinc-100' : 'text-zinc-300 group-hover:text-zinc-100'
                      }`}
                    >
                      {char.name}
                    </span>
                    <span className="text-[10px] text-zinc-500 shrink-0 font-mono">
                      {formatTimestamp(char.updatedAt || char.createdAt)}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {char.greeting || '会話を始めましょう'}
                  </p>
                </div>

                {/* 3-dots Menu */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuCharId(isMenuOpen ? null : char.id);
                    }}
                    className={`p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-opacity cursor-pointer ${
                      isMenuOpen ? 'opacity-100 bg-zinc-800' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                    }`}
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {isMenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-1 z-30 w-36 bg-zinc-900 text-zinc-200 rounded-xl shadow-2xl border border-zinc-800 py-1 text-xs animate-in fade-in"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuCharId(null);
                          onOpenEditCharacterModal(char);
                        }}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-zinc-200 text-left cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDuplicate(char, e)}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-zinc-200 text-left cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 text-zinc-400" />
                        複製
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleExport(char, e)}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-zinc-200 text-left cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-400" />
                        JSON保存
                      </button>
                      <div className="my-1 border-t border-zinc-800" />
                      <button
                        type="button"
                        onClick={(e) => handleDelete(char, e)}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-rose-500/10 text-rose-400 text-left cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        削除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer / Settings Bar */}
      <div className="p-4 border-t border-zinc-800 bg-[#020203]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="sidebar-settings-btn"
            onClick={onOpenSettingsModal}
            className="flex-1 py-2 px-3 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 font-medium text-sm flex items-center gap-2.5 transition-colors cursor-pointer border border-zinc-800"
          >
            <Settings className="w-4 h-4 text-zinc-400" />
            <span>Settings</span>
          </button>

          <button
            type="button"
            id="sidebar-import-btn"
            onClick={onOpenImportModal}
            title="キャラJSONをインポート"
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800 transition-colors cursor-pointer"
          >
            <FileJson className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
