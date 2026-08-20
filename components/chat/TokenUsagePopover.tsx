'use client';

import React from 'react';
import { Coins, Cpu } from 'lucide-react';

interface ConversationStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  messageCount: number;
}

interface TokenUsagePopoverProps {
  stats: ConversationStats;
  modelName: string;
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
}

export function TokenUsagePopover({
  stats,
  modelName,
  isOpen,
  onToggle,
}: TokenUsagePopoverProps) {
  return (
    <div className="relative">
      <button
        type="button"
        id="token-usage-trigger-btn"
        onClick={onToggle}
        className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200 text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer"
        title="トークン使用量内訳"
      >
        <Coins className="w-3.5 h-3.5 text-indigo-400" />
        <span>{stats.totalTokens.toLocaleString()} tokens</span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 z-30 w-64 bg-zinc-900/95 backdrop-blur-md text-zinc-200 rounded-xl shadow-2xl border border-zinc-800 p-3.5 text-xs animate-in fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-semibold text-zinc-100 mb-2.5 flex items-center gap-1.5 border-b border-zinc-800/80 pb-2">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>トークン使用統計</span>
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between items-center text-zinc-400">
              <span>プロンプト (Input):</span>
              <span className="text-zinc-200">{stats.promptTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-zinc-400">
              <span>生成 (Completion):</span>
              <span className="text-zinc-200">{stats.completionTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center font-bold text-indigo-300 pt-1 border-t border-zinc-800/60">
              <span>合計:</span>
              <span>{stats.totalTokens.toLocaleString()} tokens</span>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500 flex justify-between">
            <span>使用モデル:</span>
            <span className="font-mono text-zinc-400 truncate max-w-[120px]">{modelName}</span>
          </div>
        </div>
      )}
    </div>
  );
}
