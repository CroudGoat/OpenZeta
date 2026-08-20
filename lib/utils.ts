import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { UserSettings, DEFAULT_SETTINGS } from "./db"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely extracts human-readable error messages from unknown error instances
 */
export function getErrorMessage(error: unknown, fallback = '不明なエラーが発生しました'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

/**
 * Normalizes user settings with default fallbacks
 */
export function normalizeSettings(settings?: Partial<UserSettings> | null): UserSettings {
  if (!settings) return DEFAULT_SETTINGS;
  return {
    id: 'default',
    userName: settings.userName?.trim() || DEFAULT_SETTINGS.userName || 'ユーザー',
    userBio: settings.userBio?.trim() ?? DEFAULT_SETTINGS.userBio ?? '',
    baseUrl: settings.baseUrl?.trim() || DEFAULT_SETTINGS.baseUrl,
    apiKey: settings.apiKey?.trim() ?? DEFAULT_SETTINGS.apiKey ?? '',
    modelName: settings.modelName?.trim() || DEFAULT_SETTINGS.modelName,
    temperature: typeof settings.temperature === 'number' ? settings.temperature : DEFAULT_SETTINGS.temperature,
    maxHistoryCount: settings.maxHistoryCount || DEFAULT_SETTINGS.maxHistoryCount,
  };
}

