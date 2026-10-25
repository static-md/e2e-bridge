# static-md-e2e

A local MCP server that lets AI agents read and write your **end-to-end encrypted** [static.md](https://static.md) notes. It encrypts and decrypts on your computer. static.md only ever receives ciphertext, note ids and titles; it never gets a key or the text of an encrypted note.

```
agent (Claude Code, Claude Desktop, Cursor, VS Code, Codex…)
  │  plaintext, on your computer
static-md-e2e  ── holds the key, encrypts and decrypts
  │  ciphertext only, over HTTPS
static.md/mcp  ── stores and returns ciphertext; checks access, Pro and limits
```

The notes are the same ones you open in the browser: a note the agent creates opens on static.md with its link, and edits merge live with people typing in it.

## Requirements

- A static.md **Pro** account. Agent access to encrypted notes is a Pro feature.
- A personal access token with `notes:read` and `notes:write`. Create one under **Your account** on [static.md/agents](https://static.md/agents). It's shown once: store it like a password.
- Node.js 20 or newer.

The bridge works with agents that run on your computer. Chat apps in the browser (claude.ai, ChatGPT) have nowhere on your side to hold the key, so they can't use encrypted notes.

## Setup

**Claude Code**

```sh
claude mcp add static-md-e2e -e STATIC_MD_TOKEN=smd_pat_… -- npx -y static-md-e2e
```

**Claude Desktop** (`claude_desktop_config.json`), **Cursor** (`~/.cursor/mcp.json`) and most other clients:

```json
{
  "mcpServers": {
    "static-md-e2e": {
      "command": "npx",
      "args": ["-y", "static-md-e2e"],
      "env": { "STATIC_MD_TOKEN": "smd_pat_…" }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`), asking for the token instead of storing it in the file:

```json
{
  "inputs": [{ "type": "promptString", "id": "static-md-token", "description": "static.md personal access token", "password": true }],
  "servers": {
    "static-md-e2e": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "static-md-e2e"],
      "env": { "STATIC_MD_TOKEN": "${input:static-md-token}" }
    }
  }
}
```

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.static-md-e2e]
command = "npx"
args = ["-y", "static-md-e2e"]
env = { STATIC_MD_TOKEN = "smd_pat_…" }
```

Keep the regular static.md server (`https://static.md/mcp`) connected too: it handles notes that aren't encrypted, whiteboards and sharing.

## Tools

| Tool | What it does |
|------|--------------|
| `read_encrypted_note` | Decrypts a note and returns its markdown, marked as untrusted user content. |
| `create_encrypted_note` | Encrypts new markdown with a fresh key, creates the note, optionally in a folder, and returns its full link (`…#key=…`). |
| `update_encrypted_note` | Appends to a note or replaces it. Only the change is encrypted and sent, so it merges with live edits. |

### Examples

Ask in plain words; the agent picks the tool and its arguments.

| You ask | The agent calls |
|---|---|
| Save these meeting notes as an encrypted note in my work/launch folder. | `create_encrypted_note` `{ "title": "Launch sync", "markdown": "# Launch sync\n\n- Ship Friday", "folder": "work/launch" }` |
| Add "Budget approved" to https://static.md/md/k3v9qa#key=… | `update_encrypted_note` `{ "note": "https://static.md/md/k3v9qa#key=…", "markdown": "Budget approved", "mode": "append" }` |
| What does my encrypted note k3v9qa say? (key saved on this computer) | `read_encrypted_note` `{ "note": "k3v9qa" }` |

Creating a note answers with its full link, `https://static.md/md/<id>#key=…`, and where static.md filed it (`in /work/launch`).

### Folders

`create_encrypted_note` takes an optional `folder`, the same as static.md's other create tools: a path such as `work/launch` or `/work/launch`. Leave it out, or give `/`, for the top level. A folder exists while something is in it, so a new one needs no setup.

- Folder names use letters A–Z, digits, `-`, `_` and `.`, separated by `/`, up to 10 levels of 64 characters each.
- `shared_with_me` can't be a top-level folder: static.md lists notes others share with you there.
- **Folder names aren't encrypted**, like titles. Keep anything private out of them.

The bridge checks the folder with static.md's rules before it encrypts anything, so a folder static.md would refuse fails with the reason and nothing is sent. To list encrypted notes by folder, or move one, use static.md's regular server (`list_my_notes`, `move_item`): it sees titles and folders, never the text.

## Giving the agent a key

A note's key is the 8 emojis after `#key=` in its link. There are two ways to hand it over:

1. **Paste the full link into the chat.** Simple. The key then sits in the conversation, so your AI provider sees it (it sees the note's text anyway when the agent reads it). The bridge keeps keys from links in memory only, for as long as it runs.
2. **Save the key on this computer** and give the agent only the id. The key never enters the conversation. Run this and paste the note's full link when asked (read from stdin, so the key stays out of your shell history):

   ```sh
   npx static-md-e2e key add
   ```

   Keys are saved in `~/.config/static-md/e2e-keys.json`, readable by your user only (`STATIC_MD_E2E_KEYS` sets another path). `key list` shows saved note ids, `key remove <id>` forgets one.

Whatever the agent creates comes back as a full link: keep it. static.md can't recover a lost key.

## What each party sees

| | static.md | Your AI provider | This computer |
|---|---|---|---|
| Note text | ❌ ciphertext only | ✅ what the agent reads or writes | ✅ in memory |
| Key | ❌ never | only if you paste the link | ✅ memory, or the key file if you save it |
| Title and folder | ✅ titles and folders aren't encrypted | ✅ | ✅ |
| Metadata | ✅ ids, owner, sharing, sizes, update times, the token used, IP | | |

static.md's server tools have no parameter that takes a key, and they refuse text that contains a `#key=` link, so a key can't end up stored next to a note by accident. A changed or forged update fails AES-GCM authentication and is left out of what the agent reads (the answer says how many). The bridge won't edit a note when any of its updates fail to decrypt, since the web app won't open a note with an update it can't decrypt. Messages from static.md reach the agent fenced as untrusted, like note text.

## The format

The bridge has no secret logic. To write your own client:

- **Key:** the 8 emojis from `#key=` (the web app's 840-emoji alphabet, exported here as `EMOJI_ALPHABET`). AES-256 key = SHA-256 of the 8 emojis joined, as UTF-8.
- **A stored update:** base64 of `IV (12 random bytes) ‖ AES-256-GCM ciphertext ‖ tag (16 bytes)`. The plaintext is a [Yjs](https://yjs.dev) update.
- **A note:** all of its stored updates. Decrypt each one and apply them all to one `Y.Doc`, in any order. The markdown is `doc.getText('codemirror')`.
- **static.md's MCP tools** (`https://static.md/mcp`): `read_note_ciphertext` returns the updates as JSON (`static.md/e2e-note/v1`). `create_note_ciphertext` creates a note from its first encrypted update, optionally in a `folder`. `write_note_ciphertext` adds one, and the owner can compact the note with it.

## Development

```sh
pnpm install
pnpm test
pnpm build
```

## License

MIT
