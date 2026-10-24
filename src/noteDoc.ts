/**
 * An encrypted note as the web app stores it: a set of Yjs updates, each
 * encrypted on its own. Decrypting every update and applying them all to one
 * Y.Doc gives the note; an edit becomes one more encrypted update, which
 * merges live with people typing in the note.
 */
import * as Y from 'yjs';
import diff from 'fast-diff';
import { decrypt, encrypt, fromBase64, toBase64, type NoteKey } from './noteKey.js';

/** The note editor's shared text (the web app's y-codemirror binding) */
export const NOTE_TEXT = 'codemirror';

export interface StoredUpdate {
  /** Its id on static.md, for compaction */
  ref: string;
  /** base64 ciphertext */
  data: string;
}

export interface OpenedNote {
  doc: Y.Doc;
  /** Updates this key opened: the ones a compaction may replace */
  opened: string[];
  /** Updates this key couldn't decrypt: another key's, or not ciphertext at all */
  undecryptable: number;
  /** Every update left out of `doc`: the undecryptable ones, and any that decrypted but weren't Yjs */
  skipped: number;
}

export class WrongKeyError extends Error {}

/**
 * Decrypts and merges a note's updates. Throws WrongKeyError when there are
 * updates and none opens with `key`; an update that alone fails is skipped,
 * as nobody holding this key can see what's in it.
 */
export async function openNote(updates: StoredUpdate[], key: NoteKey): Promise<OpenedNote> {
  const plain: Array<{ ref: string; update: Uint8Array }> = [];
  for (const u of updates) {
    try {
      plain.push({ ref: u.ref, update: await decrypt(fromBase64(u.data), key) });
    } catch {
      // Not for this key
    }
  }
  if (updates.length > 0 && plain.length === 0) throw new WrongKeyError('wrong key');
  const doc = new Y.Doc();
  const opened: string[] = [];
  for (const { ref, update } of plain) {
    try {
      Y.applyUpdate(doc, update);
      opened.push(ref);
    } catch {
      // Decrypted, but not a Yjs update
    }
  }
  return { doc, opened, undecryptable: updates.length - plain.length, skipped: updates.length - opened.length };
}

export const noteText = (doc: Y.Doc): string => doc.getText(NOTE_TEXT).toString();

/**
 * Edits the note text in `doc` to become `next` with the smallest set of
 * inserts/deletes, and returns just that change as a Yjs update (null when the
 * text is already `next`). Small targeted ops merge cleanly with whatever
 * people are typing at the same time; a wholesale replace would not.
 */
export function editTextUpdate(doc: Y.Doc, next: string): Uint8Array | null {
  const text = doc.getText(NOTE_TEXT);
  const before = text.toString();
  if (before === next) return null;
  const stateBefore = Y.encodeStateVector(doc);
  doc.transact(() => {
    let pos = 0;
    for (const [op, chunk] of diff(before, next)) {
      if (op === diff.EQUAL) {
        pos += chunk.length;
      } else if (op === diff.DELETE) {
        text.delete(pos, chunk.length);
      } else {
        text.insert(pos, chunk);
        pos += chunk.length;
      }
    }
  });
  return Y.encodeStateAsUpdate(doc, stateBefore);
}

/** A new note's first update: the whole document holding `markdown` */
export function initialUpdate(markdown: string): Uint8Array {
  const doc = new Y.Doc();
  if (markdown) doc.getText(NOTE_TEXT).insert(0, markdown);
  return Y.encodeStateAsUpdate(doc);
}

export async function seal(update: Uint8Array, key: NoteKey): Promise<string> {
  return toBase64(await encrypt(update, key));
}
