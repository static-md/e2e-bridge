import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  EMOJI_ALPHABET,
  containsKey,
  decrypt,
  encrypt,
  keyEmojis,
  newKeyEmojis,
  noteKey,
  noteLink,
  parseNote,
} from '../src/noteKey';
import { NOTE_TEXT, WrongKeyError, editTextUpdate, initialUpdate, noteText, openNote, seal } from '../src/noteDoc';

const KEY = '😀😁😂😃😄😅😆😇';

describe('note keys', () => {
  it('has 840 distinct single-code-point emojis, like the web app', () => {
    expect(EMOJI_ALPHABET).toHaveLength(840);
    expect(new Set(EMOJI_ALPHABET).size).toBe(840);
    expect(EMOJI_ALPHABET.every((e) => Array.from(e).length === 1)).toBe(true);
  });

  it('makes 8-emoji keys from the alphabet', () => {
    const emojis = newKeyEmojis();
    expect(Array.from(emojis)).toHaveLength(8);
    expect(Array.from(emojis).every((e) => EMOJI_ALPHABET.includes(e))).toBe(true);
    expect(newKeyEmojis()).not.toBe(emojis);
  });

  it('reads keys the way the web app does: alphabet emojis only, the first 8', () => {
    expect(keyEmojis(KEY)).toBe(KEY);
    expect(keyEmojis(encodeURIComponent(KEY))).toBe(KEY);
    expect(keyEmojis(`${KEY}🚀🚁`)).toBe(KEY);
    expect(keyEmojis(`a ${KEY.slice(0, 4)}-x-${KEY.slice(4)}`)).toBe(KEY);
    expect(keyEmojis('😀😁😂')).toBeNull();
  });

  it('parses note links and ids', () => {
    expect(parseNote('k3v9qa')).toEqual({ id: 'k3v9qa' });
    expect(parseNote(`https://static.md/md/k3v9qa#key=${KEY}`)).toEqual({ id: 'k3v9qa', emojis: KEY });
    expect(parseNote(`static.md/md/k3v9qa#key=${encodeURIComponent(KEY)}`)).toEqual({ id: 'k3v9qa', emojis: KEY });
    expect(parseNote('https://static.md/md/k3v9qa')).toEqual({ id: 'k3v9qa' });
    expect(parseNote('https://static.md/md/k3v9qa#key=nope')).toEqual({ id: 'k3v9qa' });
    expect(parseNote(`https://evil.example/md/k3v9qa#key=${KEY}`)).toBeNull();
    expect(parseNote('https://static.md/draw/k3v9qa')).toBeNull();
    expect(parseNote('not a note')).toBeNull();
    expect(noteLink('k3v9qa', KEY)).toBe(`https://static.md/md/k3v9qa#key=${KEY}`);
  });

  it('spots keys in text', () => {
    expect(containsKey(`see https://static.md/md/abc#key=${KEY}`)).toBe(true);
    expect(containsKey(`#key=${encodeURIComponent(KEY)}`)).toBe(true);
    expect(containsKey('#key=😀😁 is short')).toBe(false);
    expect(containsKey(`plain ${KEY} without a link`)).toBe(false);
  });

  it('encrypts with a random IV and refuses the wrong key or changed ciphertext', async () => {
    const key = await noteKey(KEY);
    const data = new TextEncoder().encode('secret');
    const a = await encrypt(data, key);
    const b = await encrypt(data, key);
    expect(a).not.toEqual(b);
    expect(a.length).toBe(12 + data.length + 16);
    expect(new TextDecoder().decode(await decrypt(a, key))).toBe('secret');
    await expect(decrypt(a, await noteKey('🐀🐁🐂🐃🐄🐅🐆🐇'))).rejects.toThrow();
    a[20] ^= 1;
    await expect(decrypt(a, key)).rejects.toThrow();
  });
});

describe('encrypted note documents', () => {
  it('opens a note from updates in any order and edits it with a small change', async () => {
    const key = await noteKey(KEY);
    const author = new Y.Doc();
    const seen: Uint8Array[] = [];
    author.on('update', (u: Uint8Array) => seen.push(u));
    author.getText(NOTE_TEXT).insert(0, '# Plan\n');
    author.getText(NOTE_TEXT).insert(7, 'Ship Friday.\n');
    const stored = await Promise.all(seen.reverse().map(async (u, i) => ({ ref: `u${i}`, data: await seal(u, key) })));

    const opened = await openNote(stored, key);
    expect(noteText(opened.doc)).toBe('# Plan\nShip Friday.\n');
    expect(opened.opened.sort()).toEqual(['u0', 'u1']);
    expect(opened.skipped).toBe(0);

    const change = editTextUpdate(opened.doc, '# Plan\nShip Monday.\n')!;
    Y.applyUpdate(author, change);
    expect(author.getText(NOTE_TEXT).toString()).toBe('# Plan\nShip Monday.\n');
    expect(change.length).toBeLessThan(Y.encodeStateAsUpdate(author).length);
    expect(editTextUpdate(opened.doc, '# Plan\nShip Monday.\n')).toBeNull();
  });

  it('skips updates that do not open with the key, and calls a key that opens none wrong', async () => {
    const key = await noteKey(KEY);
    const good = { ref: 'good', data: await seal(initialUpdate('hello'), key) };
    const other = { ref: 'other', data: await seal(initialUpdate('x'), await noteKey('🐀🐁🐂🐃🐄🐅🐆🐇')) };
    const opened = await openNote([good, other, { ref: 'junk', data: 'aGVsbG8gd29ybGQgaGVsbG8gd29ybGQgaGk=' }], key);
    expect(noteText(opened.doc)).toBe('hello');
    expect(opened.opened).toEqual(['good']);
    expect(opened.skipped).toBe(2);
    await expect(openNote([other], key)).rejects.toBeInstanceOf(WrongKeyError);
    expect(noteText((await openNote([], key)).doc)).toBe('');
  });
});
