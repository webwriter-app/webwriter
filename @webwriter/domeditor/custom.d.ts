declare module 'virtual:app-entry/*' {
  const url: string
  export default url
}

declare module 'virtual:app-version' {
  const version: string
  export default version
}

declare module 'virtual:component-licenses' {
  const content: string;
  export default content;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module 'virtual:reader-runtime-sources' {
  const sources: Record<"figure" | "print" | "document" | "attribution" | "canvas" | "imageMap" | "scopedRegistry", string>
  export default sources
}

declare module 'virtual:document-theme-sources*' {
  type ThemeName = keyof typeof import("./src/legacy-document-theme-fingerprints").legacyDocumentThemeFingerprints
  const styles: Record<ThemeName, {source: string, disclosure: boolean, originalFingerprint: string}>
  export const sharedCSS: string
  export const disclosureCSS: string
  export const documentTypographyCSS: string
  export const originalTypographyCSS: string
  export default styles
}

declare module '*?url' {
  const url: string;
  export default url;
}

declare module '*?worker&url' {
  const url: string;
  export default url;
}

// @jspm/generator's published declarations refer to this private import alias.
declare module '#fetch' {
  export function clearCache(): void
}

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly MODE: string;
  readonly VITE_EDITOR_ORIGIN?: string;
  readonly VITE_APP_ORIGIN?: string;
}

interface ImportMeta {
  readonly glob: import("vite").ImportGlobFunction;
  readonly env: ImportMetaEnv;
}
declare module 'virtual:reference-formatter-source' {
  const source: string
  export default source
}

declare module 'virtual:canvas-snapdom' {
  export {snapdom} from '@zumer/snapdom'
}

declare module 'virtual:canvas-snapdom-source' {
  const source: string
  export default source
}

declare module 'virtual:distribution-reader-sources' {
  const sources: {
    core: string
    insert: string
  }
  export default sources
}

declare module '@citation-js/core' {
  export class Cite {
    constructor(data: unknown)
    format(format: string, options?: Record<string, unknown>): string
  }
}
