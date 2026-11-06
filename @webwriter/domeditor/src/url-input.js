/** Paths with an explicit local prefix should keep resolving against their document. */
export function isRelativeURLInput(value) {
  return /^(?:\/(?!\/)|\.{1,2}(?:[/?#]|$)|[?#])/.test(value)
}

/** Supply the default scheme for a typed address. Callers still validate allowed URLs. */
export function normalizeURLInput(input) {
  const value = input.trim()
  if(!value || isRelativeURLInput(value)) return value
  if(/^https?:/i.test(value)) return value.replace(/^(https?):\/*/i, (_, scheme) => `${scheme.toLowerCase()}://`)
  // A domain or localhost followed by a port is an address, not a scheme.
  if(/^[a-z][a-z\d+.-]*:/i.test(value)
    && !/^(?:localhost|[a-z\d-]+(?:\.[a-z\d-]+)+\.?):\d+(?:[/?#]|$)/i.test(value)) return value
  return value.startsWith("//") ? `https:${value}` : `https://${value}`
}
