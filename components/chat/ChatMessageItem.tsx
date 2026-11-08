'use client';

import React, { useMemo } from 'react';
import Markdown from 'react-markdown';
import { AlignLeft, Coins, Copy, Check, RotateCcw, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Character, Message } from '@/lib/db';
import { parseMessageSegments } from '@/lib/message-parser';
import { estimateTokens } from '@/lib/llm-client';
import { AvatarImage } from '../AvatarImage';

interface ChatMessageItemProps {
  message: Message;
  character: Character;
  isLatestAssistant: boolean;
  copiedMsgId: string | null;
  isStreamingActive?: boolean;
  streamingContent?: string;
  onCopy: (id: string, content: string) => void;
  onRegenerate: () => void;
  onDelete: (id: string) => void;
  onSelectVariant?: (id: string, index: number) => void;
}

const userMarkdownComponents = {
  em: ({ children }: { children?: React.ReactNode }) => (
    <span className="italic text-indigo-200/80 font-normal">{children}</span>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1.5 last:mb-0 leading-relaxed whitespace-pre-wrap">{children}</p>
  ),
};

const characterMarkdownComponents = {
  em: ({ children }: { children?: React.ReactNode }) => (
    <span className="italic text-zinc-400 font-normal">{children}</span>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1.5 last:mb-0 leading-relaxed whitespace-pre-wrap">{children}</p>
  ),
};

