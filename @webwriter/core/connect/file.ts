// Fallback list: FileSystemAccess API, Download/Upload
import {save as pickSaveFile, open as pickLoadFile, DialogFilter} from "@tauri-apps/api/dialog"
import {readBinaryFile, readTextFile, writeFile, writeBinaryFile} from "@tauri-apps/api/fs"
import { platform } from '@tauri-apps/api/os'
import { getFileExtension } from "../utility"

export class UserCancelledError extends Error {}

/*

function download(data: string, url: string) {
  const blob = new Blob([data])
  const blobURL = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = blobURL; a.download = url;
  a.click()
  URL.revokeObjectURL(blobURL)
}

async function saveFSA(data: string) {
  const blob = new Blob([data])
  const handle = await pickSaveFile()
  const writableStream = await handle.createWritable()
  await writableStream.write(blob)
  return await writableStream.close()
}

*/

export async function pickSave(filters?: DialogFilter[], defaultPath?: string) {
  return pickSaveFile({filters, defaultPath})
}

export async function save(data: any, url: string, binary=false) {
  const urlObj = new URL(url)
  const format = getFileExtension(urlObj.pathname)
  let path = decodeURI(urlObj.pathname).slice(1)
  console.log({format, path})
  path = ["darwin", "linux"].includes(await platform())? "/" + path: path
  return binary
    ? writeBinaryFile({path, contents: data})
    : writeFile({path, contents: data})
}

export async function pickLoad(filters?: DialogFilter[], multiple=false) {
  return pickLoadFile({filters, multiple})
}

export async function load(url: string, binaryExtensions=[] as string[]) {
  const urlObj = new URL(url)
  const format = getFileExtension(urlObj.pathname)
  let path = decodeURI(urlObj.pathname).slice(1)
  path = ["darwin", "linux"].includes(await platform())? "/" + path: path
  return binaryExtensions.includes(format)
    ? readBinaryFile(path)
    : readTextFile(path)
}

export const label = "This Device"

export const handlesLocationPicking = true