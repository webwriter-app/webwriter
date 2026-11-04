type Point = {x: number, y: number}
type Rect = {left: number, top: number, right: number, bottom: number}
type Snapdom = typeof import("@zumer/snapdom").snapdom
export type LoadSnapdom = () => Snapdom | Promise<Snapdom>
export const canvasGridSize: number
export const canvasIcons: {hand: string, fit: string}
export type CanvasNavigation = "zoom-in" | "zoom-out" | "actual-size" | "fit-content"
export function canvasStartingView(body?: HTMLElement): HTMLDivElement | null
export function isCanvasStartingView(element: Element): element is HTMLDivElement
export function createCanvasPanSurface(): HTMLDivElement
/** The JavaScript module is also embedded verbatim in exports. */
export class CanvasViewer {
  constructor(slot: HTMLSlotElement, background: HTMLElement, controls: HTMLElement, panSurface?: HTMLElement | null, onChange?: () => void, loadSnapdom?: LoadSnapdom)
  readonly zoom: number
  readonly active: boolean
  items(): (HTMLElement | SVGSVGElement)[]
  clientPoint(x: number, y: number): Point
  mountMinimap(): void
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
  updatePanSurface(): void
  continuesWheelPan(event: WheelEvent): boolean
  stopWheelPan(): void
  wheel(event: WheelEvent, respectScrollContainers?: boolean): boolean
  navigate(operation: CanvasNavigation): void
  destroy(): void
}
export const canvasControlsStyles: string
export function mountCanvasReader(loadSnapdom?: LoadSnapdom): {viewer: CanvasViewer, destroy(): void} | null
