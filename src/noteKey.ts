/**
 * The note key, exactly as the static.md web app makes and reads it:
 *
 *   key        8 emojis from EMOJI_ALPHABET, written after #key= in the note link
 *   AES key    SHA-256 of the 8 emojis joined (UTF-8), used as an AES-256-GCM key
 *   ciphertext 12-byte random IV ‖ AES-GCM ciphertext ‖ 16-byte tag
 */
import { randomInt, webcrypto } from 'node:crypto';

const { subtle } = webcrypto;

/** The web app's emoji alphabet, in its order. A key may only use these. */
export const EMOJI_ALPHABET: readonly string[] = [
  "😀","😁","😂","😃","😄","😅","😆","😇","😈","😉","😊","😋","😌","😍","😎","😏",
  "😐","😑","😒","😓","😔","😕","😖","😗","😘","😙","😚","😛","😜","😝","😞","😟",
  "😠","😡","😢","😣","😤","😥","😦","😧","😨","😩","😪","😫","😬","😭","😮","😯",
  "😰","😱","😲","😳","😴","😵","😶","😷","😸","😹","😺","😻","😼","😽","😾","😿",
  "🙀","🙁","🙂","🙃","🙄","🙈","🙉","🙊","🙌","🙏","🤐","🤑","🤒","🤓","🤔","🤕",
  "🤖","🤗","🤘","🤣","🤤","🤥","🤧","🤨","🤩","🤪","🤫","🤬","🤭","🤮","🤯","👀",
  "👂","👃","👄","👅","👆","👇","👈","👉","👊","👋","👌","👍","👎","👏","👐","👑",
  "👒","👓","👔","👕","👖","👗","👘","👙","👚","👛","👜","👝","👞","👟","👠","👡",
  "👢","👣","👤","👥","👹","👺","👻","👼","👽","👾","👿","💀","💁","💂","💃","💄",
  "💅","💆","💇","💈","💉","💊","💋","💌","💍","💎","💏","💐","💑","💒","💓","💔",
  "💕","💖","💗","💘","💙","💚","💛","💜","💝","💞","💟","💠","💡","💢","💣","💤",
  "💥","💦","💧","💨","💩","💪","💫","💬","💭","💮","💯","💰","💱","💲","💳","💴",
  "💵","💶","💷","💸","💹","💺","💻","💼","💽","💾","💿","📀","📁","📂","📃","📄",
  "📅","📆","📇","📈","📉","📊","📋","📌","📍","📎","📏","📐","📑","📒","📓","📔",
  "📕","📖","📗","📘","📙","📚","📛","📜","📝","📞","📟","📠","📡","📢","📣","📤",
  "📥","📦","📧","📨","📩","📪","📫","📬","📭","📮","📯","📰","📱","📲","📳","📴",
  "📵","📶","📷","📸","📹","📺","📻","📼","🔀","🔁","🔂","🔃","🔄","🔅","🔆","🔇",
  "🔈","🔉","🔊","🔋","🔌","🔍","🔎","🔏","🔐","🔑","🔒","🔓","🔔","🔕","🔖","🔗",
  "🔘","🔙","🔚","🔛","🔜","🔝","🔞","🔟","🔠","🔡","🔢","🔣","🔤","🔥","🔦","🔧",
  "🔨","🔩","🔪","🔫","🔬","🔭","🔮","🔯","🔰","🔱","🔲","🔳","🔴","🔵","🔶","🔷",
  "🔸","🔹","🔺","🔻","🔼","🔽","🕐","🕑","🕒","🕓","🕔","🕕","🕖","🕗","🕘","🕙",
  "🕚","🕛","🕜","🕝","🕞","🕟","🕠","🕡","🕢","🕣","🕤","🕥","🕦","🕧","🕯","🕰",
  "🕳","🕶","🕷","🕸","🕹","🖇","🖊","🖋","🖌","🖍","🖐","🖕","🖖","🖥","🖨","🖱",
  "🖲","🖼","🗂","🗃","🗄","🗑","🗒","🗓","🗜","🗝","🗞","🗡","🗣","🗺","🌀","🌂",
  "🌃","🌄","🌅","🌆","🌇","🌈","🌉","🌊","🌋","🌌","🌍","🌎","🌏","🌐","🌑","🌒",
  "🌓","🌔","🌕","🌖","🌗","🌘","🌙","🌚","🌛","🌜","🌝","🌞","🌟","🌠","🌭","🌮",
  "🌯","🌰","🌱","🌲","🌳","🌴","🌵","🌶","🌷","🌸","🌹","🌺","🌻","🌼","🌽","🌾",
  "🌿","🍀","🍁","🍂","🍃","🌤","🌥","🌦","🌧","🌨","🌩","🌪","🌫","🌬","🍄","🍅",
  "🍆","🍇","🍈","🍉","🍊","🍋","🍌","🍍","🍎","🍏","🍐","🍑","🍒","🍓","🍔","🍕",
  "🍖","🍗","🍘","🍙","🍚","🍛","🍜","🍝","🍞","🍟","🍠","🍡","🍢","🍣","🍤","🍥",
  "🍦","🍧","🍨","🍩","🍪","🍫","🍬","🍭","🍮","🍯","🍰","🍱","🍲","🍳","🍴","🍵",
  "🍶","🍷","🍸","🍹","🍺","🍻","🍼","🍾","🍿","🥐","🥑","🥒","🥓","🥔","🥕","🥗",
  "🥘","🥙","🥚","🥛","🥜","🥝","🥞","🥟","🥠","🥡","🥢","🥣","🥤","🥥","🥦","🥧",
  "🥨","🥩","🥪","🥫","🎀","🎁","🎂","🎃","🎄","🎆","🎇","🎈","🎉","🎊","🎋","🎌",
  "🎍","🎎","🎏","🎐","🎑","🎒","🎓","🎖","🎗","🎙","🎚","🎛","🎞","🎟","🎠","🎡",
  "🎢","🎣","🎤","🎥","🎦","🎧","🎨","🎩","🎪","🎫","🎬","🎭","🎮","🎯","🎰","🎱",
  "🎲","🎳","🎴","🎵","🎶","🎷","🎸","🎹","🎺","🎻","🎼","🎽","🎾","🎿","🏀","🏁",
  "🏅","🏆","🏇","🏈","🏉","🏊","🏋","🏌","🏍","🏎","🏏","🏐","🏑","🏒","🏓","🏸",
  "🏹","🏺","🤺","🤼","🤸","🤾","🤽","🥁","🏔","🏕","🏖","🏗","🏘","🏙","🏚","🏛",
  "🏜","🏝","🏞","🏟","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏧","🏨","🏩","🏪","🏫",
  "🏬","🏭","🏮","🏯","🏰","🏷","🗻","🗼","🗽","🗾","🗿","🚀","🚁","🚂","🚃","🚄",
  "🚅","🚆","🚇","🚈","🚉","🚊","🚋","🚌","🚍","🚎","🚏","🚐","🚑","🚒","🚓","🚔",
  "🚕","🚖","🚗","🚘","🚙","🚚","🚛","🚜","🚝","🚞","🚟","🚠","🚡","🚢","🚣","🚤",
  "🚥","🚦","🚧","🚨","🚩","🚪","🚫","🚬","🚭","🚮","🚯","🚰","🚱","🚲","🚳","🚴",
  "🚵","🚶","🚷","🚸","🚹","🚺","🚻","🚼","🚽","🚾","🚿","🛀","🛁","🛂","🛃","🛄",
  "🛅","🛋","🛌","🛍","🛎","🛏","🛐","🛑","🛒","🛠","🛡","🛢","🛣","🛤","🛥","🛩",
  "🛫","🛬","🛰","🛳","🛴","🛵","🛶","🛷","🛸","🛹","🐀","🐁","🐂","🐃","🐄","🐅",
  "🐆","🐇","🐈","🐉","🐊","🐋","🐌","🐍","🐎","🐏","🐐","🐑","🐒","🐓","🐔","🐕",
  "🐖","🐗","🐘","🐙","🐚","🐛","🐜","🐝","🐞","🐟","🐠","🐡","🐢","🐣","🐤","🐥",
  "🐦","🐧","🐨","🐩","🐪","🐫","🐬","🐭","🐮","🐯","🐰","🐱","🐲","🐳","🐴","🐵",
  "🐶","🐷","🐸","🐹","🐺","🐻","🐼","🐽","🐾","🐿","🦀","🦁","🦂","🦃","🦄","🦅",
  "🦆","🦇","🦈","🦉","🦊","🦋","🦌","🦍","🦎","🦏","🦐","🦑","🦒","🦓","🦔","🦕",
  "🦖","🦗","⌚","⌛","⏩","⏪","⏫","⏬"
];

