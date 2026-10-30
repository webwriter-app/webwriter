export const attributionAttributes: Readonly<Record<"name" | "year" | "license" | "contact" | "type", string>>
export type AttributionValues = Record<keyof typeof attributionAttributes, string>
export interface AttributionController {
  element: HTMLElement
  handleEvent(event: Event): void
  refresh(): void
  open(element: Element | Element[]): boolean
  destroy(): void
}
export function createAttributionController(doc: Document, options?: {
  licenses?: ReadonlyArray<{code: string, name: string, url: string, description?: string}>
  createLicensePicker?: (input: HTMLInputElement) => HTMLElement & {value: string, close(reset?: boolean): void}
  editable?: () => boolean
  canAttribute?: (element: Element) => boolean
  selectedElement?: () => Element | null
  affordanceContainer?: (element: Element) => HTMLElement | null
  resolveElement?: (element: Element) => Element
  append?: (element: HTMLElement) => void
  save?: (elements: Element[], values: Partial<AttributionValues>) => boolean
}): AttributionController
export function mountAttributionReader(licenses?: ReadonlyArray<{code: string, name: string, url: string, description?: string}>): AttributionController | null
