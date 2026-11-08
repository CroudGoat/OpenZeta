'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Square, Sparkles, RefreshCw, Coins } from 'lucide-react';
import { estimateTokens } from '@/lib/llm-client';

interface ChatInputAreaProps {
  isStreaming: boolean;
  characterName: string;
  smartReplies: string[];
  isLoadingSmartReplies: boolean;
  onSendMessage: (text: string) => void;
  onStopStreaming: () => void;
  onGenerateSmartReplies: () => void;
}

/**
 * Owns the draft text so typing does not re-render the whole message list.
 */
export const ChatInputArea = React.memo(function ChatInputArea({
  isStreaming,
  characterName,
  smartReplies,
  isLoadingSmartReplies,
  onSendMessage,
  onStopStreaming,
  onGenerateSmartReplies,
}: ChatInputAreaProps) {
  const [inputText, setInputText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [inputText]);

  const submit = () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;
    setInputText('');
    onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="p-3 sm:p-5 bg-[#0c0c0e] border-t border-zinc-800 z-10 shrink-0">
      <div className="max-w-3xl mx-auto space-y-2.5 sm:space-y-3">
        {/* Suggestions Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none max-w-full">
          <button
            type="button"
            id="generate-smart-reply-btn"
            onClick={onGenerateSmartReplies}
            disabled={isLoadingSmartReplies || isStreaming}
            className="px-3 py-1.5 bg-indigo-950/40 border border-indigo-500/30 text-indigo-400 rounded-full text-[11px] font-medium hover:bg-indigo-900/40 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
            title="文脈に合わせた返答候補を3つ生成"
          >
            {isLoadingSmartReplies ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span className="whitespace-nowrap">✨ Generate Suggestions</span>
          </button>

          {smartReplies.length > 0 && (
            <div className="h-4 w-[1px] bg-zinc-800 mx-0.5 shrink-0 hidden sm:block" />
          )}

          {/* Smart Reply Chips */}
          <div className="flex gap-2 items-center shrink-0">
            {smartReplies.map((reply, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setInputText(reply);
                  textareaRef.current?.focus();
                }}
                className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-full text-[11px] cursor-pointer hover:text-white hover:border-zinc-700 transition-colors truncate max-w-[200px] sm:max-w-[260px] animate-in fade-in shrink-0"
                title={`"${reply}"`}
              >
                &quot;{reply}&quot;
              </button>
            ))}
          </div>
        </div>

        {/* Text Input */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            id="chat-input-textarea"
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Type a message to ${characterName}...`}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 sm:p-4 pr-12 sm:pr-16 text-xs sm:text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 resize-none leading-relaxed transition-all"
          />

          {isStreaming ? (
            <button
              type="button"
              id="stop-streaming-btn"
              onClick={onStopStreaming}
              className="absolute right-2.5 bottom-2.5 sm:right-3 sm:bottom-3 p-2 sm:p-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-500 transition-colors shadow-lg shadow-rose-900/40 cursor-pointer"
              title="Stop Streaming"
            >
              <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              id="send-message-btn"
              onClick={submit}
              disabled={!inputText.trim()}
              className="absolute right-2.5 bottom-2.5 sm:right-3 sm:bottom-3 p-2 sm:p-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-900/40 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Send (Enter)"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
        </div>

        {/* Footnote */}
        <div className="flex justify-between items-center px-1 text-[10px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span>Shift + Enter for newline</span>
            {inputText.trim().length > 0 && (
              <span className="font-mono text-zinc-400 flex items-center gap-1">
                <Coins className="w-2.5 h-2.5 text-indigo-400/70 shrink-0" />
                Input: ~{estimateTokens(inputText)} tokens
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
