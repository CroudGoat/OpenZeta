'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Sparkles,
  ChevronDown,
  Square,
} from 'lucide-react';
import {
  Character,
  Message,
  UserSettings,
  TokenUsage,
  addMessage,
  getMessages,
  clearMessages,
  deleteMessage,
} from '@/lib/db';
import {
  streamChatCompletion,
  fetchSmartReplies,
  estimateTokens,
} from '@/lib/llm-client';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatMessageItem } from '@/components/chat/ChatMessageItem';
import { ChatInputArea } from '@/components/chat/ChatInputArea';

interface ChatAreaProps {
  character: Character | null;
  settings: UserSettings;
  onOpenEditCharacterModal: () => void;
  onOpenSettingsModal: () => void;
  onToggleMobileSidebar: () => void;
  onCharacterUpdated: () => void;
}

export function ChatArea({
  character,
  settings,
  onOpenEditCharacterModal,
  onOpenSettingsModal,
  onToggleMobileSidebar,
  onCharacterUpdated,
}: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [isLoadingSmartReplies, setIsLoadingSmartReplies] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showTokenUsagePopover, setShowTokenUsagePopover] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const pendingStreamTextRef = useRef<string>('');

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowOptionsMenu(false);
      setShowTokenUsagePopover(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Compute conversation token usage stats
  const conversationStats = useMemo(() => {
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.tokens) {
        promptTokens += m.tokens.promptTokens || 0;
        completionTokens += m.tokens.completionTokens || 0;
        totalTokens += m.tokens.totalTokens || (m.tokens.promptTokens + m.tokens.completionTokens);
      } else {
        const est = estimateTokens(m.content);
        if (m.role === 'assistant') {
          completionTokens += est;
        } else {
          promptTokens += est;
        }
        totalTokens += est;
      }
    }

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      messageCount: messages.length,
    };
  }, [messages]);

  // Load messages when character changes
  useEffect(() => {
    if (!character) return;

    let isMounted = true;
    const charId = character.id;
    const charGreeting = character.greeting;

    getMessages(charId).then((loaded) => {
      if (!isMounted) return;
      if (loaded.length === 0 && charGreeting) {
        const initialGreetingMsg: Message = {
          id: `initial-greeting-${charId}`,
          characterId: charId,
          role: 'assistant',
          content: charGreeting,
          createdAt: Date.now(),
        };
        addMessage(initialGreetingMsg).then(() => {
          if (isMounted) {
            setMessages([initialGreetingMsg]);
            setSmartReplies([]);
          }
        });
      } else {
        setMessages(loaded);
        setSmartReplies([]);
      }
    });

    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [character]);

  // High-performance scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (chatScrollContainerRef.current) {
      if (behavior === 'smooth') {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
      }
    }
  }, []);

  // Auto-scroll when at bottom without causing smooth-scroll jank during streaming
  useEffect(() => {
    if (isAtBottom) {
      if (isStreaming) {
        // Instant direct scrollTop during streaming avoids smooth animation loop locks
        if (chatScrollContainerRef.current) {
          chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
        }
      } else {
        scrollToBottom('smooth');
      }
    }
  }, [messages, streamingContent, isAtBottom, isStreaming, scrollToBottom]);

  // Handle scroll detection
  const handleScroll = useCallback(() => {
    if (!chatScrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsAtBottom(distanceFromBottom < 100);
  }, []);

  // Adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        180
      )}px`;
    }
  }, [inputText]);

  // Actions
  const handleCopyMessage = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  }, []);

  const handleDeleteSingleMessage = useCallback(async (msgId: string) => {
    if (!character) return;
    await deleteMessage(msgId);
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  }, [character]);

  const handleClearHistory = useCallback(async () => {
    if (!character) return;
    if (confirm('このキャラクターとの会話履歴をリセットしますか？')) {
      await clearMessages(character.id, character.greeting);
      const reloaded = await getMessages(character.id);
      setMessages(reloaded);
      setSmartReplies([]);
      setShowOptionsMenu(false);
    }
  }, [character]);

  // Throttled streaming update using requestAnimationFrame
  const scheduleStreamingUpdate = useCallback((accumulated: string) => {
    pendingStreamTextRef.current = accumulated;
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        setStreamingContent(pendingStreamTextRef.current);
        rafIdRef.current = null;
      });
    }
  }, []);

  // ---------------------------------------------------------------
  // Shared streaming helpers (used by send + regenerate)
  // ---------------------------------------------------------------

  type StreamOutcome =
    | { status: 'ok' | 'aborted'; content: string; usage: TokenUsage }
    | { status: 'error'; error: Error };

  const estimateUsage = (prompt: string, completion: string): TokenUsage => {
    const promptTokens = estimateTokens(prompt);
    const completionTokens = estimateTokens(completion);
    return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
  };

  /**
   * Runs one streaming completion against the configured endpoint and
   * normalises the outcome (ok / aborted / error) plus token usage.
   * All streaming UI state (isStreaming, streamingContent, raf) is fully
   * reset here in the finally block.
   */
  const runCompletionStream = useCallback(
    async (history: Message[], promptText: string): Promise<StreamOutcome> => {
      if (!character) return { status: 'error', error: new Error('No character selected') };

      let accumulatedText = '';
      let capturedUsage: TokenUsage | null = null;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const streamRes = await streamChatCompletion({
          character,
          history,
          latestUserMessage: promptText,
          settings,
          signal: controller.signal,
          onChunk: (chunk) => {
            accumulatedText += chunk;
            scheduleStreamingUpdate(accumulatedText);
          },
          onUsage: (usage) => {
            capturedUsage = usage;
          },
        });

        if (streamRes?.usage) {
          capturedUsage = streamRes.usage;
        }

        return {
          status: 'ok',
          content: accumulatedText.trim() || '...',
          usage: capturedUsage || estimateUsage(promptText, accumulatedText),
        };
      } catch (err: unknown) {
        const error = err as Error;
        if (error.name === 'AbortError') {
          return {
            status: 'aborted',
            content: accumulatedText.trim(),
            usage: capturedUsage || estimateUsage(promptText, accumulatedText),
          };
        }
        return { status: 'error', error };
      } finally {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        setIsStreaming(false);
        setStreamingMessageId(null);
        setStreamingContent('');
        pendingStreamTextRef.current = '';
        abortControllerRef.current = null;
      }
    },
    [character, settings, scheduleStreamingUpdate]
  );

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isStreaming || !character) return;

    setInputText('');
    setSmartReplies([]);

    // 1. Save user message to Dexie
    const userMsg: Message = {
      id: crypto.randomUUID(),
      characterId: character.id,
      role: 'user',
      content: text,
      createdAt: Date.now(),
      tokens: {
        promptTokens: estimateTokens(text),
        completionTokens: 0,
        totalTokens: estimateTokens(text),
      },
    };
    await addMessage(userMsg);

    // 2. Prepare streaming assistant message placeholder
    const assistantMsgId = crypto.randomUUID();
    const tempAssistantMsg: Message = {
      id: assistantMsgId,
      characterId: character.id,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      variants: [],
      variantIndex: 0,
    };

    const updatedHistory = [...messages, userMsg];
    setMessages([...updatedHistory, tempAssistantMsg]);
    setIsStreaming(true);
    setStreamingMessageId(assistantMsgId);
    setStreamingContent('');
    pendingStreamTextRef.current = '';

    // 3. Stream the completion
    const outcome = await runCompletionStream(updatedHistory, text);

    if (outcome.status === 'error') {
      console.error('Chat error:', outcome.error);
      const errMsg: Message = {
        id: assistantMsgId,
        characterId: character.id,
        role: 'assistant',
        content: `⚠️ エラーが発生しました: ${outcome.error.message}\n\n「Settings」で Base URL や API Key を確認してください。`,
        createdAt: Date.now(),
        variants: [`⚠️ エラーが発生しました: ${outcome.error.message}`],
        variantIndex: 0,
      };
      await addMessage(errMsg);
      setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? errMsg : m)));
      return;
    }

    // Aborted with no content: leave the (empty) placeholder as is
    if (outcome.status === 'aborted' && outcome.content === '') return;

    // 4. Save completed assistant message to Dexie
    const finalAssistantMsg: Message = {
      ...tempAssistantMsg,
      content: outcome.content,
      variants: [outcome.content],
      variantIndex: 0,
      tokens: outcome.usage,
      variantTokens: [outcome.usage],
    };
    await addMessage(finalAssistantMsg);
    setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? finalAssistantMsg : m)));
    onCharacterUpdated();
  };

  const handleStopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Select message variant (switch between generated versions)
  const handleSelectVariant = useCallback(
    async (msgId: string, newIndex: number) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId) return m;
          const variants = m.variants || [m.content];
          const newContent =
            variants[newIndex] !== undefined ? variants[newIndex] : m.content;
          const newTokens = m.variantTokens?.[newIndex] || m.tokens;

          const updated: Message = {
            ...m,
            content: newContent,
            variantIndex: newIndex,
            tokens: newTokens,
          };

          if (newIndex < variants.length) {
            addMessage(updated).catch(console.error);
          }
          return updated;
        })
      );
    },
    []
  );

  // Regenerate last response (create a new variant)
  const handleRegenerate = useCallback(async () => {
    if (isStreaming || messages.length === 0 || !character) return;
    const lastUserMsgIdx = [...messages].reverse().findIndex((m) => m.role === 'user');

    let targetAssistantMsg: Message | undefined;
    let trimmedHistory: Message[] = [];
    let userPromptText = 'こんにちは！';

    if (lastUserMsgIdx !== -1) {
      const actualUserIdx = messages.length - 1 - lastUserMsgIdx;
      const lastUserMsg = messages[actualUserIdx];
      userPromptText = lastUserMsg.content;
      trimmedHistory = messages.slice(0, actualUserIdx + 1);
      targetAssistantMsg = messages[actualUserIdx + 1] || messages[messages.length - 1];
    } else {
      trimmedHistory = [];
      targetAssistantMsg = messages[0];
    }

    if (!targetAssistantMsg || targetAssistantMsg.role !== 'assistant') {
      targetAssistantMsg = {
        id: crypto.randomUUID(),
        characterId: character.id,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      };
    }

    const currentVariants =
      targetAssistantMsg.variants && targetAssistantMsg.variants.length > 0
        ? [...targetAssistantMsg.variants]
        : targetAssistantMsg.content
          ? [targetAssistantMsg.content]
          : [];

    const currentVariantTokens =
      targetAssistantMsg.variantTokens && targetAssistantMsg.variantTokens.length > 0
        ? [...targetAssistantMsg.variantTokens]
        : targetAssistantMsg.tokens
          ? [targetAssistantMsg.tokens]
          : [];

    const inFlightVariantIndex = currentVariants.length;

    const inFlightTargetMsg: Message = {
      ...targetAssistantMsg,
      variants: currentVariants,
      variantIndex: inFlightVariantIndex,
      variantTokens: currentVariantTokens,
    };

    setMessages((prev) => {
      const exists = prev.some((m) => m.id === inFlightTargetMsg.id);
      if (exists) {
        return prev.map((m) => (m.id === inFlightTargetMsg.id ? inFlightTargetMsg : m));
      }
      return [...trimmedHistory, inFlightTargetMsg];
    });

    setIsStreaming(true);
    setStreamingMessageId(inFlightTargetMsg.id);
    setStreamingContent('');
    pendingStreamTextRef.current = '';

    const outcome = await runCompletionStream(trimmedHistory, userPromptText);

    if (outcome.status === 'error') {
      console.error('Chat regenerate error:', outcome.error);
      return;
    }
    if (outcome.status === 'aborted' && outcome.content === '') return;

    const newVariants = [...currentVariants, outcome.content];
    const newVariantIndex = newVariants.length - 1;
    const newVariantTokens = [...currentVariantTokens, outcome.usage];

    const assistantMsg: Message = {
      ...targetAssistantMsg,
      content: outcome.content,
      variants: newVariants,
      variantIndex: newVariantIndex,
      tokens: outcome.usage,
      variantTokens: newVariantTokens,
    };

    await addMessage(assistantMsg);
    setMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? assistantMsg : m)));
    if (outcome.status === 'ok') {
      onCharacterUpdated();
    }
  }, [
    isStreaming,
    messages,
    character,
    onCharacterUpdated,
    runCompletionStream,
  ]);

  // Generate Smart Replies
  const handleGenerateSmartReplies = useCallback(async () => {
    if (!character || isLoadingSmartReplies || isStreaming) return;
    setIsLoadingSmartReplies(true);
    try {
      const replies = await fetchSmartReplies(character, messages, settings);
      setSmartReplies(replies);
    } catch (err) {
      console.error('Failed to generate smart replies:', err);
    } finally {
      setIsLoadingSmartReplies(false);
    }
  }, [character, isLoadingSmartReplies, isStreaming, messages, settings]);

  if (!character) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center bg-[#09090b] text-zinc-100">
        <div className="w-16 h-16 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mb-4 shadow-lg shadow-indigo-950/50">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-zinc-100 mb-2">
          OpenZeta へようこそ
        </h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
          左側のサイドバーからキャラクターを選択するか、新しくキャラクターを作成して対話を始めましょう。
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col bg-[#09090b] relative overflow-hidden">
      {/* Header */}
      <ChatHeader
        character={character}
        settings={settings}
        conversationStats={conversationStats}
        showOptionsMenu={showOptionsMenu}
        setShowOptionsMenu={setShowOptionsMenu}
        showTokenUsagePopover={showTokenUsagePopover}
        setShowTokenUsagePopover={setShowTokenUsagePopover}
        onOpenEditCharacterModal={onOpenEditCharacterModal}
        onOpenSettingsModal={onOpenSettingsModal}
        onToggleMobileSidebar={onToggleMobileSidebar}
        onClearHistory={handleClearHistory}
      />

      {/* Messages Scroll View */}
      <div
        ref={chatScrollContainerRef}
        onScroll={handleScroll}
        id="chat-messages-container"
        className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6"
      >
        {messages.map((msg, index) => {
          const isThisStreaming = isStreaming && streamingMessageId === msg.id;
          const isLatestAssistant =
            msg.role === 'assistant' &&
            index === messages.length - 1 &&
            !isStreaming;

          return (
            <ChatMessageItem
              key={msg.id}
              message={msg}
              character={character}
              isLatestAssistant={isLatestAssistant}
              copiedMsgId={copiedMsgId}
              isStreamingActive={isThisStreaming}
              streamingContent={isThisStreaming ? streamingContent : undefined}
              onCopy={handleCopyMessage}
              onRegenerate={handleRegenerate}
              onDelete={handleDeleteSingleMessage}
              onSelectVariant={handleSelectVariant}
            />
          );
        })}

        {/* Global Stop Streaming Indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2 px-2 animate-in fade-in duration-150">
            <span className="text-[11px] text-indigo-400 font-medium animate-pulse flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
              生成中...
            </span>
            <button
              type="button"
              onClick={handleStopStreaming}
              className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              停止
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {!isAtBottom && (
        <button
          type="button"
          id="scroll-to-bottom-btn"
          onClick={() => scrollToBottom('smooth')}
          className="absolute right-8 bottom-36 z-30 p-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 shadow-xl transition-all cursor-pointer"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}

      {/* Input Area */}
      <ChatInputArea
        inputText={inputText}
        setInputText={setInputText}
        isStreaming={isStreaming}
        characterName={character.name}
        smartReplies={smartReplies}
        isLoadingSmartReplies={isLoadingSmartReplies}
        textareaRef={textareaRef}
        onSendMessage={handleSendMessage}
        onStopStreaming={handleStopStreaming}
        onGenerateSmartReplies={handleGenerateSmartReplies}
      />
    </div>
  );
}
