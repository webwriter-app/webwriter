// Fallback list: FileSystemAccess API, Download/Upload
import {save as pickSave, open as pickLoad, DialogFilter} from "@tauri-apps/api/dialog"
import {readTextFile, writeFile} from "@tauri-apps/api/fs"
import { WWURL } from "webwriter-model";

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

export async function save(data: string, url?: string, filters?: DialogFilter[], defaultPath?: string) {
  
  let path: string
  if(!url) {
    path = await pickSave({filters, defaultPath})
  }
  else {
    const wwurl = new WWURL(url)
    path = wwurl.pathname
  }
  await writeFile({path, contents: data})
  return {url: new WWURL(path.replace("\\", "/")).href}
}

export async function load(url?: string, filters?: DialogFilter[]) {
  
  let path: string
  if(!url) {
    path = await pickLoad({multiple: false, filters}) as string
    if(path === null) {
      return null
    }
  }
  else {
    const wwurl = new WWURL(url)
    path = wwurl.pathname
  }
  return {data: await readTextFile(path), url: new WWURL(path.replace("\\", "/")).href}
}

export const label = "This Device"

export const handlesLocationPicking = true