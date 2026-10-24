/**
 * Note keys saved on this computer, so an agent can open a note by its id
 * without the key ever passing through the chat. One JSON file, readable by
 * this user only:
 *
 *   { "version": 1, "keys": { "<note id>": "<8 emojis>" } }
 */
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Keyring {
  get(id: string): Promise<string | undefined>;
  set(id: string, emojis: string): Promise<void>;
  /** Whether there was a key to remove */
  remove(id: string): Promise<boolean>;
  ids(): Promise<string[]>;
  /** Where the keys live, for messages */
  where: string;
}

export function defaultKeyringPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.STATIC_MD_E2E_KEYS) return env.STATIC_MD_E2E_KEYS;
  const config = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(config, 'static-md', 'e2e-keys.json');
}

/** Read on every use, so keys added with `static-md-e2e key add` work without a restart */
export function fileKeyring(path = defaultKeyringPath()): Keyring {
  // A Map, so an id such as "__proto__" or "constructor" is just an id
  async function load(): Promise<Map<string, string>> {
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Never JSON.parse's own message: it quotes the file, keys included
      throw new Error(`The key file ${path} isn't valid JSON. Fix it, or delete it and add the keys again.`);
    }
    const keys = (parsed as { keys?: unknown } | null)?.keys;
    if (!keys || typeof keys !== 'object') return new Map();
    return new Map(Object.entries(keys).filter((e): e is [string, string] => typeof e[1] === 'string'));
  }

  async function save(keys: Map<string, string>): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify({ version: 1, keys: Object.fromEntries(keys) }, null, 2)}\n`, { mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, path);
  }

  return {
    where: path,
    async get(id) {
      return (await load()).get(id);
    },
    async set(id, emojis) {
      const keys = await load();
      keys.set(id, emojis);
      await save(keys);
    },
    async remove(id) {
      const keys = await load();
      if (!keys.delete(id)) return false;
      await save(keys);
      return true;
    },
    async ids() {
      return [...(await load()).keys()].sort();
    },
  };
}

export function memoryKeyring(initial: Record<string, string> = {}): Keyring {
  const keys = new Map(Object.entries(initial));
  return {
    where: 'memory',
    get: async (id) => keys.get(id),
    set: async (id, emojis) => void keys.set(id, emojis),
    remove: async (id) => keys.delete(id),
    ids: async () => [...keys.keys()].sort(),
  };
}
