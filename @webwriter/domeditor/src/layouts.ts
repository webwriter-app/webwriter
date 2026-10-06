import type {ElementStyleState} from "./editor-bridge"

export type LayoutAxis = "row" | "column"
export type LayoutKind = "grid" | "flex" | "columns"
export type LayoutTrackState = {tracks: string[] | null, automatic: number, reason: string | null}
export type LayoutSelectionState = {
  kind: LayoutKind
  item: boolean
  columns: LayoutTrackState
  rows: LayoutTrackState
  style: ElementStyleState
  itemStyle?: ElementStyleState
}
