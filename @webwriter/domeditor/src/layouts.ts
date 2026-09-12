import {tokenize, TokenType} from "@csstools/css-tokenizer"
import type {ElementStyleState} from "./editor-bridge"

export type LayoutAxis = "row" | "column"
export type LayoutKind = "grid" | "flex"
export type LayoutTrackState = {tracks: string[] | null, automatic: number, reason: string | null}
export type LayoutSelectionState = {
  kind: LayoutKind
  item: boolean
  columns: LayoutTrackState
  rows: LayoutTrackState
  style: ElementStyleState
  itemStyle?: ElementStyleState
}
export type LayoutPreset = {
  id: string
  name: string
  kind: LayoutKind
  styles: Record<string, string>
  itemStyles: Record<string, string>
  items: number
}

const grid = (id: string, name: string, columns: number[], rows = 1): LayoutPreset => ({
  id, name, kind: "grid", items: columns.length * rows,
  styles: {display: "grid", "grid-template-columns": columns.map(n => `minmax(0, ${n}fr)`).join(" "), "grid-template-rows": Array(rows).fill("auto").join(" "), gap: "1rem"},
  itemStyles: {"min-inline-size": "0"},
})
export const layoutPresets: readonly LayoutPreset[] = [
  grid("two-columns", "Two columns", [1, 1]),
  grid("three-columns", "Three columns", [1, 1, 1]),
  grid("sidebar-left", "Sidebar left", [1, 2]),
  grid("sidebar-right", "Sidebar right", [2, 1]),
  grid("four-panels", "Four panels", [1, 1], 2),
  {id: "vertical-stack", name: "Vertical stack", kind: "flex", items: 3, styles: {display: "flex", "flex-direction": "column", gap: "1rem"}, itemStyles: {"min-inline-size": "0"}},
  {id: "horizontal-row", name: "Horizontal row", kind: "flex", items: 3, styles: {display: "flex", "flex-direction": "row", "flex-wrap": "wrap", gap: "1rem"}, itemStyles: {flex: "1 1 0", "min-inline-size": "0"}},
  {id: "wrapping-cards", name: "Wrapping cards", kind: "flex", items: 4, styles: {display: "flex", "flex-wrap": "wrap", gap: "1rem"}, itemStyles: {flex: "1 1 14rem", "min-inline-size": "0"}},
]

export const layoutStyleProperties = [
  "display", "grid-template-columns", "grid-template-rows", "grid-template-areas", "grid-auto-flow", "grid-auto-columns", "grid-auto-rows",
  "gap", "row-gap", "column-gap", "padding", "padding-block", "padding-inline", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "justify-content", "align-content", "align-items", "justify-items", "flex-direction", "flex-wrap", "flex-flow",
  "width", "height", "min-width", "min-height", "max-width", "max-height", "inline-size", "max-inline-size", "min-inline-size",
  "flex", "flex-grow", "flex-shrink", "flex-basis", "order", "align-self", "justify-self", "grid-row", "grid-column", "grid-area",
] as const

/** Token boundaries, rather than whitespace splitting, preserve functions and
 * reject topology we cannot safely edit. The browser still validates CSS. */
export function parseLayoutTracks(value: string): string[] | null {
  if(!value.trim() || value.trim() === "none" || value.length > 10000) return null
  const tokens = tokenize({css: value})
  const parts: string[] = []
  let start = -1, depth = 0
  for(const token of tokens) {
    if(token[0] === TokenType.EOF) break
    if(token[0] === TokenType.OpenSquare || token[0] === TokenType.CloseSquare
      || token[0] === TokenType.Function && ["var", "env"].includes(token[4].value.toLowerCase())) return null
    if(depth === 0 && [TokenType.Whitespace, TokenType.Comment].includes(token[0])) continue
    if(start < 0) start = token[2]
    if(token[0] === TokenType.Function || token[0] === TokenType.OpenParen) depth++
    if(token[0] === TokenType.CloseParen && --depth < 0) return null
    if(depth === 0) {
      parts.push(value.slice(start, token[3] + 1))
      start = -1
    }
  }
  if(depth || start !== -1) return null
  const result: string[] = []
  for(const part of parts) {
    const repeat = /^repeat\(\s*(\d+)\s*,([\s\S]*)\)$/i.exec(part)
    if(repeat) {
      const count = Number(repeat[1])
      if(count < 1 || count > 100) return null
      const inner = parseLayoutTracks(repeat[2])
      if(!inner || count * inner.length + result.length > 100) return null
      for(let i = 0; i < count; i++) result.push(...inner)
    }
    else {
      const first = tokenize({css: part})[0]
      if(first[0] === TokenType.Ident && !["auto", "min-content", "max-content"].includes(first[4].value.toLowerCase())) return null
      if(first[0] === TokenType.Function && !["minmax", "fit-content", "calc"].includes(first[4].value.toLowerCase())) return null
      if(![TokenType.Ident, TokenType.Function, TokenType.Dimension, TokenType.Percentage, TokenType.Number].includes(first[0])) return null
      if(first[0] === TokenType.Number && first[4].value !== 0) return null
      if((first[0] === TokenType.Dimension || first[0] === TokenType.Percentage) && first[4].value < 0) return null
      result.push(part)
    }
    if(result.length > 100) return null
  }
  return result.length ? result : null
}

export function layoutFraction(track: string) {
  const match = /^(?:(minmax\(.+,\s*))?([\d.]+)fr(\))?$/i.exec(track)
  if(!match || Boolean(match[1]) !== Boolean(match[3])) return null
  const value = Number(match[2])
  return value > 0 && Number.isFinite(value) ? {value, format: (n: number) => `${match[1] ?? ""}${Math.round(n * 1000) / 1000}fr${match[3] ?? ""}`} : null
}

/** Resolve only finite, unambiguous authored placements. Null means the
 * command must preserve the declaration and withhold structural controls. */
export function layoutPlacement(start: string, end: string, tracks: number): [number, number] | "auto" | null {
  start = start.trim() || "auto"
  end = end.trim() || "auto"
  if(start === "auto" && end === "auto") return "auto"
  const line = (value: string) => /^-?[1-9]\d*$/.test(value) ? Number(value) < 0 ? tracks + 2 + Number(value) : Number(value) : null
  const span = (value: string) => /^span\s+[1-9]\d*$/.test(value) ? Number(value.slice(5).trim()) : null
  let from = line(start), to = line(end)
  if(from !== null && end === "auto") to = from + 1
  if(to !== null && start === "auto") from = to - 1
  if(from !== null && span(end)) to = from + span(end)!
  if(to !== null && span(start)) from = to - span(start)!
  return from !== null && to !== null && from >= 1 && to > from && to <= tracks + 1 ? [from, to] : null
}

export function remapLayoutPlacement(placement: [number, number], index: number, remove: boolean): [number, number] | "auto" {
  const boundary = index + 1
  const [start, end] = placement
  if(remove) {
    if(start === boundary && end === boundary + 1) return "auto"
    return [start > boundary ? start - 1 : start, end > boundary ? end - 1 : end]
  }
  return [start >= boundary ? start + 1 : start, end > boundary ? end + 1 : end]
}
