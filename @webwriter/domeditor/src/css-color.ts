// Fixed theme columns: base color followed by five shades, like a desktop color palette.
export const themeColorColumns = [
  ["ffffff", "f2f2f2", "d9d9d9", "bfbfbf", "a6a6a6", "808080"],
  ["000000", "808080", "595959", "404040", "262626", "0d0d0d"],
  ["e7e6e6", "d0cece", "aeaaaa", "757171", "3b3838", "171616"],
  ["44546a", "d6dce4", "adb9ca", "8497b0", "333f50", "222a35"],
  ["5b9bd5", "deebf7", "bdd7ee", "9dc3e6", "2e75b6", "1f4e78"],
  ["ed7d31", "fbe5d6", "f8cbad", "f4b183", "c55a11", "833c0c"],
  ["f04b22", "faddd5", "f7b7a5", "f38e72", "bd3210", "7e210b"],
  ["ffc000", "fff2cc", "ffe699", "ffd966", "bf9000", "806000"],
  ["8064a2", "e4dfec", "ccc1d9", "b2a1c7", "60497a", "403152"],
  ["70ad47", "e2efda", "c6e0b4", "a9d18e", "548235", "375623"],
] as const
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

/** Normalize opaque hex and RGB values, with a fallback for native color inputs. */
export const colorHex = (value: string, fallback = "#000000") => {
  const normalized = value.trim().toLowerCase()
  if(/^#[0-9a-f]{6}$/.test(normalized)) return normalized
  if(/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split("").map(character => character.repeat(2)).join("")}`
  }
  const rgb = normalized.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*(\d*\.?\d+%?))?\s*\)$/)
  if(!rgb || rgb[4] !== undefined && Number.parseFloat(rgb[4]) !== (rgb[4].endsWith("%") ? 100 : 1)) return fallback
  return `#${rgb.slice(1, 4).map(channel => Math.min(255, Number(channel)).toString(16).padStart(2, "0")).join("")}`
}
