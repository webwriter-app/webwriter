import {fstatSync, mkdtempSync, readdirSync, readFileSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join, relative, sep} from "node:path"
import {fileURLToPath} from "node:url"

const docs = fileURLToPath(new URL("../../../../docs/widgets/", import.meta.url))
const usage = "Usage: webwriter-guidance.mjs search <query> | retrieve <id[,id...]> | list"
const stopWords = new Set("a an and are as at be by can do for from how i in is it of on or the to use what which with you".split(" "))

function terms(text) {
  const words = text
    .replace(/[a-z][a-z\d]*(?:[A-Z][a-z\d]*)+/g, word => `${word} ${word.replace(/([a-z\d])([A-Z])/g, "$1 $2")}`)
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? []
  return new Set(words.filter(word => !stopWords.has(word)).map(word => word.replace(/([a-z]{2,}[^s])s$/, "$1")))
}

function readCatalog(directory = docs) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = join(directory, entry.name)
    if(entry.isDirectory() && entry.name !== "examples") return readCatalog(path)
    if(!entry.isFile() || !entry.name.endsWith(".md")) return []

    const id = relative(docs, path).split(sep).join("/").slice(0, -3)
    const source = readFileSync(path, "utf8")
    const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").replace(/<!--[\s\S]*?-->/g, "")
    const prose = body.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\r?\n[\s\S]*?^ {0,3}\1[ \t]*\r?$/gm, "")
    const titles = [...prose.matchAll(/^# (.+)$/gm)].map(([, title]) => title.trim().replace(/^\w+\. /, ""))
    const title = titles.join(", ") || id
    const paragraphs = prose.trim().split(/\r?\n\s*\r?\n/)
      .filter(paragraph => /^(?:\*\*)?[A-Z`]/.test(paragraph))
      .slice(0, 3)
      .map(paragraph => paragraph.replace(/!?\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " "))
    const description = paragraphs.length ? `${title} — ${paragraphs[0]}` : title
    const headings = [...prose.matchAll(/^#{2,6} (.+)$/gm)].map(([, heading]) => heading).join(" ")
    return [{
      id, description, source,
      titleTerms: terms(`${id} ${title}`),
      headingTerms: terms(headings),
      summaryTerms: terms(paragraphs.join(" ")),
      bodyTerms: terms(body),
    }]
  })
}

function search(catalog, query) {
  const queryTerms = [...terms(query)]
  const weights = queryTerms.map(term => {
    const matches = catalog.filter(guide => guide.bodyTerms.has(term) || guide.titleTerms.has(term)).length
    return Math.log(1 + catalog.length / (1 + matches))
  })
  return catalog.map(guide => ({
    guide,
    score: queryTerms.reduce((score, term, index) => {
      const weight = guide.titleTerms.has(term) ? 6
        : guide.headingTerms.has(term) ? 3
        : guide.summaryTerms.has(term) ? 2
        : guide.bodyTerms.has(term) ? 1 : 0
      return score + weight * weights[index]
    }, 0),
  })).filter(({score}) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({guide}) => guide)
}

function printEntries(guides) {
  console.log(JSON.stringify(guides.map(({id, description}) => ({id, description})), null, 2))
}

function retrieve(catalog, ids) {
  const guides = new Map(catalog.map(guide => [guide.id, guide]))
  const pages = [...new Set(ids)].flatMap(id => {
    const guide = guides.get(id)
    if(guide) return [`--- docs/widgets/${id}.md ---\n\n${guide.source.trimEnd()}\n`]
    console.error(`Unknown documentation ID: ${id}`)
    process.exitCode = 1
    return []
  })
  const output = pages.join("\n")
  if(Buffer.byteLength(output) > 9500 && !fstatSync(1).isFile()) {
    const path = join(mkdtempSync(join(tmpdir(), "webwriter-guidance-")), "guides.md")
    writeFileSync(path, output)
    console.log(`Output saved to ${path}. Read the file in full.`)
  }
  else process.stdout.write(output)
}

function main([command, ...args]) {
  const argument = args.join(" ").trim()
  if(command === "--help" || command === "-h") {
    console.log(usage)
    return
  }
  const ids = argument.split(/[,\s]+/).filter(Boolean)
  if(!(command === "list" && !args.length || command === "search" && argument || command === "retrieve" && ids.length)) {
    throw new Error(usage)
  }
  const catalog = readCatalog().sort((a, b) => a.id.localeCompare(b.id))
  if(command === "search") printEntries(search(catalog, argument))
  else if(command === "retrieve") retrieve(catalog, ids)
  else printEntries(catalog)
}

try {
  main(process.argv.slice(2))
}
catch(error) {
  console.error(error.message)
  process.exitCode = 1
}
