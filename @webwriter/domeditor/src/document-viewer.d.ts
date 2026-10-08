export interface DocumentReader {
  destroy(): void
}

export function mountDocumentReader(licenses?: ReadonlyArray<{code: string, name: string, url: string}>, appIcon?: string): DocumentReader | null