export const ChatMessageItem = React.memo(
  function ChatMessageItem({
    message,
    character,
    isLatestAssistant,
    copiedMsgId,
    isStreamingActive = false,
    streamingContent = '',
    onCopy,
    onRegenerate,
    onDelete,
    onSelectVariant,
  }: ChatMessageItemProps) {
    const isUser = message.role === 'user';

  const savedVariants = useMemo(() => {
    if (message.variants && message.variants.length > 0) {
      return message.variants;
    }
    return message.content ? [message.content] : [];
  }, [message.variants, message.content]);

  // Display variants list including in-flight streaming variant
  const displayVariants = useMemo(() => {
    if (isStreamingActive) {
      if (savedVariants.length > 0) {
        return [...savedVariants, streamingContent];
      }
      return [streamingContent];
    }
    return savedVariants.length > 0 ? savedVariants : [message.content];
  }, [isStreamingActive, savedVariants, streamingContent, message.content]);

  const totalVariants = displayVariants.length;

  const currentVariantIndex = useMemo(() => {
    if (
      typeof message.variantIndex === 'number' &&
      message.variantIndex >= 0 &&
      message.variantIndex < totalVariants
    ) {
      return message.variantIndex;
    }
    return Math.max(0, totalVariants - 1);
  }, [message.variantIndex, totalVariants]);

  // Are we currently viewing the active streaming slot?
  const isViewingStreamingVariant =
    isStreamingActive && currentVariantIndex === totalVariants - 1;

  const currentContent = displayVariants[currentVariantIndex] ?? '';

  const segments = useMemo(() => {
    if (isViewingStreamingVariant && !currentContent.trim()) {
      return [];
    }
    return parseMessageSegments(currentContent, character.name, message.role);
  }, [currentContent, character.name, message.role, isViewingStreamingVariant]);

  const currentTokens = useMemo(() => {
    if (isViewingStreamingVariant) {
      return null;
    }
    if (message.variantTokens && message.variantTokens[currentVariantIndex]) {
      return message.variantTokens[currentVariantIndex];
    }
    return message.tokens;
  }, [isViewingStreamingVariant, message.variantTokens, currentVariantIndex, message.tokens]);

  const tokenLabel = useMemo(() => {
    if (currentTokens) {
      return `${currentTokens.totalTokens}t`;
    }
    return `~${estimateTokens(currentContent)}t`;
  }, [currentTokens, currentContent]);

  return (
    <div
      id={`message-${message.id}`}
      className="w-full space-y-3.5 group animate-in fade-in duration-200"
    >
      {/* If viewing in-flight stream and no content yet, show pulse loader */}
      {isViewingStreamingVariant && !currentContent.trim() && (
        <div className="flex items-start gap-2.5 sm:gap-3 mr-auto max-w-[88%] sm:max-w-xl lg:max-w-2xl animate-in fade-in duration-150">
          <div className="shrink-0 mt-0.5">
            <AvatarImage src={character.avatarBase64} name={character.name} size="sm" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col items-start">
            <span className="text-xs text-zinc-400 font-medium mb-1 ml-0.5">
              {character.name}
            </span>
            <div className="bg-[#18181b] border border-zinc-800/80 rounded-2xl rounded-tl-xs px-4 py-3 text-zinc-400 text-sm shadow-xs">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse delay-75" />
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse delay-150" />
                </div>
                <span className="text-xs text-zinc-400 italic">応答を作成中...</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {segments.map((seg, segIdx) => {
        const isLastSegment = segIdx === segments.length - 1;

        if (seg.type === 'narration') {
          return (
            <div
              key={`${message.id}-seg-${segIdx}`}
              className="flex items-start gap-3 py-1.5 px-2 text-zinc-300 text-sm leading-relaxed italic max-w-2xl animate-in fade-in duration-150"
            >
              <div className="shrink-0 mt-1 text-zinc-500 flex items-center justify-center">
                <AlignLeft className="w-4 h-4 opacity-75" />
              </div>
              <div className="flex-1 font-light tracking-wide break-words select-text">
                <Markdown>{seg.content}</Markdown>
                {isViewingStreamingVariant && isLastSegment && (
                  <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-indigo-500 animate-pulse rounded-full" />
                )}
              </div>
            </div>
          );
        }

        if (seg.isUser) {
          return (
            <div
              key={`${message.id}-seg-${segIdx}`}
              className="flex flex-col items-end ml-auto max-w-[88%] sm:max-w-xl lg:max-w-2xl animate-in fade-in duration-150"
            >
              <div className="flex items-center gap-1.5 mb-1 mr-1 text-xs text-zinc-400 font-medium">
                <span>{seg.speakerName || 'あなた'}</span>
                <div className="w-5 h-5 rounded-full bg-zinc-700 text-zinc-300 flex items-center justify-center text-[9px] font-bold shadow-xs">
                  ME
                </div>
              </div>
              <div className="bg-indigo-600 shadow-md shadow-indigo-950/30 text-white rounded-2xl rounded-tr-xs px-4 py-3 text-sm leading-relaxed break-words max-w-full">
                <div className="prose prose-invert max-w-none break-words text-white text-sm leading-relaxed [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&_code]:bg-indigo-700/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
                  <Markdown components={userMarkdownComponents}>{seg.content}</Markdown>
                </div>
              </div>
            </div>
          );
        }

        // Character dialogue
        return (
          <div
            key={`${message.id}-seg-${segIdx}`}
            className="flex items-start gap-2.5 sm:gap-3 mr-auto max-w-[88%] sm:max-w-xl lg:max-w-2xl animate-in fade-in duration-150"
          >
            <div className="shrink-0 mt-0.5">
              <AvatarImage src={character.avatarBase64} name={character.name} size="sm" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col items-start">
              <span className="text-xs text-zinc-400 font-medium mb-1 ml-0.5">
                {seg.speakerName || character.name}
              </span>
              <div className="bg-[#18181b] border border-zinc-800/80 rounded-2xl rounded-tl-xs px-4 py-3 text-zinc-200 text-sm leading-relaxed shadow-xs relative group/bubble w-fit max-w-full">
                <div className="prose prose-invert max-w-none break-words text-zinc-200 text-sm leading-relaxed [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
                  <Markdown components={characterMarkdownComponents}>{seg.content}</Markdown>
                  {isViewingStreamingVariant && isLastSegment && (
                    <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-indigo-500 animate-pulse rounded-full" />
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Message Actions Toolbar */}
      <div
        className={`flex items-center gap-2 text-[10px] text-zinc-500 ${
          totalVariants > 1 ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
        } transition-opacity px-2 ${
          isUser ? 'justify-end' : 'justify-start'
        }`}
      >
        {/* Variant / Version Switcher (Arrow Navigation) */}
        {totalVariants > 1 && (
          <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 rounded-md px-1 py-0.5 text-zinc-400 select-none shadow-xs">
            <button
              type="button"
              disabled={currentVariantIndex === 0}
              onClick={() => onSelectVariant?.(message.id, currentVariantIndex - 1)}
              className="p-0.5 rounded hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer transition-colors"
              title="前の回答 (1つ前)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] px-1 text-zinc-300 font-mono font-medium">
              {currentVariantIndex + 1} / {totalVariants}
            </span>
            <button
              type="button"
              disabled={currentVariantIndex === totalVariants - 1}
              onClick={() => onSelectVariant?.(message.id, currentVariantIndex + 1)}
              className="p-0.5 rounded hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer transition-colors"
              title="次の回答 (1つ後)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <span className="font-mono opacity-70">
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>

        {/* Token Usage Badge */}
        <span
          className="font-mono text-[9.5px] text-zinc-500 flex items-center gap-1 bg-zinc-900/90 px-1.5 py-0.5 rounded border border-zinc-800/80"
          title={
            currentTokens
              ? `Token Usage: ${currentTokens.totalTokens.toLocaleString()} (Prompt: ${currentTokens.promptTokens} • Output: ${currentTokens.completionTokens})`
              : `Estimated: ~${estimateTokens(currentContent)} tokens`
          }
        >
          <Coins className="w-2.5 h-2.5 text-indigo-400/70 shrink-0" />
          {tokenLabel}
        </span>

        <button
          type="button"
          onClick={() => onCopy(message.id, currentContent)}
          className="p-1 rounded hover:bg-zinc-800 hover:text-zinc-300 transition-colors cursor-pointer"
          title="本文をコピー"
        >
          {copiedMsgId === message.id ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>

        {isLatestAssistant && (
          <button
            type="button"
            onClick={onRegenerate}
            className="p-1 rounded hover:bg-zinc-800 hover:text-indigo-400 transition-colors cursor-pointer flex items-center gap-0.5"
            title="別の返答を再生成"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}

        <button
          type="button"
          onClick={() => onDelete(message.id)}
          className="p-1 rounded hover:bg-rose-500/10 hover:text-rose-400 transition-colors cursor-pointer"
          title="メッセージを削除"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
},
(a, b) =>
  // Re-render only when something this row actually shows has changed.
  a.isStreamingActive === b.isStreamingActive &&
  a.streamingContent === b.streamingContent &&
  a.isLatestAssistant === b.isLatestAssistant &&
  (a.copiedMsgId === a.message.id) === (b.copiedMsgId === b.message.id) &&
  a.character.id === b.character.id &&
  a.character.name === b.character.name &&
  a.character.avatarBase64 === b.character.avatarBase64 &&
  a.message.id === b.message.id &&
  a.message.content === b.message.content &&
  a.message.variantIndex === b.message.variantIndex &&
  a.message.variants?.length === b.message.variants?.length &&
  a.message.tokens === b.message.tokens
);
