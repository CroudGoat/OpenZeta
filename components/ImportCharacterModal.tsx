'use client';

import React, { useState } from 'react';
import { X, Upload, Check, AlertCircle, FileJson } from 'lucide-react';
import { Character, saveCharacter } from '@/lib/db';
import { useModalDismiss } from '@/hooks/use-modal-dismiss';
import { AvatarImage } from './AvatarImage';

interface ImportCharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCharacterImported: (character: Character) => void;
}

export function ImportCharacterModal({
  isOpen,
  onClose,
  onCharacterImported,
}: ImportCharacterModalProps) {
  const [parsedChar, setParsedChar] = useState<Partial<Character> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useModalDismiss(isOpen, onClose);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const json = JSON.parse(text);

        // Handle both direct Character object and { character: Character } format
        const charData = json.character || json;

        if (!charData.name || !charData.systemPrompt) {
          throw new Error(
            '無効なキャラクター形式です。「name」および「systemPrompt」が必要です。'
          );
        }

        setParsedChar({
          id: crypto.randomUUID(),
          name: charData.name,
          avatarBase64: charData.avatarBase64,
          greeting: charData.greeting || 'こんにちは！',
          systemPrompt: charData.systemPrompt,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } catch (err: unknown) {
        const error = err as Error;
        setErrorMsg(error.message || 'JSONファイルの解析に失敗しました。');
        setParsedChar(null);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!parsedChar || !parsedChar.name || !parsedChar.systemPrompt) return;

    setIsSaving(true);
    try {
      const fullCharacter: Character = {
        id: parsedChar.id || crypto.randomUUID(),
        name: parsedChar.name,
        avatarBase64: parsedChar.avatarBase64,
        greeting: parsedChar.greeting || 'こんにちは！',
        systemPrompt: parsedChar.systemPrompt,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveCharacter(fullCharacter);
      onCharacterImported(fullCharacter);
      onClose();
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'キャラクターの保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="import-character-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="import-character-modal"
        className="relative w-full max-w-lg flex flex-col bg-[#0c0c0e] text-zinc-100 rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#09090b]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <FileJson className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                キャラクターJSONインポート
              </h2>
              <p className="text-xs text-zinc-500">
                OpenZeta形式のキャラクター設定JSONを読み込みます
              </p>
            </div>
          </div>
          <button
            id="close-import-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {!parsedChar ? (
            <label
              className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 rounded-2xl bg-zinc-900/30 hover:bg-zinc-900/60 cursor-pointer transition-all text-center"
            >
              <div className="p-3 rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-500/30">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-200">
                  JSONファイルを選択またはドロップ
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  .json ファイル（最大 5MB）
                </p>
              </div>
              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-start gap-4">
                <AvatarImage
                  src={parsedChar.avatarBase64}
                  name={parsedChar.name || ''}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-zinc-100 truncate">
                    {parsedChar.name}
                  </h3>
                  <p className="text-xs text-zinc-400 line-clamp-2 mt-1">
                    {parsedChar.greeting}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                  <span className="font-semibold text-zinc-500 block mb-1">
                    システムプロンプト (抜粋):
                  </span>
                  <p className="font-mono text-zinc-400 line-clamp-3">
                    {parsedChar.systemPrompt}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setParsedChar(null)}
                className="text-xs text-indigo-400 hover:underline cursor-pointer"
              >
                別のファイルを選択する
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-[#09090b]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            キャンセル
          </button>
          {parsedChar && (
            <button
              type="button"
              id="confirm-import-character-btn"
              onClick={handleConfirmImport}
              disabled={isSaving}
              className="px-5 py-2 text-sm font-medium rounded-md bg-zinc-100 text-zinc-950 hover:bg-white shadow-sm transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              {isSaving ? 'インポート中...' : 'このキャラを保存'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
