// Types of the files a widget can import, as `@webwriter/build` loads them: media and fonts as data URLs,
// text formats as strings, JSON as an object. The shared compiler settings (tsconfig.json of this package) include this file.
declare module '*.apng' {
  const content: string;
  export default content;
}
declare module '*.jpg' {
  const content: string;
  export default content;
}
declare module '*.jpeg' {
  const content: string;
  export default content;
}
declare module '*.jfif' {
  const content: string;
  export default content;
}
declare module '*.pjpeg' {
  const content: string;
  export default content;
}
declare module '*.pjp' {
  const content: string;
  export default content;
}
declare module '*.png' {
  const content: string;
  export default content;
}
declare module '*.svg' {
  const content: string;
  export default content;
}
declare module '*.webp' {
  const content: string;
  export default content;
}
declare module '*.bmp' {
  const content: string;
  export default content;
}
declare module '*.ico' {
  const content: string;
  export default content;
}
declare module '*.cur' {
  const content: string;
  export default content;
}
declare module '*.tif' {
  const content: string;
  export default content;
}
declare module '*.tiff' {
  const content: string;
  export default content;
}
declare module '*.wav' {
  const content: string;
  export default content;
}
declare module '*.wave' {
  const content: string;
  export default content;
}
declare module '*.mp3' {
  const content: string;
  export default content;
}
declare module '*.aac' {
  const content: string;
  export default content;
}
declare module '*.aacp' {
  const content: string;
  export default content;
}
declare module '*.oga' {
  const content: string;
  export default content;
}
declare module '*.flac' {
  const content: string;
  export default content;
}
declare module '*.weba' {
  const content: string;
  export default content;
}
declare module '*.mp4' {
  const content: string;
  export default content;
}
declare module '*.webm' {
  const content: string;
  export default content;
}
declare module '*.avif' {
  const content: string;
  export default content;
}
declare module '*.gif' {
  const content: string;
  export default content;
}
declare module '*.mov' {
  const content: string;
  export default content;
}
declare module '*.avi' {
  const content: string;
  export default content;
}
declare module '*.ogv' {
  const content: string;
  export default content;
}
declare module '*.mkv' {
  const content: string;
  export default content;
}
declare module '*.opus' {
  const content: string;
  export default content;
}
declare module '*.mpeg' {
  const content: string;
  export default content;
}
declare module '*.woff' {
  const content: string;
  export default content;
}
declare module '*.woff2' {
  const content: string;
  export default content;
}
declare module '*.ttf' {
  const content: string;
  export default content;
}
declare module '*.otf' {
  const content: string;
  export default content;
}
declare module '*.pdf' {
  const content: string;
  export default content;
}
declare module '*.json' {
  const content: {[key: string]: any};
  export default content;
}
declare module '*.jsonld' {
  const content: {[key: string]: any};
  export default content;
}
declare module '*.txt' {
  const content: string;
  export default content;
}
declare module '*.tsv' {
  const content: string;
  export default content;
}
declare module '*.md' {
  const content: string;
  export default content;
}
declare module '*.puml' {
  const content: string;
  export default content;
}
declare module '*.plantuml' {
  const content: string;
  export default content;
}
declare module '*.mmd' {
  const content: string;
  export default content;
}
declare module '*.mermaid' {
  const content: string;
  export default content;
}
declare module '*.gift' {
  const content: string;
  export default content;
}
declare module '*.vtt' {
  const content: string;
  export default content;
}
declare module '*.srt' {
  const content: string;
  export default content;
}
declare module '*.fasta' {
  const content: string;
  export default content;
}
declare module '*.fa' {
  const content: string;
  export default content;
}
declare module '*.jff' {
  const content: string;
  export default content;
}
declare module '*.dot' {
  const content: string;
  export default content;
}
declare module '*.gv' {
  const content: string;
  export default content;
}
// Any file, read as text, with the `inline:` prefix.
declare module 'inline:*' {
  const content: string;
  export default content;
}
declare module '*.csv' {
  const content: string;
  export default content;
}
declare module '*.htm' {
  const content: string;
  export default content;
}
declare module '*.html' {
  const content: string;
  export default content;
}
declare module '*.xml' {
  const content: string;
  export default content;
}
declare module '*.wasm' {
  const content: string;
  export default content;
}
declare module '*.css';
// The locale list that `lit-localize build` writes as JavaScript beside the generated catalogs.
declare module '*/generated/locale-codes.js' {
  export const sourceLocale: string;
  export const targetLocales: readonly string[];
  export const allLocales: readonly string[];
}
declare module '*/generated/locale-codes' {
  export const sourceLocale: string;
  export const targetLocales: readonly string[];
  export const allLocales: readonly string[];
}
