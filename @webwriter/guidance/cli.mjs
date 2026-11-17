#!/usr/bin/env node
import {spawnSync} from "node:child_process"
import {existsSync, fstatSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {delimiter, dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

import {loadWidgetDocs, loadWidgetKeywords} from "./docs.mjs"

const skill = "webwriter-guidance"
const usage = `Usage: ${skill} <command>

  search <query>          Find WebWriter widget docs
  list                    List documentation IDs and descriptions
  retrieve <id[,id...]>   Read the full Markdown for one or more pages
  badges [package.json]   List badges and guide IDs. With a manifest, resolve its keywords and report invalid ones
  install [options]       Install the skill using the Vercel Skills CLI
  uninstall [options]     Remove the skill using the Vercel Skills CLI`
const stopWords = new Set("a an and are as at be by can do for from how i in is it of on or the to use what which with you".split(" "))

function terms(text) {
  const words = text
    .replace(/[a-z][a-z\d]*(?:[A-Z][a-z\d]*)+/g, word => `${word} ${word.replace(/([a-z\d])([A-Z])/g, "$1 $2")}`)
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? []
  return new Set(words.filter(word => !stopWords.has(word)).map(word => word.replace(/([a-z]{2,}[^s])s$/, "$1")))
}

function describe({id, source}) {
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
  return {
    id, description, source,
    titleTerms: terms(`${id} ${title}`),
    headingTerms: terms(headings),
    summaryTerms: terms(paragraphs.join(" ")),
    bodyTerms: terms(body),
  }
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

const elementName = /^[a-z][a-z0-9_.-]*$/
const mediaType = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/
const fileExtension = /^\.[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)*$/
const semver = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const conversionKey = value => [elementName, mediaType, fileExtension].some(pattern => pattern.test(value.toLowerCase()))
const validValue = {
  "widget-convertible-to-": conversionKey,
  "widget-convertible-from-": conversionKey,
  "widget-migrates-from-": value => {
    const version = semver.exec(value)
    return !!version && !version[1]?.split(".").some(part => /^0\d+$/.test(part))
  },
  "widget-lang-": value => {
    try { return /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(value) && Intl.getCanonicalLocales(value).length === 1 }
    catch { return false }
  },
}
const valueHint = {
  "widget-convertible-to-": "a media type such as image/png, an extension such as .jff, or an HTML element name",
  "widget-convertible-from-": "a media type such as image/png, an extension such as .jff, or an HTML element name",
  "widget-migrates-from-": "a SemVer version such as 1.2.0",
  "widget-lang-": "a BCP 47 language tag such as en-US",
}

/** The problem with a keyword of a manifest, or undefined when it is valid or free-form. */
function keywordProblem(keyword, catalog, {isced}) {
  const normalized = keyword.toLowerCase()
  const level = /^isced2011-(.*)$/.exec(normalized)
  if(level) return /^[0-9][0-9]{0,2}$/.test(level[1]) ? undefined
    : `"${keyword}" is not an ISCED 2011 level. Use isced2011-<0–9>, optionally followed by up to two digits of the category.`
  const field = /^iscedf2013-(.*)$/.exec(normalized)
  if(field) {
    if(!/^\d{2,4}$/.test(field[1])) return `"${keyword}" is not an ISCED-F 2013 code. Use two digits for a broad field, three for a narrow field, or four for a detailed field.`
    return Object.hasOwn(isced.fields, field[1]) ? undefined : `"${keyword}" is not in the ISCED-F 2013 code list.`
  }
  const entry = catalog.find(entry => entry.pattern ? normalized.startsWith(entry.keyword) : normalized === entry.keyword)
  if(!entry) return /^(?:widget-|webwriter-)/.test(normalized) ? `"${keyword}" is not a WebWriter widget keyword.` : undefined
  if(!entry.pattern) return undefined
  const value = keyword.slice(entry.keyword.length)
  return value && validValue[entry.keyword]?.(value) ? undefined : `"${keyword}" needs a value: ${valueHint[entry.keyword]}.`
}

function printBadges(manifestPath) {
  const {badges, guides, isced} = loadWidgetKeywords()
  const catalog = Object.entries(badges).map(([keyword, {label, pattern, description}]) => ({
    keyword, label, pattern, ...(description ? {description} : {}),
    guides: Object.entries(guides).filter(([, keywords]) => keywords.includes(keyword)).map(([id]) => `guides/${id}`),
  }))
  if(manifestPath === undefined) {
    console.log(JSON.stringify(catalog, null, 2))
    return
  }

  const {keywords = []} = JSON.parse(readFileSync(manifestPath, "utf8"))
  if(!Array.isArray(keywords) || keywords.some(keyword => typeof keyword !== "string")) {
    throw new Error("Expected package.json keywords to be an array of strings.")
  }
  const declared = [], problems = []
  for(const keyword of new Set(keywords)) {
    const problem = keywordProblem(keyword, catalog, {isced})
    if(problem) {
      problems.push(problem)
      continue
    }
    const normalized = keyword.toLowerCase()
    const code = /^isced(?:2011-(\d)|f2013-(\d+))/.exec(normalized)
    if(code) {
      const name = code[1] === undefined ? isced.fields[code[2]] : isced.levels[code[1]]
      declared.push({keyword, label: name, guides: ["reference/keywords"]})
      continue
    }
    const badge = catalog.find(entry => entry.pattern ? normalized.startsWith(entry.keyword) : normalized === entry.keyword)
    if(badge) declared.push({...badge, keyword})
  }
  console.log(JSON.stringify(declared, null, 2))
  // The resolved badges stay on standard output; the problems go to standard error and fail the command.
  for(const problem of problems) console.error(problem)
  if(problems.length) process.exitCode = 1
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

function runSkills(args) {
  let runner = "npx"
  let runnerArgs = args
  if(process.platform === "win32") {
    // Invoke npx's JS entry point directly so paths and options keep their argument boundaries.
    const paths = [dirname(process.execPath), ...(process.env.PATH ?? "").split(delimiter)]
    const entry = paths.map(path => join(path, "node_modules/npm/bin/npx-cli.js")).find(existsSync)
    if(!entry) throw new Error("Could not locate npx. Install npm with Node.js and make it available on PATH.")
    runner = process.execPath
    runnerArgs = [entry, ...args]
  }
  const result = spawnSync(runner, runnerArgs, {stdio: "inherit"})
  if(result.error) throw result.error
  process.exitCode = result.status ?? 1
}

function main([command, ...args]) {
  const argument = args.join(" ").trim()
  if(command === "--help" || command === "-h") {
    console.log(usage)
    return
  }
  if(command === "install" || command === "uninstall") {
    const source = fileURLToPath(new URL("./skills/webwriter-guidance", import.meta.url))
    const action = command === "install" ? ["add", source, "--skill", skill] : ["remove", skill]
    runSkills(["-y", "skills", ...action, ...args])
    return
  }
  if(command === "badges" && args.length <= 1) {
    printBadges(args[0])
    return
  }
  const ids = argument.split(/[,\s]+/).filter(Boolean)
  if(!(command === "list" && !args.length || command === "search" && argument || command === "retrieve" && ids.length)) {
    throw new Error(usage)
  }
  const catalog = loadWidgetDocs().map(describe).sort((a, b) => a.id.localeCompare(b.id))
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
