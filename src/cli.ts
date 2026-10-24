#!/usr/bin/env node
/**
 * static-md-e2e                    serve the bridge over stdio (what MCP clients run)
 * static-md-e2e key add           save a note's key on this computer (link read from stdin)
 * static-md-e2e key remove <id>    forget it
 * static-md-e2e key list           ids of the notes with a saved key
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createBridgeServer } from './bridge.js';
import { fileKeyring } from './keyring.js';
import { parseNote } from './noteKey.js';
import { mcpRemote } from './remote.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

const USAGE = `static-md-e2e ${version}: end-to-end encrypted static.md notes for AI agents

  static-md-e2e                    run the MCP server (stdio); needs STATIC_MD_TOKEN
  static-md-e2e key add           save a note's key on this computer: paste its full link
  static-md-e2e key remove <id>    forget a saved key
  static-md-e2e key list           list notes with a saved key

Environment:
  STATIC_MD_TOKEN      a static.md personal access token (https://static.md/agents)
  STATIC_MD_E2E_KEYS   where saved keys live (default ~/.config/static-md/e2e-keys.json)
  STATIC_MD_MCP_URL    static.md's MCP endpoint (default https://static.md/mcp)
`;

/** The link from stdin, so the key stays out of shell history and the process list */
async function readLink(): Promise<string> {
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return (await rl.question('Paste the note\'s full link (with #key=…): ')).trim();
    } finally {
      rl.close();
    }
  }
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text.trim();
}

async function keyCommand(args: string[]): Promise<number> {
  const keyring = fileKeyring();
  const [action, arg] = args;
  if (action === 'add') {
    // A link given as an argument still works, but lands in shell history
    const note = parseNote(arg ?? (await readLink()));
    const emojis = note?.emojis;
    if (!note || !emojis) {
      console.error('That isn\'t a note\'s full link with its #key= part.');
      return 1;
    }
    await keyring.set(note.id, emojis);
    console.log(`Saved the key for note ${note.id} in ${keyring.where}. Agents can now open it by its id.`);
    return 0;
  }
  if (action === 'remove' && arg) {
    const id = parseNote(arg)?.id ?? arg;
    console.log((await keyring.remove(id)) ? `Forgot the key for note ${id}.` : `No saved key for note ${id}.`);
    return 0;
  }
  if (action === 'list') {
    const ids = await keyring.ids();
    console.log(ids.length ? ids.join('\n') : `No saved keys (${keyring.where}).`);
    return 0;
  }
  console.error(USAGE);
  return 1;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === '--version' || command === '-v') {
    console.log(version);
    return 0;
  }
  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(USAGE);
    return 0;
  }
  if (command === 'key') return keyCommand(rest);
  if (command !== undefined) {
    console.error(USAGE);
    return 1;
  }

  const token = process.env.STATIC_MD_TOKEN?.trim();
  if (!token) console.error('static-md-e2e: STATIC_MD_TOKEN is not set; tools will explain how to set it up.');
  const remote = token ? mcpRemote({ token, url: process.env.STATIC_MD_MCP_URL, version }) : null;
  const keyring = fileKeyring();
  // stdout carries the protocol: everything else goes to stderr
  serveStdio(() => createBridgeServer({ remote, keyring, version }), {
    onerror: (err) => console.error('static-md-e2e:', err.message),
  });
  return -1;
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code >= 0) process.exit(code);
  },
  (err: unknown) => {
    console.error('static-md-e2e:', err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
