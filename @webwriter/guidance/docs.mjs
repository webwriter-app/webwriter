import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from "node:fs"
import {join, relative, sep} from "node:path"
import {fileURLToPath, pathToFileURL} from "node:url"

const checkoutDocs = fileURLToPath(new URL("../domeditor/docs/widgets/", import.meta.url))
const checkoutKeywords = new URL("../domeditor/src/widget-keywords.json", import.meta.url)
const snapshot = new URL("./dist/widget-docs.json", import.meta.url)
const readJSON = file => JSON.parse(readFileSync(file, "utf8"))

function readWidgetDocs(directory = checkoutDocs) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = join(directory, entry.name)
    if(entry.isDirectory() && entry.name !== "examples") return readWidgetDocs(path)
    if(!entry.isFile() || !entry.name.endsWith(".md")) return []
    const id = relative(checkoutDocs, path).split(sep).join("/").slice(0, -3)
    return [{id, source: readFileSync(path, "utf8")}]
  })
}

export function loadWidgetDocs() {
  return existsSync(checkoutDocs) ? readWidgetDocs() : readJSON(snapshot).docs
}

export function loadWidgetKeywords() {
  return existsSync(checkoutKeywords) ? readJSON(checkoutKeywords) : readJSON(snapshot).widgetKeywords
}

if(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const docs = readWidgetDocs().sort((a, b) => a.id.localeCompare(b.id))
  mkdirSync(new URL(".", snapshot), {recursive: true})
  writeFileSync(snapshot, JSON.stringify({docs, widgetKeywords: readJSON(checkoutKeywords)}) + "\n")
}