const ALPHABET_SET = new Set(EMOJI_ALPHABET);
export const KEY_EMOJIS = 8;
const IV_BYTES = 12;

export interface NoteKey {
  /** The 8 emojis: the secret. Never send them to static.md. */
  emojis: string;
  aes: webcrypto.CryptoKey;
}

/** The key's emojis, as the web app reads them: only alphabet emojis count, then the first 8 */
export function keyEmojis(text: string): string | null {
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // Raw emojis
  }
  const emojis = Array.from(decoded).filter((c) => ALPHABET_SET.has(c));
  return emojis.length >= KEY_EMOJIS ? emojis.slice(0, KEY_EMOJIS).join('') : null;
}

export async function noteKey(emojis: string): Promise<NoteKey> {
  const hash = await subtle.digest('SHA-256', new TextEncoder().encode(emojis));
  const aes = await subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { emojis, aes };
}

/** A fresh random key (uniform over the alphabet, ~78 bits) */
export function newKeyEmojis(): string {
  return Array.from({ length: KEY_EMOJIS }, () => EMOJI_ALPHABET[randomInt(EMOJI_ALPHABET.length)]).join('');
}

export async function encrypt(plaintext: Uint8Array, key: NoteKey): Promise<Uint8Array> {
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key.aes, new Uint8Array(plaintext)));
  const out = new Uint8Array(IV_BYTES + sealed.length);
  out.set(iv, 0);
  out.set(sealed, IV_BYTES);
  return out;
}

