/** Returns a compact, readable two-letter label for a user's name. */
export function userInitials(name: string) {
  const firstInitial = (value: string) => Array.from(value).find(character => /[\p{L}\p{N}]/u.test(character)) ?? ""
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = words.length > 1
    ? words.slice(0, 2).map(firstInitial).join("")
    : Array.from(words[0] ?? "").map(firstInitial).join("").slice(0, 2)
  const fallback = firstInitial(name) || "?"
  const uppercase = Array.from((initials || fallback).toLocaleUpperCase()).slice(0, 2).join("")
  return uppercase.padEnd(2, Array.from(fallback.toLocaleUpperCase())[0] || "?").slice(0, 2)
}
