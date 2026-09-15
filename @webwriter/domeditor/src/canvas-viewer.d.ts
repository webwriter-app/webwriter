type Point = {x: number, y: number}
type Rect = {left: number, top: number, right: number, bottom: number}
export type CanvasNavigation = "zoom-in" | "zoom-out" | "actual-size" | "fit-content"
/** The dependency-free JavaScript module is also embedded verbatim in exports. */
export class CanvasViewer {
  constructor(slot: HTMLSlotElement, background: HTMLElement, controls: HTMLElement, onChange?: () => void)
  readonly zoom: number
  readonly active: boolean
  clientPoint(x: number, y: number): Point
  zoomAt(zoom: number, point?: Point): void
  fit(): void
  reveal(rect: Rect): void
  panAtEdge(point: Point, rect?: Rect): boolean
  applyCamera(): void
  startPan(event: PointerEvent): void
  movePan(event: PointerEvent): void
  endPan(event: PointerEvent): void
  stopPan(): void
  wheel(event: WheelEvent): void
  navigate(operation: CanvasNavigation): void
  destroy(): void
}
export const canvasControlsStyles: string
export function mountCanvasReader(): {viewer: CanvasViewer, destroy(): void} | null
