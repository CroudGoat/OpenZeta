'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Character,
  UserSettings,
  DEFAULT_SETTINGS,
  initializeDatabase,
  getCharacters,
  getSettings,
  saveSettings,
} from '@/lib/db';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/Sidebar';
import { ChatArea } from '@/components/ChatArea';

// Modals are opened on demand, so keep them out of the initial bundle.
const CharacterModal = dynamic(() => import('@/components/CharacterModal').then((m) => m.CharacterModal), { ssr: false });
const SettingsModal = dynamic(() => import('@/components/SettingsModal').then((m) => m.SettingsModal), { ssr: false });
const ImportCharacterModal = dynamic(() => import('@/components/ImportCharacterModal').then((m) => m.ImportCharacterModal), { ssr: false });

export default function Home() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isCharacterModalOpen, setIsCharacterModalOpen] = useState(false);
  const [characterToEdit, setCharacterToEdit] = useState<Character | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Load all characters and settings from Dexie.js
  const refreshData = useCallback(async (selectId?: string) => {
    try {
      const [loadedChars, loadedSettings] = await Promise.all([
        getCharacters(),
        getSettings(),
      ]);

      setCharacters(loadedChars);
      setSettings(loadedSettings);

      if (selectId) {
        setSelectedCharacterId(selectId);
      } else {
        setSelectedCharacterId((prev) => {
          if (prev && loadedChars.some((c) => c.id === prev)) {
            return prev;
          }
          return loadedChars.length > 0 ? loadedChars[0].id : null;
        });
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize DB on first render
  useEffect(() => {
    async function init() {
      await initializeDatabase();
      await refreshData();
    }
    init();
  }, [refreshData]);

  const activeCharacter = characters.find((c) => c.id === selectedCharacterId) || null;

  const handleOpenNewCharacter = () => {
    setCharacterToEdit(null);
    setIsCharacterModalOpen(true);
    setIsMobileSidebarOpen(false);
  };

  const handleOpenEditCharacter = (char?: Character) => {
    setCharacterToEdit(char || activeCharacter);
    setIsCharacterModalOpen(true);
  };

  const handleCharacterSaved = (savedChar: Character) => {
    refreshData(savedChar.id);
  };

  const handleCharacterImported = (importedChar: Character) => {
    refreshData(importedChar.id);
  };

  const handleSelectCharacter = (id: string) => {
    setSelectedCharacterId(id);
    setIsMobileSidebarOpen(false);
  };

  const handleSelectProfile = async (id: string) => {
    if (id === settings.activeProfileId) return;
    const updated: UserSettings = { ...settings, activeProfileId: id };
    setSettings(updated);
    await saveSettings(updated);
  };

  const sidebarProps = {
    characters,
    selectedCharacterId,
    onSelectCharacter: handleSelectCharacter,
    onOpenNewCharacterModal: handleOpenNewCharacter,
    onOpenEditCharacterModal: handleOpenEditCharacter,
    onCharactersChanged: () => refreshData(),
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-xl animate-pulse">
            Z
          </div>
          <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
            OpenZeta を初期化中...
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Desktop Sidebar */}
      <Sidebar
        {...sidebarProps}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        className="hidden md:flex"
      />

      {/* Mobile Drawer Backdrop & Sidebar */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="relative w-80 max-w-[85vw] h-full z-10 animate-in slide-in-from-left duration-200">
            <Sidebar
              {...sidebarProps}
              onOpenSettingsModal={() => {
                setIsMobileSidebarOpen(false);
                setIsSettingsModalOpen(true);
              }}
              onOpenImportModal={() => {
                setIsMobileSidebarOpen(false);
                setIsImportModalOpen(true);
              }}
              className="w-full h-full shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Right Main Chat Area */}
      <ChatArea
        character={activeCharacter}
        settings={settings}
        onOpenEditCharacterModal={() => handleOpenEditCharacter(activeCharacter || undefined)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
        onCharacterUpdated={() => refreshData()}
        onSelectProfile={handleSelectProfile}
      />

      {/* Modals (lazy chunks, mounted only while open) */}
      {isCharacterModalOpen && (
        <CharacterModal
          isOpen
          onClose={() => setIsCharacterModalOpen(false)}
          characterToEdit={characterToEdit}
          onSaved={handleCharacterSaved}
        />
      )}

      {isSettingsModalOpen && (
        <SettingsModal
          isOpen
          onClose={() => setIsSettingsModalOpen(false)}
          settings={settings}
          onSettingsSaved={(newSettings) => setSettings(newSettings)}
        />
      )}

      {isImportModalOpen && (
        <ImportCharacterModal
          isOpen
          onClose={() => setIsImportModalOpen(false)}
          onCharacterImported={handleCharacterImported}
        />
      )}
    </main>
  );
}
