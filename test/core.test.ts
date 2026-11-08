import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedIp } from '../lib/safe-url.ts';
import { parseMessageSegments, hasNarration } from '../lib/message-parser.ts';
import { activeProfile, DEFAULT_SETTINGS } from '../lib/db.ts';

// The IP table decides whether the server may fetch an endpoint. A single
// wrong range here is an SSRF hole, so the ranges are pinned by tests.
test('isBlockedIp blocks private, loopback and metadata ranges', () => {
  const blocked = [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254',
    '0.0.0.0', '255.255.255.255', '::1', 'fe80::1', 'fd12:3456::1',
    '::ffff:169.254.169.254', 'not-an-ip',
  ];
  for (const ip of blocked) {
    assert.equal(isBlockedIp(ip), true, `${ip} should be blocked`);
  }

  const allowed = [
    '8.8.8.8', '1.1.1.1', '172.15.255.254', '172.32.0.0',
    '2001:4860:4860::8888', '::ffff:8.8.8.8',
  ];
  for (const ip of allowed) {
    assert.equal(isBlockedIp(ip), false, `${ip} should be allowed`);
  }
});

test('parseMessageSegments splits narration and dialogue', () => {
  const segments = parseMessageSegments(
    '@ナレーター: 朝の光が差し込む。\n@ルナ: おはよう！ *手を振る*',
    'ルナ',
    'assistant'
  );
  assert.equal(segments.length, 2);
  assert.equal(segments[0].type, 'narration');
  assert.equal(segments[1].type, 'dialogue');
  assert.equal(segments[1].speakerName, 'ルナ');
  assert.equal(segments[1].isUser, false);
});

test('activeProfile picks the active one and falls back safely', () => {
  const profiles = [
    { id: 'a', name: '仕事', userName: 'タカシ', userBio: '' },
    { id: 'b', name: '休日', userName: 'マスター', userBio: 'タメ口で' },
  ];
  const base = { ...DEFAULT_SETTINGS, profiles };

  assert.equal(activeProfile({ ...base, activeProfileId: 'b' }).userName, 'マスター');
  // Unknown id (e.g. a profile deleted on another tab) falls back to the first
  assert.equal(activeProfile({ ...base, activeProfileId: 'gone' }).userName, 'タカシ');
  // Empty library falls back to the built-in default
  assert.equal(activeProfile({ ...base, profiles: [], activeProfileId: 'x' }).userName, 'ユーザー');
});

test('hasNarration finds narrator tags only when the tag is real', () => {
  assert.equal(hasNarration('@ナレーター: 朝の光が差し込む。'), true);
  assert.equal(hasNarration('@ルナ: おはよう\n@ナレーション: 風が吹く'), true);
  assert.equal(hasNarration('@ルナ: おはよう！'), false);
  assert.equal(hasNarration('ナレーター: タグの無い行'), false);
  assert.equal(hasNarration(''), false);
});

test('parseMessageSegments strips thoughts and falls back without tags', () => {
  const withThought = parseMessageSegments('<think>秘密の思考</think>本文です', 'ルナ', 'assistant');
  assert.equal(withThought.length, 1);
  assert.equal(withThought[0].content, '本文です');

  const plain = parseMessageSegments('こんにちは', 'ルナ', 'user');
  assert.equal(plain.length, 1);
  assert.equal(plain[0].isUser, true);
  assert.equal(plain[0].speakerName, 'ユーザー');
});
