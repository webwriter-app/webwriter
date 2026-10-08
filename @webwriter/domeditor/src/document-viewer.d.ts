export interface DocumentReader {
  destroy(): void
}

export function mountDocumentReader(): DocumentReader | null
