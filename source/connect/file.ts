import {Document} from "../model"
// import {readTextFile, writeFile} from "@tauri-apps/api/fs"

const writeFile = (...args) => {}; const readTextFile = (...args) => {}

export async function save(data: string, url: string) {
  return writeFile({path: url, contents: data})
}

export async function load(url: string) {
  return readTextFile(url)
}