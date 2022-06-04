// Fallback list: FileSystemAccess API, Download/Upload
import {save as pickSave, open as pickLoad} from "@tauri-apps/api/dialog"
import {readTextFile, writeFile} from "@tauri-apps/api/fs"
import { WWURL } from "../utility";

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

export async function save(data: string, url?: string) {
  
  let path: string
  if(!url) {
    path = await pickSave()
  }
  else {
    const wwurl = new WWURL(url)
    path = wwurl.pathname
  }
  await writeFile({path, contents: data})
  return path
}

export async function load(url?: string) {
  
  let path: string
  if(!url) {
    path = await pickLoad({multiple: false}) as string
  }
  else {
    const wwurl = new WWURL(url)
    path = wwurl.pathname
  }
  await readTextFile(path)
  return path
}

export const label = "This Device"

export const handlesLocationPicking = true