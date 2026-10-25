/**
 * Folders on static.md: where a note sits in My Notes, "/" for the top level
 * or a path such as "/work/launch". The bridge checks a folder with
 * static.md's own rules (parseFolder in its MCP server) before it encrypts
 * anything, so a bad one fails here with the reason and nothing is sent;
 * static.md checks it again. Folder names aren't encrypted, like titles. The
 * allowed characters leave no room for a #key= link.
 */

/** Deepest folder a note can be filed in */
export const MAX_FOLDER_DEPTH = 10;
/** Longest folder name */
export const MAX_FOLDER_NAME = 64;
/** Longest folder argument static.md accepts, slashes included */
export const MAX_FOLDER_INPUT = 700;

const NAME = /^[A-Za-z0-9_.-]+$/;
/** My Notes lists notes shared with the user as a top-level folder of this name */
const SHARED_WITH_ME = 'shared_with_me';

export const FOLDER_FORMAT = `Folder names use letters A-Z, digits, "-", "_" and ".", separated by "/" (like "work/launch"), up to ${MAX_FOLDER_DEPTH} levels of ${MAX_FOLDER_NAME} characters`;

/**
 * A folder to file a note in, normalised as static.md stores it:
 * "work/launch/", "/work//launch" and "/work/launch" all become
 * "/work/launch", and "" or "/" the top level. Anything static.md would
 * refuse comes back as an error with the reason.
 */
export function parseFolder(raw: string): { path: string } | { error: string } {
  const names = raw.trim().split('/').filter(Boolean);
  const shown = JSON.stringify(raw.slice(0, 80));
  const bad = names.find((name) => name === '.' || name === '..');
  if (bad) return { error: `Not a valid folder: ${shown}. A folder can't be named "${bad}".` };
  const odd = names.find((name) => !NAME.test(name));
  if (odd) return { error: `Not a valid folder: ${shown}. ${FOLDER_FORMAT}.` };
  const long = names.find((name) => name.length > MAX_FOLDER_NAME);
  if (long || names.length > MAX_FOLDER_DEPTH) return { error: `Not a valid folder: ${shown}. ${FOLDER_FORMAT}.` };
  if (names[0] === SHARED_WITH_ME) {
    return { error: `Not a valid folder: ${shown}. "${SHARED_WITH_ME}" at the top level is where static.md lists notes other people share with you.` };
  }
  return { path: '/' + names.join('/') };
}

/** `path` when it is a folder exactly as static.md stores it, else undefined */
export function storedFolder(path: unknown): string | undefined {
  if (typeof path !== 'string') return undefined;
  const parsed = parseFolder(path);
  return 'path' in parsed && parsed.path === path ? path : undefined;
}
