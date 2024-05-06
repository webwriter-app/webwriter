declare module '*.grammar' {
  export const parser: import("@lezer/common").Parser;
}

declare module '*?raw' {
  const content: string;
  export default content;
}