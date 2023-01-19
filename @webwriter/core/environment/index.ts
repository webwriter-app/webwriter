import { Package } from "../state";

export * from "./tauri"
// export * from "./node"

export type HTTPMethod = "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "CONNECT" | "OPTIONS" | "TRACE" | "PATCH"

export interface Stats {
  type: 'file' | 'dir';
  mode: any;
  size: number;
  ino: any;
  mtimeMs: any;
  ctimeMs: any;
  uid: 1;
  gid: 1;
  dev: 1;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export type Request = {
  url: string,
  method: HTTPMethod,
  headers: Record<string, string>,
  body: string | Uint8Array[],
  onProgress: Function,
  timeout: number
}

export type Response = {
  url: string,
  method: HTTPMethod,
  headers: Record<string, string>,
  body: string | Uint8Array[],
}

export type SearchResults = {
  total: number,
  time: string,
  objects: {
    package: Package,
    score: {
      final: number,
      detail: {quality: number, popularity: number, maintenance: number}
    },
    searchScore: number
  }[]
}

export type FileSystemAPI = {
  mkdir: (path: string, options?: {mode: number}) => Promise<void>
  rmdir: (path: string, options?: undefined) => Promise<void>
  readdir: (path: string, options?: undefined) => Promise<string[]>
  readFile: (path: string, options?: {encoding?: "utf8"} | string | undefined) => Promise<Uint8Array | string>
  writeFile: (path: string, data: Uint8Array | string, options?: {mode: number, encoding?: "utf8"} | string | undefined) => Promise<void>
  exists: (path: string) => Promise<boolean>
  unlink: (path: string, options?: undefined) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  stat: (path: string, options?: undefined) => Promise<Stats | void>
  lstat: (path: string, options?: undefined) => Promise<Stats | void>
  symlink: (targetPath: string, linkPath: string) => Promise<void>
  readlink: (path: string, options?: undefined) => Promise<string>
}

export type PathAPI = {
  join: (...parts: string[]) => Promise<string>
  normalize: (path: string) => Promise<string>
  basename: (path: string) => Promise<string>
  dirname: (path: string) => Promise<string>
  extname: (path: string) => Promise<string>
  resolve: (...paths: string[]) => Promise<string>
  isAbsolute: (path: string) => Promise<boolean>
  appDir: () => Promise<string>
}

export type ShellAPI = {
  open: (path: string, openWith?: string) => Promise<void>
}

export type HTTPAPI = {
  request: ({url, method, headers, body, onProgress, timeout}: Request) => Promise<Response>,
  fetch: typeof fetch
}

export type Environment = {
  FS: FileSystemAPI,
  Path: PathAPI,
  Shell: ShellAPI,
  HTTP: HTTPAPI,
  bundle: (args?: string[]) => Promise<{data: string}>,
  search: (text: string, params?: {size?: number, from?: number, quality?: number, popularity?: number, maintenance?: number}, searchEndpoint?: string) => Promise<SearchResults>,
  npm: (command: string, commandArgs?: string[], json?: boolean, cwd?: string) => Promise<Object | string>
}