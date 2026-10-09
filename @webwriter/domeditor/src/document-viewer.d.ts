export interface DocumentReader {
  destroy(): void
}

export type ReferenceData = {type: string, title: string, [key: string]: unknown}
export type DocumentReference = {href: string, data: ReferenceData, anchors: HTMLAnchorElement[], conflict: boolean}
export function parseReference(value: string | null): ReferenceData | null
export function collectReferences(body: HTMLElement): DocumentReference[]
export type ReferenceFormatter = (references: DocumentReference[], format: "bibliography" | "bibtex", style?: string) => string
export function mountDocumentReader(licenses?: ReadonlyArray<{code: string, name: string, url: string}>, appIcon?: string, formatter?: ReferenceFormatter | null): DocumentReader | null
