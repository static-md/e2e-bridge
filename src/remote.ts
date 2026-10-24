/**
 * static.md's side of the bridge: its MCP server's ciphertext tools
 * (read_note_ciphertext, create_note_ciphertext, write_note_ciphertext).
 * Everything sent here is ciphertext, a note id or a title; never a key.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { StoredUpdate } from './noteDoc.js';

export const DEFAULT_MCP_URL = 'https://static.md/mcp';
/** What read_note_ciphertext answers with; anything else is refused */
const FORMAT = 'static.md/e2e-note/v1';

export interface NoteCiphertext {
  id: string;
  /** Sanitized by static.md (one line, at most 32 characters), still user-written */
  title: string;
  canEdit: boolean;
  /** The user owns the note, so may replace its stored updates */
  canCompact: boolean;
  updates: StoredUpdate[];
}

/** What the bridge needs from static.md */
export interface RemoteNotes {
  read(id: string): Promise<NoteCiphertext>;
  create(title: string | undefined, ciphertext: string): Promise<{ id: string; title: string }>;
  write(id: string, ciphertext: string, replaces?: string[]): Promise<{ replaced: number }>;
}

/**
 * The call failed. `fromServer` is static.md's own answer, which the bridge
 * passes on fenced: an agent holding keys mustn't take orders from a server.
 */
export class RemoteError extends Error {
  constructor(message: string, readonly fromServer?: string) {
    super(message);
  }
}

interface ToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const textOf = (r: ToolResult) => (r.content ?? []).map((c) => (c.type === 'text' ? c.text ?? '' : '')).join('\n');

/** The JSON between read_note_ciphertext's untrusted markers, for note `id` */
export function parseCiphertext(text: string, id: string): NoteCiphertext {
  const m = /<<<untrusted ([0-9a-f]{8})>>>\n([\s\S]*)\n<<<end untrusted \1>>>/.exec(text);
  if (!m) throw new RemoteError('static.md sent an answer the bridge does not understand. Update the bridge: npx static-md-e2e@latest');
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[2]);
  } catch {
    throw new RemoteError('static.md sent ciphertext the bridge could not parse.');
  }
  const p = parsed as Partial<NoteCiphertext> & { format?: unknown };
  const updates = Array.isArray(p.updates) ? p.updates : null;
  if (p.format !== FORMAT || p.id !== id || !updates
    || !updates.every((u) => u && typeof u.ref === 'string' && typeof u.data === 'string')) {
    throw new RemoteError('static.md sent ciphertext in a format this bridge does not know. Update the bridge: npx static-md-e2e@latest');
  }
  return {
    id: p.id,
    title: typeof p.title === 'string' ? p.title : 'Untitled',
    canEdit: p.canEdit === true,
    canCompact: p.canCompact === true,
    updates,
  };
}

/**
 * static.md over MCP with a personal access token. Connects on first use and
 * reconnects after a failure.
 */
export function mcpRemote(opts: { token: string; url?: string; version: string }): RemoteNotes {
  let connecting: Promise<Client> | undefined;

  async function connect(): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(opts.url ?? DEFAULT_MCP_URL), {
      requestInit: { headers: { Authorization: `Bearer ${opts.token}` } },
    });
    const client = new Client({ name: 'static-md-e2e', version: opts.version });
    await client.connect(transport);
    return client;
  }

  async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    connecting ??= connect();
    let result: ToolResult;
    try {
      const client = await connecting;
      result = (await client.callTool({ name, arguments: args })) as ToolResult;
    } catch (err) {
      connecting = undefined;
      const message = err instanceof Error ? err.message : String(err);
      if (/\b401\b|unauthori[sz]ed|invalid_token/i.test(message)) {
        throw new RemoteError('static.md turned down the token in STATIC_MD_TOKEN. Create a personal access token on https://static.md/agents and set it in this server\'s config.');
      }
      if (/insufficient.?scope/i.test(message)) {
        throw new RemoteError('The token in STATIC_MD_TOKEN lacks a permission this needs (notes:read to read, notes:write to create or edit). Create one with both on https://static.md/agents.');
      }
      throw new RemoteError(`Couldn't reach static.md: ${message}`);
    }
    if (result.isError) throw new RemoteError(`static.md refused ${name}.`, textOf(result));
    return result;
  }

  return {
    async read(id) {
      return parseCiphertext(textOf(await call('read_note_ciphertext', { id })), id);
    },
    async create(title, ciphertext) {
      const r = await call('create_note_ciphertext', { ...(title === undefined ? {} : { title }), ciphertext });
      const s = r.structuredContent ?? {};
      if (typeof s.id !== 'string') throw new RemoteError('static.md created the note but did not say its id.');
      return { id: s.id, title: typeof s.title === 'string' ? s.title : 'UNTITLED' };
    },
    async write(id, ciphertext, replaces) {
      const r = await call('write_note_ciphertext', { id, ciphertext, ...(replaces?.length ? { replaces } : {}) });
      const replaced = r.structuredContent?.replaced;
      return { replaced: typeof replaced === 'number' ? replaced : 0 };
    },
  };
}
