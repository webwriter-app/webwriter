/** True when the value parses as a CSS color in the current browser. */
export function isCssColor(value: unknown): value is string {
  if(typeof value !== "string" || value.length > 64) return false
  const color = value.trim()
  if(!color || /[;{}\u0000-\u001f]/.test(color)) return false
  if(typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    return CSS.supports("color", color)
  }
  if(typeof document === "undefined") {
    return /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)
      || /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([^;{}]+\)$/i.test(color)
      || /^(?:transparent|currentcolor|black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|rebeccapurple)$/i.test(color)
  }
  const style = document.createElement("span").style
  style.color = color
  return style.color !== ""
}

/** Keep externally supplied colors inside the CSS color grammar. */
export function safeCssColor(value: unknown, fallback = "#64748b"): string {
  return isCssColor(value) ? value.trim() : fallback
}

/** Normalize the hex and RGB values used by native color inputs. */
export const colorHex = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if(/^#[0-9a-f]{6}$/.test(normalized)) return normalized
  if(/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split("").map(character => character.repeat(2)).join("")}`
  }
  const rgb = normalized.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/)
  if(!rgb) return "#000000"
  return `#${rgb.slice(1, 4).map(channel => Math.min(255, Number(channel)).toString(16).padStart(2, "0")).join("")}`
}