/** Throws when the key is wrong or the ciphertext was changed */
export async function decrypt(ciphertext: Uint8Array, key: NoteKey): Promise<Uint8Array> {
  const iv = new Uint8Array(ciphertext.subarray(0, IV_BYTES));
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, key.aes, new Uint8Array(ciphertext.subarray(IV_BYTES))));
}

export const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
export const fromBase64 = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, 'base64'));

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface NoteRef {
  id: string;
  /** From the link's #key=, when it had one */
  emojis?: string;
}

/**
 * A note from what the user gave: its link (https://static.md/md/<id>, with
 * or without #key=…) or its bare id. Null when it is neither.
 */
export function parseNote(input: string): NoteRef | null {
  const text = input.trim();
  if (ID.test(text)) return { id: text };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!['static.md', 'www.static.md'].includes(url.hostname)) return null;
  const m = /^\/md\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname);
  if (!m) return null;
  // As the web app does: the fragment is read as URL parameters
  const param = new URLSearchParams(url.hash.slice(1)).get('key');
  const emojis = param ? keyEmojis(param) : null;
  return emojis ? { id: m[1], emojis } : { id: m[1] };
}

export const noteLink = (id: string, emojis?: string): string =>
  `https://static.md/md/${id}${emojis ? `#key=${emojis}` : ''}`;

/**
 * Whether `text` carries a key: a #key= fragment with 8 or more emojis. Such
 * text is never sent to static.md (titles there are stored unencrypted).
 */
export function containsKey(text: string): boolean {
  for (const m of text.matchAll(/#key=([^\s)\]>"'`]+)/g)) {
    let fragment = m[1];
    try {
      fragment = decodeURIComponent(fragment);
    } catch {
      // Raw emojis
    }
    if ((fragment.match(/\p{Extended_Pictographic}/gu) ?? []).length >= KEY_EMOJIS) return true;
  }
  return false;
}
