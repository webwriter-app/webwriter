type Point = {x: number, y: number}
type Rect = {left: number, top: number, right: number, bottom: number}
export const canvasGridSize: number
export type CanvasNavigation = "zoom-in" | "zoom-out" | "actual-size" | "fit-content"
export function canvasStartingView(body?: HTMLElement): HTMLDivElement | null
export function isCanvasStartingView(element: Element): element is HTMLDivElement
/** The dependency-free JavaScript module is also embedded verbatim in exports. */
export class CanvasViewer {
  constructor(slot: HTMLSlotElement, background: HTMLElement, controls: HTMLElement, onChange?: () => void)
  readonly zoom: number
  readonly active: boolean
  items(): (HTMLElement | SVGSVGElement)[]
  clientPoint(x: number, y: number): Point
  zoomAt(zoom: number, point?: Point): void
  fit(): void
  startView(): boolean
  reveal(rect: Rect): void
  panAtEdge(point: Point): boolean
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
