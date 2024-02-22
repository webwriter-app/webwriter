import {readTextFile, readBinaryFile, writeTextFile, writeBinaryFile, removeFile, readDir, createDir, removeDir, exists, renameFile} from "@tauri-apps/api/fs"
import {join, normalize, basename, dirname, extname, resolve, isAbsolute, appDataDir as appDir} from "@tauri-apps/api/path"
import {Command, open} from "@tauri-apps/api/shell"
import {arch, platform} from "@tauri-apps/api/os"
import {open as promptRead, save as promptWrite} from "@tauri-apps/api/dialog"
import {fetch, Body, ResponseType} from "@tauri-apps/api/http"
import {Buffer} from "buffer"; window.Buffer = Buffer
import {metadata} from "tauri-plugin-fs-extra-api"
import { invoke } from "@tauri-apps/api/tauri"
import { WebviewWindow, WindowOptions, getAll, getCurrent } from "@tauri-apps/api/window"
import {listen} from "@tauri-apps/api/event"
import {exit} from "@tauri-apps/api/process"

import { DialogAPI, FileSystemAPI, HTTPAPI, OSAPI, PathAPI, Response, ShellAPI, Stats, WindowCloseBehavior } from "."
import { idle } from "../../utility"

export {watchImmediate as watch} from "tauri-plugin-fs-watch-api"
import {confirm} from "@tauri-apps/api/dialog"
export { checkUpdate, installUpdate } from "@tauri-apps/api/updater"

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

export const Dialog: DialogAPI = {promptRead, promptWrite, confirm}

export const HTTP: HTTPAPI = {
  async request({url, method, headers, body, onProgress, timeout}) {
    const response = await fetch(url, {method, headers, body: body? Body.bytes(body[0] as any): undefined, timeout, responseType: ResponseType.Binary})
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
  console.info(`[TAURI] > esbuild ${args.join(" ")}`)
  const output = await Command.sidecar("bin/esbuild", [...args]).execute()
  console.log(output.code, output.stdout, output.stderr)
  if(!output.code) {
    return output.stderr
  }
  else {
    throw output.stderr
  }
}

/** Search using npm's registry API (https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md). Uses the registry API since the CLI doesn't support search qualifiers such as tags. */
export async function search(text: string, params?: {size?: number, quality?: number, popularity?: number, maintenance?: number}, searchEndpoint="https://registry.npmjs.com/-/v1/search") {
  const allParams = {text, ...{size: 250, ...params}}
  const baseURL = new URL(searchEndpoint)
  Object.entries(allParams).forEach(([k, v]) => v? baseURL.searchParams.append(k, v.toString()): null)
  let from = 0
  let total = Number.POSITIVE_INFINITY
  let objects: any[] = []
  let time = undefined
  do {
    let url = new URL(baseURL.href)
    url.searchParams.set("from", String(from))
    const result = await window.fetch(baseURL)
    if(result.ok) {
      const body = await result.json()
      from += params?.size ?? 250
      total = body.total
      time = body.time
      objects = objects.concat(body.objects)
    }
    else {
      return new Error(`${result.status} ${result.statusText}`)
    }
  } while(from < total)
  return {objects, total, time}
}

/** Runs the CLI command `pnpm [commandArgs]`. */
export async function pm(command: string, commandArgs: string[] = [], cwd?: string) {
  const defaultArgs = ["--reporter=ndjson"]
  const cmdArgs = [command, ...defaultArgs, ...commandArgs]
  const opts = cwd? {cwd}: {}
  console.info(`[TAURI] ${cwd? cwd: await appDir()}> pnpm ${cmdArgs.join(" ")}`)
  const output = await Command.sidecar("bin/pnpm", cmdArgs, opts).execute()
  // console.log(output.stdout, output.stderr)
  if(!output.stderr) {
    const error = output.stdout.split("\n")
      .map(entry => entry.replaceAll("\n", "\\n"))
      .map(entry => {
        try {
          return JSON.parse(entry)
        }
        catch(err) {
          return {level: "ignore"}
        }
      })
      .filter(entry => entry.level === "error")
      .join("\n")
    if(!error) {
      return
    }
    else {
      throw new Error(error)
    }
  }
  else {
    console.log("throwing stderr")
    throw new Error(output.stderr)
  }
}

/** Get the names of all fonts installed on the user's system. */
export function getSystemFonts() {
  return invoke("get_system_fonts") 
}




/** Create a new window. */
export async function createWindow(url="index.html", options?: WindowOptions & {label?: string}) {
  const allWindows = getAll()
  const allLabels = allWindows.map(w => w.label)
  const i = Math.max(...allLabels.map(l => parseInt(l)), 1) + 1
  const existingWebview = WebviewWindow.getByLabel(options?.label ?? "")
  if(existingWebview && !(await existingWebview.isVisible())) {
    return existingWebview?.show()
  }
  else if(existingWebview && await existingWebview.isVisible()) {
    await existingWebview.unminimize()
    await existingWebview.setFocus()
  }
  else {
    const webview = new WebviewWindow(options?.label ?? `${i}`, {url, ...options})
    return new Promise((resolve, reject) => {
      webview.once("tauri://created", () => resolve(url))
      webview.once("tauri://error", e => reject(e))
    })
  }
}

export function setWindowCloseBehavior(behaviors: WindowCloseBehavior[], closeConfirm?: () => Promise<boolean>) {
  const webview = getCurrent()
  for(const behavior of behaviors) {
    if(behavior === "closeAllIfLastVisible") {
      webview.onCloseRequested(async e => {
        if(closeConfirm && !(await closeConfirm())) {
          e.preventDefault()
          return
        }
        const allWindows = getAll()
        const visibilityList = await Promise.all(allWindows.map(w => w.isVisible()))
        const isLast = !allWindows.some((w, i) => w.label !== webview.label && visibilityList[i])
        if(isLast) {
          e.preventDefault()
          exit(0)
        }
      })
    }
    else if(behavior === "hideOnCloseUnlessLast") {
      webview.onCloseRequested(async e => {
        if(closeConfirm && await closeConfirm()) {
          e.preventDefault()
          return
        }
        getAll().length > 1 && e.preventDefault()
        webview.hide()
      })
    }
    else if(behavior === "closeOthersOnReload") {
      window.addEventListener("beforeunload", e => {
        getAll().filter(w => w.label !== webview.label).forEach(w => w.close())
      })
    }
  }
}

export function getWindowLabel() {
  return getCurrent().label
}