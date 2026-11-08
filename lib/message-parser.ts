export type SegmentType = 'dialogue' | 'narration';

export interface MessageSegment {
  id: string;
  type: SegmentType;
  speakerName?: string;
  isUser: boolean;
  content: string;
}

const NARRATION_SET = new Set([
  'ナレーター',
  'ナレーション',
  '地の文',
  '情景',
  'narrator',
  'narration',
  'scene',
]);

const USER_SET = new Set([
  'ユーザー',
  'あなた',
  '自分',
  '私',
  'user',
  'me',
  'player',
]);

function isNarrationSpeaker(speaker: string): boolean {
  return NARRATION_SET.has(speaker.trim().toLowerCase());
}

function isUserSpeaker(speaker: string): boolean {
  return USER_SET.has(speaker.trim().toLowerCase());
}

// Regex constants compiled once at module level
const ASTERISK_REGEX = /(?<!\*)\*(?!\*)([^\*\n]+?)(?<!\*)\*(?!\*)/g;
const THOUGHT_REGEX = /<(?:thought|think|reasoning|channel:thought)\b[\s\S]*?(?:<\/(?:thought|think|reasoning|channel:thought)>|(?=\n@[^\n:：]+[:：])|$)/gi;
const AT_PREFIX_CHECK_REGEX = /(?:^|\n)@([^\n:：]+)[:：]/;
const TAG_LINE_REGEX = /^@([^\n:：]+)[:：](.*)$/;
const PARTIAL_TAG_REGEX = /^@([^\n:：]+)$/;

/**
 * True when the text contains at least one narration segment (@ナレーター: etc).
 */
export function hasNarration(content: string): boolean {
  if (!content || content.indexOf('@') === -1) return false;
  for (const line of content.split('\n')) {
    if (line.charCodeAt(0) !== 64 /* '@' */) continue;
    const match = line.match(TAG_LINE_REGEX);
    if (match && isNarrationSpeaker(match[1])) return true;
  }
  return false;
}

/**
 * Formats dialogue content so that action asterisks (*action*) are placed on their own lines cleanly.
 */
function formatDialogueAsterisks(text: string): string {
  if (!text || text.indexOf('*') === -1) return text;

  const formatted = text.replace(ASTERISK_REGEX, (_match, inner) => `\n*${inner.trim()}*\n`);

  // Fast-path string splitting and cleanup
  const lines = formatted.split('\n');
  let result = '';
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      result = result.length === 0 ? trimmed : `${result}\n${trimmed}`;
    }
  }
  return result;
}

/**
 * Parses raw message text into multi-role segments (dialogue vs narration)
 * supports streaming, legacy non-prefixed messages, and filters out <thought> / <think> tags.
 */
export function parseMessageSegments(
  rawContent: string,
  characterName: string,
  defaultRole: 'user' | 'assistant' | 'system',
  userName = 'ユーザー'
): MessageSegment[] {
  if (!rawContent) return [];

  // Strip out reasoning blocks if present
  const cleaned = rawContent.indexOf('<') !== -1
    ? rawContent.replace(THOUGHT_REGEX, '')
    : rawContent;

  const trimmed = cleaned.trim();
  if (!trimmed) return [];

  // Fast path: if no '@' symbol exists, avoid regex line parsing entirely
  const hasAtSymbol = trimmed.indexOf('@') !== -1;
  const hasAtPrefix = hasAtSymbol && AT_PREFIX_CHECK_REGEX.test(trimmed);

  if (!hasAtPrefix) {
    if (defaultRole === 'assistant') {
      return [
        {
          id: 'seg-0',
          type: 'dialogue',
          speakerName: characterName,
          isUser: false,
          content: formatDialogueAsterisks(trimmed),
        },
      ];
    }

    return [
      {
        id: 'seg-0',
        type: 'dialogue',
        speakerName: userName,
        isUser: true,
        content: formatDialogueAsterisks(trimmed),
      },
    ];
  }

  // Parse lines with @ prefixes
  const lines = cleaned.split('\n');
  const segments: MessageSegment[] = [];

  let currentType: SegmentType = 'dialogue';
  let currentSpeaker: string | undefined = undefined;
  let currentUser = false;
  let currentLines: string[] = [];
  let hasActiveSegment = false;

  const flushSegment = () => {
    if (!hasActiveSegment || currentLines.length === 0) return;
    const joined = currentLines.join('\n').trim();
    if (joined) {
      segments.push({
        id: `seg-${segments.length}`,
        type: currentType,
        speakerName: currentSpeaker,
        isUser: currentUser,
        content: currentType === 'dialogue' ? formatDialogueAsterisks(joined) : joined,
      });
    }
    currentLines = [];
    hasActiveSegment = false;
  };

  const lineCount = lines.length;
  for (let i = 0; i < lineCount; i++) {
    const line = lines[i];

    if (line.charCodeAt(0) === 64 /* '@' */) {
      const tagMatch = line.match(TAG_LINE_REGEX);
      if (tagMatch) {
        flushSegment();
        const rawSpeaker = tagMatch[1].trim();
        const lineContent = tagMatch[2].trimStart();

        if (isNarrationSpeaker(rawSpeaker)) {
          currentType = 'narration';
          currentSpeaker = undefined;
          currentUser = false;
        } else if (isUserSpeaker(rawSpeaker)) {
          currentType = 'dialogue';
          currentSpeaker = rawSpeaker;
          currentUser = true;
        } else {
          currentType = 'dialogue';
          currentSpeaker = rawSpeaker || characterName;
          currentUser = false;
        }
        currentLines = [lineContent];
        hasActiveSegment = true;
        continue;
      }

      // Partial streaming tag without colon on final chunk (e.g. "@ナレーター" or "@キャラ名")
      if (i === lineCount - 1) {
        const partialTagMatch = line.match(PARTIAL_TAG_REGEX);
        if (partialTagMatch) {
          const rawSpeaker = partialTagMatch[1].trim();
          if (isNarrationSpeaker(rawSpeaker)) {
            flushSegment();
            currentType = 'narration';
            currentSpeaker = undefined;
            currentUser = false;
            currentLines = [''];
            hasActiveSegment = true;
            continue;
          }
        }
      }
    }

    if (hasActiveSegment) {
      currentLines.push(line);
    } else {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        const isUser = defaultRole === 'user';
        currentType = 'dialogue';
        currentSpeaker = isUser ? userName : characterName;
        currentUser = isUser;
        currentLines = [line];
        hasActiveSegment = true;
      }
    }
  }

  flushSegment();
  return segments;
}
