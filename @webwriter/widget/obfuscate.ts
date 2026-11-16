// Obfuscation, not encryption. A value is stored as base64 of a format byte,
// a random key and the JSON of the value masked with a key stream. The key
// sits beside the value, so anyone who reads the document source can recover
// it. The only purpose is that a solution is not readable at a glance, as in
// quiz's `encrypted-property.ts`. Hiding a solution for real means the host
// withholds it from participants.

const FORMAT = 1
const KEY_LENGTH = 4
const HEADER_LENGTH = 1 + KEY_LENGTH

/** XORs the bytes with a xorshift32 stream that starts from the key. Applying it twice gives the input back. */
function mask(bytes: Uint8Array, key: Uint8Array): Uint8Array {
  let state = new DataView(key.buffer, key.byteOffset, KEY_LENGTH).getUint32(0) || 1
  return bytes.map(byte => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return byte ^ (state & 0xff)
  })
}

/** A JSON value as text that does not show it. Not encryption: the key is part of the text. */
export function obfuscate(value: unknown): string {
  const key = crypto.getRandomValues(new Uint8Array(KEY_LENGTH))
  const payload = mask(new TextEncoder().encode(JSON.stringify(value)), key)
  let binary = String.fromCharCode(FORMAT, ...key)
  for(const byte of payload) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** The value inside text that `obfuscate()` made, wrapped so that an obfuscated `undefined` or `null` is told from no match. */
function unmask(text: string): {value: unknown} | undefined {
  try {
    const bytes = Uint8Array.from(atob(text), char => char.charCodeAt(0))
    if(bytes[0] !== FORMAT || bytes.length <= HEADER_LENGTH) return undefined
    const json = new TextDecoder("utf-8", {fatal: true}).decode(mask(bytes.subarray(HEADER_LENGTH), bytes.subarray(1, HEADER_LENGTH)))
    return {value: JSON.parse(json)}
  } catch {
    return undefined
  }
}

/**
 * The value of `obfuscate()`. Plain JSON is accepted too, so that a solution
 * can be written by hand; it is obfuscated the next time the value is written.
 * Undefined for anything else.
 */
export function reveal(text: string | null | undefined): unknown {
  if(!text) return undefined
  const masked = unmask(text)
  if(masked) return masked.value
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** True for text that `obfuscate()` made. False for plain JSON. */
export function isObfuscated(text: string | null | undefined): boolean {
  return !!text && unmask(text) !== undefined
}

/** An attribute converter with the shape Lit expects. */
export type ObfuscatedConverter<T = unknown> = {
  fromAttribute(text: string | null): T | undefined
  toAttribute(value: T | null | undefined): string | null
}

/**
 * Keeps a value obfuscated in an attribute. For a reflected Lit property:
 * `solution: {converter: obfuscated, reflect: true}`. Without Lit:
 * `reveal(host.getAttribute("solution"))` and `host.setAttribute("solution", obfuscate(value))`.
 * It is obfuscation, not encryption.
 */
export const obfuscated: ObfuscatedConverter = {
  fromAttribute: text => reveal(text),
  toAttribute: value => (value === undefined || value === null ? null : obfuscate(value)),
}
