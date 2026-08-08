declare module '*.grammar' {
  export const parser: import("@lezer/common").Parser;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '*?bundledstring' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
