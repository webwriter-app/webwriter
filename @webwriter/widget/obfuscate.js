const FORMAT = 1;
const KEY_LENGTH = 4;
const HEADER_LENGTH = 1 + KEY_LENGTH;
function mask(bytes, key) {
  let state = new DataView(key.buffer, key.byteOffset, KEY_LENGTH).getUint32(0) || 1;
  return bytes.map((byte) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return byte ^ state & 255;
  });
}
function obfuscate(value) {
  const key = crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
  const payload = mask(new TextEncoder().encode(JSON.stringify(value)), key);
  let binary = String.fromCharCode(FORMAT, ...key);
  for (const byte of payload) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function unmask(text) {
  try {
    const bytes = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
    if (bytes[0] !== FORMAT || bytes.length <= HEADER_LENGTH) return void 0;
    const json = new TextDecoder("utf-8", { fatal: true }).decode(mask(bytes.subarray(HEADER_LENGTH), bytes.subarray(1, HEADER_LENGTH)));
    return { value: JSON.parse(json) };
  } catch {
    return void 0;
  }
}
function reveal(text) {
  if (!text) return void 0;
  const masked = unmask(text);
  if (masked) return masked.value;
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function isObfuscated(text) {
  return !!text && unmask(text) !== void 0;
}
const obfuscated = {
  fromAttribute: (text) => reveal(text),
  toAttribute: (value) => value === void 0 || value === null ? null : obfuscate(value)
};
export {
  isObfuscated,
  obfuscate,
  obfuscated,
  reveal
};
