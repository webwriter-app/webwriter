import {readTextFile, readBinaryFile, writeTextFile, writeBinaryFile, removeFile, readDir, createDir, removeDir, exists, renameFile} from '@tauri-apps/api/fs'
import {join, normalize, basename, dirname, extname, resolve, isAbsolute, appDataDir as appDir} from '@tauri-apps/api/path'
import {Command, open} from "@tauri-apps/api/shell"
import {arch, platform} from "@tauri-apps/api/os"
import {open as promptRead, save as promptWrite} from "@tauri-apps/api/dialog"
import {fetch, Body, ResponseType} from "@tauri-apps/api/http"
import {Buffer} from "buffer"; window.Buffer = Buffer
import {metadata} from "tauri-plugin-fs-extra-api"
import { invoke } from '@tauri-apps/api/tauri'

import { DialogAPI, FileSystemAPI, HTTPAPI, OSAPI, PathAPI, Response, ShellAPI, Stats } from "."

export {watch} from "tauri-plugin-fs-watch-api"

const HTTP_STATUS = {
  '200': 'OK',
  '201': 'Created',
  '202': 'Accepted',
  '203': 'Non-Authoritative Information',
  '204': 'No Content',
  '205': 'Reset Content',
  '206': 'Partial Content',
  '300': 'Multiple Choices',
  '301': 'Moved Permanently',
  '302': 'Found',
  '303': 'See Other',
  '304': 'Not Modified',
  '305': 'Use Proxy',
  '306': 'Unused',
  '307': 'Temporary Redirect',
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '402': 'Payment Required',
  '403': 'Forbidden',
  '404': 'Not Found',
  '405': 'Method Not Allowed',
  '406': 'Not Acceptable',
  '407': 'Proxy Authentication Required',
  '408': 'Request Timeout',
  '409': 'Conflict',
  '410': 'Gone',
  '411': 'Length Required',
  '412': 'Precondition Required',
  '413': 'Request Entry Too Large',
  '414': 'Request-URI Too Long',
  '415': 'Unsupported Media Type',
  '416': 'Requested Range Not Satisfiable',
  '417': 'Expectation Failed',
  '418': 'I\'m a teapot',
  '429': 'Too Many Requests',
  '500': 'Internal Server Error',
  '501': 'Not Implemented',
  '502': 'Bad Gateway',
  '503': 'Service Unavailable',
  '504': 'Gateway Timeout',
  '505': 'HTTP Version Not Supported',
};

export const FS: FileSystemAPI = {
  async readFile(path, options="utf8") {
    const encoding = typeof options === "string"? options: options.encoding
    return encoding === "utf8"? readTextFile(path): readBinaryFile(path)
  },
  async writeFile(path, data, options="utf8") {
    const encoding = typeof options === "string"? options: options.encoding
    return encoding === "utf8"
      ? writeTextFile(path, data as string)
      : writeBinaryFile({path, contents: data as Uint8Array})
  },
  async unlink(path) {
    return removeFile(path)
  },
  async exists(path: string) {
    return exists(path)
  },
  async readdir(path) {
    return (await readDir(path)).map(entry => entry.name) as string[]
  },
  async mkdir(path) {
    return createDir(path, {recursive: true})
  },
  async rmdir(path) {
    return removeDir(path, {recursive: true})
  },
  async stat(path) {
    try {
      const stats = await metadata(path)
      return {
        ...stats,
        type: stats.isDir? "dir": "file",
        atime: stats.accessedAt,
        mtime: stats.modifiedAt,
        ctime: stats.createdAt,
        atimeMs: stats.accessedAt.getMilliseconds(),
        mtimeMs: stats.modifiedAt.getMilliseconds(),
        ctimeMs: stats.createdAt.getMilliseconds(),
        isDirectory: () => stats.isDir,
        isSymbolicLink: () => stats.isSymlink
      } as unknown as Stats
    }
    catch(err) {}
  },
  async lstat(path) {
    return FS.stat(path)
  },
  async readlink() { // mocked to support isomorphic-git
    console.error("readlink") 
    return "READLINK NOT IMPLEMENTED"
  },
  async symlink() { // mocked to support isomorphic-git
    console.error("symlink")
  },
  async rename(oldPath, newPath) {
    return renameFile(oldPath, newPath)
  },
  
}

export const Path: PathAPI = {
  join, normalize, basename, dirname, extname, isAbsolute, resolve, appDir 
}

export const Shell: ShellAPI = {open}

export const OS: OSAPI = {arch, platform}

export const Dialog: DialogAPI = {promptRead, promptWrite}

export const HTTP: HTTPAPI = {
  async request({url, method, headers, body, onProgress, timeout}) {
    const response = await fetch(url, {method, headers, body: body? Body.bytes(body[0] as any): undefined, timeout, responseType: ResponseType.Binary})
    console.log(response)
    return {
      url: response.url,
      method,
      headers: response.headers,
      body: [response.data],
      statusCode: response.status,
      statusMessage: (HTTP_STATUS as any)[response.status]
    } as Response
  },
  fetch: fetch as unknown as typeof window.fetch
}

/** Runs the CLI command `esbuild [args]`. */
export async function bundle(args: string[] = []) {
  const output = await Command.sidecar("bin/esbuild", args).execute()
  if(output.code !== 0) {
    throw Error(output.stderr)
  }
  else {
    return {data: output.stdout}
  }
}

/** Search using npm's registry API (https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md). Uses the registry API since the CLI doesn't support search qualifiers such as tags. */
export async function search(text: string, params?: {size?: number, from?: number, quality?: number, popularity?: number, maintenance?: number}, searchEndpoint="https://registry.npmjs.com/-/v1/search") {
  const allParams = {text, ...{size: 250, ...params}}
  const url = new URL(searchEndpoint)
  Object.entries(allParams).forEach(([k, v]) => v? url.searchParams.append(k, v.toString()): null)
  const result = await window.fetch(url.href)
  return result.ok
    ? result.json()
    : new Error(`${result.status} ${result.statusText}`)
}

/** Runs the CLI command `npm [commandArgs]`. By default, this passes the `--json` flag. Optionally, you can disable `json` or set a directory to change to with `cwd`. */
export async function pm(command: string, commandArgs: string[] = [], json=true, cwd?: string) {
  const cmdArgs = [command, ...(json ? ["--json"]: []), ...commandArgs]
  const opts = cwd? {cwd}: {}
  const output = await Command.sidecar("bin/yarn", [...cmdArgs, "--mutex file"], opts).execute()
  if(output.stderr) {
    const err = output.stderr.split("\n").map((e: any) => JSON.parse(e))
    const errors = err.filter((e: any) => e.type === "error")
    const warnings = err.filter((e: any) => e.type === "warning")
    warnings.forEach((w: any) => console.warn(w))
    if(err?.some((e: any) => e?.type === "error")) {
      throw AggregateError(errors)
    }
  }
  else {
    let result = output.stdout
    try {
      result = JSON.parse(output.stdout)
    } catch(e) {}
    return result
  }
}

export function getSystemFonts() {
  return invoke("get_system_fonts") 
}