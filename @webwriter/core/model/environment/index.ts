import { WindowOptions } from "@tauri-apps/api/window";
import { Package } from ".."

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

export type Platform = "linux" | "darwin" | "ios" | "freebsd" | "dragonfly" | "netbsd" | "openbsd" | "solaris" | "android" | "win32"

export type Arch = "x86" | "x86_64" | "arm" | "aarch64" | "mips" | "mips64" | "powerpc" | "powerpc64" | "riscv64" | "s390x" | "sparc64"

export type OpenDialogOptions = {
  defaultPath?: string,
  directory?: boolean,
  filters?: {name: string, extensions: string[]}[]
  multiple?: boolean,
  recursive?: boolean,
  title?: string
}

export type SaveDialogOptions = {
  defaultPath?: string,
  filters?: {name: string, extensions: string[]}[]
  title?: string
}

export type WatchEvent = {kind: "any" | "AnyContinous", path: string}



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

export type OSAPI = {
  platform: () => Promise<Platform>
  arch: () => Promise<Arch>
}

export type ConfirmDialogOptions = {
  cancelLabel?: string,
  okLabel?: string,
  title?: string,
  type?: "info" | "warning" | "error"
}

export type DialogAPI = {
  promptRead: (options?: OpenDialogOptions) => Promise<null | string | string[]>
  promptWrite: (options?: SaveDialogOptions) => Promise<string | null>,
  confirm: (message: string, options?: ConfirmDialogOptions) => Promise<boolean>
}

export type WindowCloseBehavior = "closeAllIfLastVisible" | "hideOnCloseUnlessLast" | "closeOthersOnReload"

export type Environment = {
  FS: FileSystemAPI,
  Path: PathAPI,
  Shell: ShellAPI,
  HTTP: HTTPAPI,
  OS: OSAPI,
  Dialog: DialogAPI,
  bundle: (args?: string[], cwd?: string) => Promise<string>,
  search: (text: string, params?: {size?: number, from?: number, quality?: number, popularity?: number, maintenance?: number}, searchEndpoint?: string) => Promise<SearchResults>,
  pm: (command: string, commandArgs?: string[], cwd?: string) => Promise<string>,
  watch: (paths: string | string[], cb?: (event: {attrs: any, paths: string[], type: {create?: any, modify?: any, remove?: any}}) => void, options?: {recursive?: boolean, delayMs?: number}) => Promise<() => void> // wait for FileSystemObserver, shim with polling?
  getSystemFonts: () => Promise<string[]>, // wait for Local Font Access API?
  createWindow: (url?: string, options?: WindowOptions & {label?: string, hideOnClose?: boolean}) => Promise<void>,
  setWindowCloseBehavior: (behaviors: WindowCloseBehavior[], closeConfirm?: () => Promise<boolean>) => void
  getWindowLabel: () => string,
  checkUpdate: () => Promise<{date: string, version: string}>,
  installUpdate: () => Promise<void>
}