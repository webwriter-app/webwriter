type Point = {x: number, y: number}
type Rect = {left: number, top: number, right: number, bottom: number}
type Snapdom = typeof import("@zumer/snapdom").snapdom
export type LoadSnapdom = () => Snapdom | Promise<Snapdom>
export type CanvasStartingViewBounds = Point & {width: number, height: number}
type StartingViewEditing = {
  add(): boolean
  remove(): boolean
  canAdd(): boolean
  canRemove(frame: HTMLDivElement): boolean
  canSelect(frame: HTMLDivElement): boolean
  canMove(frame: HTMLDivElement): boolean
  canResize(frame: HTMLDivElement): boolean
  move(frame: HTMLDivElement, offset: Point): void
  resize(frame: HTMLDivElement, bounds: CanvasStartingViewBounds): void
}
export const canvasGridSize: number
export const canvasIcons: {hand: string, fit: string, reset: string}
export function groupCanvasZoomPresets(reset: HTMLButtonElement, fit: HTMLButtonElement): HTMLElement
export function updateCanvasZoomControls(controls: HTMLElement | null, zoom: number): void
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
  mountMinimap(toolbar: HTMLElement, editStartingView?: StartingViewEditing): void
  updateStartingView(): void
  setMinimapRefreshPaused(paused: boolean): void
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
