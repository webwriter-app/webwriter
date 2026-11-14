import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from "node:fs"
import {join, relative, sep} from "node:path"
import {fileURLToPath, pathToFileURL} from "node:url"

const checkoutDocs = fileURLToPath(new URL("../domeditor/docs/widgets/", import.meta.url))
const snapshot = new URL("./dist/widget-docs.json", import.meta.url)

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
  return existsSync(checkoutDocs) ? readWidgetDocs() : JSON.parse(readFileSync(snapshot, "utf8"))
}

if(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const docs = readWidgetDocs().sort((a, b) => a.id.localeCompare(b.id))
  mkdirSync(new URL(".", snapshot), {recursive: true})
  writeFileSync(snapshot, JSON.stringify(docs) + "\n")
}
