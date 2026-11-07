'use client';

import React from 'react';
import { Bot } from 'lucide-react';

interface AvatarImageProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isUser?: boolean;
  className?: string;
}

const AVATAR_DATA_URL_REGEX = /^data:image\/(png|jpe?g|webp|gif|svg\+xml|bmp|avif);/i;
const AVATAR_HTTPS_REGEX = /^https:\/\//i;

/**
 * Only allow safe image sources for avatars (image data-URLs or https).
 * Anything else (javascript:, data:text/html, http, file:, blob:...) falls
 * back to the generated initials avatar.
 */
export function isValidAvatarSrc(src: string | undefined): src is string {
  if (!src || typeof src !== 'string') return false;
  return AVATAR_DATA_URL_REGEX.test(src) || AVATAR_HTTPS_REGEX.test(src);
}

export function AvatarImage({
  src,
  name,
  size = 'md',
  isUser = false,
  className = '',
}: AvatarImageProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  // Elegant Dark palette: deep translucent tones with glowing colored borders
  const getAvatarStyle = (str: string) => {
    if (isUser) return 'bg-zinc-700 border border-zinc-600 text-zinc-100 font-sans font-bold';
    const styles = [
      'bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 font-serif italic',
      'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-serif italic',
      'bg-amber-950/80 border border-amber-500/40 text-amber-300 font-serif italic',
      'bg-rose-950/80 border border-rose-500/40 text-rose-300 font-serif italic',
      'bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-serif italic',
      'bg-purple-950/80 border border-purple-500/40 text-purple-300 font-serif italic',
      'bg-teal-950/80 border border-teal-500/40 text-teal-300 font-serif italic',
      'bg-blue-950/80 border border-blue-500/40 text-blue-300 font-serif italic',
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return styles[Math.abs(hash) % styles.length];
  };

  const initial = name ? name.trim().charAt(0).toUpperCase() : (isUser ? 'ME' : 'Z');

  if (isValidAvatarSrc(src)) {
    return (
      <div
        className={`relative rounded-full overflow-hidden shrink-0 border border-zinc-800 shadow-sm bg-zinc-900 ${sizeClasses[size]} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-full shrink-0 flex items-center justify-center select-none shadow-sm transition-all ${getAvatarStyle(
        name
      )} ${sizeClasses[size]} ${className}`}
    >
      {isUser ? (
        <span className="text-[10px] font-bold tracking-tight">ME</span>
      ) : initial ? (
        <span>{initial}</span>
      ) : (
        <Bot className="w-1/2 h-1/2" />
      )}
    </div>
  );
}

