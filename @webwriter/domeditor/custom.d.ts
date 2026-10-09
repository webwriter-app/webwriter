declare module 'virtual:component-licenses' {
  const content: string;
  export default content;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '*?url' {
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
  readonly env: ImportMetaEnv;
}
declare module 'virtual:reference-formatter-source' {
  const source: string
  export default source
}

declare module '@citation-js/core' {
  export class Cite {
    constructor(data: unknown)
    format(format: string, options?: Record<string, unknown>): string
  }
}
