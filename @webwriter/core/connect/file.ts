// Fallback list: FileSystemAccess API, Download/Upload
import {save as pickSaveFile, open as pickLoadFile, DialogFilter} from "@tauri-apps/api/dialog"
import {readBinaryFile, readTextFile, writeFile, writeBinaryFile} from "@tauri-apps/api/fs"
import { WWURL } from "../utility"

export class UserCancelledError extends Error {}

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
  const handle = await showSaveFilePicker()
  const writableStream = await handle.createWritable()
  await writableStream.write(blob)
  return await writableStream.close()
}

export async function pickSave(filters?: DialogFilter[], defaultPath?: string) {
  return pickSaveFile({filters, defaultPath})
}

export async function save(data: any, url: string, binary=false) {
  const wwurl = new WWURL(url)
  const path = decodeURI(wwurl.pathname).slice(1)
  return binary
    ? writeBinaryFile({path, contents: data})
    : writeFile({path, contents: data})
}

export async function pickLoad(filters?: DialogFilter[], multiple=false) {
  return pickLoadFile({filters, multiple})
}

export async function load(url: string, binaryExtensions=[]) {
  
  const wwurl = new WWURL(url)
  const path = decodeURI(wwurl.pathname).slice(1)
  return binaryExtensions.includes(wwurl.wwformat)
    ? readBinaryFile(path)
    : readTextFile(path)
}

export const label = "This Device"

export const handlesLocationPicking = true