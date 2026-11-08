export function presentationElementSelector(element: Element, preferId?: boolean, scope?: Document | ShadowRoot): string | null
export function presentationStateSelector(doc: Document, state: string): string
export function refreshPresentationStyles(doc: Document): void
export function flushPresentationStyles(doc: Document): void
export function trackPresentationStyles(doc: Document, sheet: CSSStyleSheet): () => void
export function hasPresentationState(element: Element | null | undefined, state: string): boolean
export function setPresentationState(element: Element | null | undefined, state: string, active?: boolean): void
export function setPresentationStates(element: Element | null | undefined, ...states: string[]): void
export function clearPresentationState(element: Element | null | undefined, ...states: string[]): void
export function clearEditorPresentation(doc: Document): void
export function batchPresentationStates<T>(doc: Document, update: () => T): T
export function presentationStateElements<T extends Element = Element>(root: Document | Element | ShadowRoot, ...states: string[]): T[]
export function resolvePresentationSelector(doc: Document, selector: string): string
