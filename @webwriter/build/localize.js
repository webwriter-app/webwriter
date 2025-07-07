#!/usr/bin/env node

import xliff2js from 'xliff/xliff2js'
import xliff12ToJs from "xliff/xliff12ToJs"
import js2xliff from 'xliff/js2xliff'
import jsToXliff12 from 'xliff/jsToXliff12'
import deepl from "deepl-node"
import {JSDOM} from "jsdom"
import { promises as fs } from "fs"
import {join} from "path"
import {exec as execSync} from "child_process"
import {promisify} from "util"
import {createInterface} from "readline/promises"

const exec = promisify(execSync)


async function confirm(prompt="Do you want to continue?") {
  const interf = createInterface({
    input: process.stdin,
    output: process.stdout
  })
  while(true) {
    const answer = await interf.question(prompt + " (y/n) ")
    if(answer === "y" || answer === "n") {
      interf.close()
      return answer === "y"
    }
  }
}

/**
 * Simple object check.
 * @param item
 * @returns {boolean}
 */
export function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
export function mergeDeep(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}


export async function localize(force=false) {
  try {
    if(!(await getPackageTranslator())) {
      throw Error("Initializing lit-localize + DeepL failed. Are you sure that both are set up properly? https://webwriter.app/docs/widgets/localization/")
    }
  } catch(err) {
    console.error(err)
    return
  }
  const outputDir = await getXliffDir()
  try {
    await fs.access(outputDir)
  }
  catch {
    await fs.mkdir(outputDir)
  }
  await localizeSnippets(force)
  await localizeWidgets(force)
  await localizePackageJson(force)
}

export async function localizePackageJson(force=false) {
  const localizableKeys = ["label", "description"]
  const pkg = JSON.parse(await fs.readFile("./package.json", "utf8"))
  
  console.log(`Generating exchange files for package.json...`)
  let editingConfigExternal = {}, editingConfigExternalPath
  if("./editing-config.json" in (pkg.exports ?? {})) {
    const path = editingConfigExternalPath = pkg.exports["./editing-config.json"]
    editingConfigExternal = JSON.parse(await fs.readFile(path, "utf8"))
  }
  let editingConfig = mergeDeep({".": {description: {en: pkg.description}}}, pkg?.editingConfig, editingConfigExternal)
  const targetLocales = await getTargetLocales()
  const outputDir = await getXliffDir()
  const configEntries = Object.fromEntries(Object.keys(editingConfig).map(ek => {
    const entry = editingConfig[ek]
    const toLocalize = Object.keys(entry).filter(k => localizableKeys.includes(k))
    const entries = Object.fromEntries(toLocalize.map(k => [k, entry[k]?.en ?? entry[k]?._]))
    return [ek, toLocalize.length? entries: undefined]
  }).filter(([_, v]) => v))
  let configValues = {}
  try {
    await fs.access(join(outputDir, "pkg"))
  }
  catch {
    await fs.mkdir(join(outputDir, "pkg"))
  }
  await Promise.all(targetLocales.map(async l => {
    let xliff2
    try {
      const path = join(outputDir, "pkg", `${l}.xliff`)
      xliff2 = await fs.readFile(path, "utf8")
    } catch {}
    const configValues = {}
    if(xliff2) {
      const xliff2Js = await xliff2js(xliff2)
      Object.keys(editingConfig).forEach(sk => {
        const ids = Object.keys(xliff2Js.resources?.[sk] ?? {})
        configValues[sk] = {...configValues[sk], ...Object.fromEntries(ids.map(id => [id, xliff2Js.resources[sk][id].target]))}
      })
    }
    const xliff = xliffFromUnits(configEntries, l, Object.keys(configValues).length? configValues: undefined)
    return fs.writeFile(join(outputDir, "pkg", `${l}.xliff`), xliff, "utf8")
  }))
  
  if(force || await confirm(`Localize package.json (${localizableKeys.map(k => k + "s").join(", ")}) to ${targetLocales.length} languages with the DeepL API?`)) {
    await Promise.allSettled(targetLocales.map(l => translateXLIFFDocument(join(outputDir, "pkg", `${l}.xliff`), false)))
  }

  console.log("Updating package.json with exchange files...")
  await Promise.all(targetLocales.map(async l => {
    const path = join(outputDir, "pkg", `${l}.xliff`)
    const xliff2 = await fs.readFile(path, "utf8")
    const xliff2Js = await xliff2js(xliff2)
    Object.keys(editingConfig).forEach(ek => {
      localizableKeys.filter(k => k in editingConfig[ek]).forEach(k => {
        k in (pkg.editingConfig[ek] ?? {}) && delete pkg.editingConfig?.[ek]?.[k]
        editingConfigExternal[ek] = {
          ...editingConfigExternal[ek],
          [k]: {
            ...editingConfigExternal[ek]?.[k],
            [l]: xliff2Js.resources?.[ek]?.[k]?.target
          }
        }
      })
    })
  }))
  if(!editingConfigExternalPath) {
    pkg.exports = {...pkg.exports, "./editing-config.json": "./editing-config.json"}
  }
  await fs.writeFile("./editing-config.json", JSON.stringify(editingConfigExternal, undefined, 2), "utf8")
  pkg.keywords = Array.from(new Set([
    ...pkg.keywords,
    "widget-lang-en",
    ...targetLocales.map(l => `widget-lang-${l}`)
  ]))
  await fs.writeFile("./package.json", JSON.stringify(pkg, undefined, 2), "utf8")
}

export async function localizeSnippets(force=false) {
  const pkg = JSON.parse(await fs.readFile("./package.json", "utf8"))
  const pkgExports = pkg?.exports ?? {}
  const snippetKeys = Object.keys(pkgExports).filter(k => k.startsWith("./snippets/"))
  
  console.log(`Generating exchange files for snippets...`)
  const targetLocales = await getTargetLocales()
  const outputDir = await getXliffDir()
  const snippetTextEntries = await Promise.all(snippetKeys.map(async k => {
    const path = pkgExports[k]
    const html = await fs.readFile(path, "utf8")
    return [k, htmlToUnits(html)]
  }))
  const snippetEntries = Object.fromEntries(snippetTextEntries.filter(([k, v]) => v))
  try {
    await fs.access(join(outputDir, "snippets"))
  }
  catch {
    await fs.mkdir(join(outputDir, "snippets"))
  }
  await Promise.all(targetLocales.map(async l => {
    let xliff2, path
    try {
      path = join(outputDir, "snippets", `${l}.xliff`)
      xliff2 = await fs.readFile(path, "utf8")
    } catch {}
    const snippetValues = {}
    if(xliff2) {
      let xliff2Js
      try {
        xliff2Js = await xliff2js(xliff2)
      }
      catch {
        console.warn(`Snippet localization file at '${path}' empty or malformed, skipping.`)
        return
      }
      snippetKeys.forEach(sk => {
        const ids = Object.keys(xliff2Js.resources?.[sk] ?? {})
        snippetValues[sk] = {...snippetValues[sk], ...Object.fromEntries(ids.map(id => [id, xliff2Js.resources[sk][id].target]))}
      })
    }
    const xliff = xliffFromUnits(snippetEntries, l, Object.keys(snippetValues).length? snippetValues: undefined)
    return fs.writeFile(join(outputDir, "snippets", `${l}.xliff`), xliff, "utf8")
  }))
  if(force || await confirm(`Localize ${snippetKeys.length} snippet${snippetKeys.length > 1? "s": ""} to ${targetLocales.length} languages with the DeepL API?`)) {
    await Promise.allSettled(targetLocales.map(l => translateXLIFFDocument(join(outputDir, "snippets", `${l}.xliff`), false)))
  }

  console.log("Updating snippets with exchange files...")
  const json = {}
  await Promise.all(targetLocales.map(async l => {
    const path = join(outputDir, "snippets", `${l}.xliff`)
    const xliff2 = await fs.readFile(path, "utf8")
    let xliff2Js
    try {
      xliff2Js = await xliff2js(xliff2)
    }
    catch {
      console.warn(`Snippet localization file at '${path}' empty or malformed, skipping.`)
      return
    }
    snippetKeys.forEach(sk => {
      const ids = Object.keys(xliff2Js.resources?.[sk] ?? {})
      json[sk] = {...json[sk], ...Object.fromEntries(ids.map(id => [id, {...json[sk]?.[id], [l]: xliff2Js.resources[sk][id].target}]))}
    })
  }))
  await Promise.all(Object.keys(json).map(async sk => {
    if(Object.keys(json[sk]).length === 0) {
      return
    }
    const path = pkgExports[sk]
    const html = await fs.readFile(path, "utf8")
    const dom = new JSDOM(html)
    const localization = dom.window.document.querySelector(".snippet-localization")
    if(localization) {
      localization.textContent = JSON.stringify(json[sk])
    }
    else {
      const script = dom.window.document.createElement("script")
      script.type = "application/json"
      script.className = "snippet-localization"
      script.textContent = JSON.stringify(json[sk])
      dom.window.document.body.append(script)
    }
    const newHtml = dom.window.document.body.innerHTML
    return fs.writeFile(path, newHtml, "utf8")
  }))
}

function htmlToUnits(html) {
  const jsdom = new JSDOM()
  function textNodesUnder(el) {
    const children = []
    const walker = jsdom.window.document.createTreeWalker(el, jsdom.window.NodeFilter.SHOW_TEXT)
    while(walker.nextNode()) {
      children.push(walker.currentNode)
    }
    return children
  }
  const dom = JSDOM.fragment(html)
  dom.querySelectorAll("math").forEach(math => math.remove())
  dom.querySelector(".snippet-localization")?.remove()
  const texts = textNodesUnder(dom).map(node => node.textContent.trim())?.filter(text => text)
  const counts = Object.fromEntries(texts.map(text => [text, 0]))
  const textsWithIds = texts.map(text => {
    counts[text]++
    return `${text}#${counts[text]}`
  })
  return texts.length? Object.fromEntries(textsWithIds.map((t, i) => [t, texts[i]])): undefined
}

export async function localizeWidgets(force=false) {
  const litLocalize = JSON.parse(await fs.readFile("./lit-localize.json", "utf8"))
  console.log("Generating exchange files for widgets...")
  await exec("npx @lit/localize-tools extract")
  const dirPath = litLocalize.interchange.xliffDir
  const dir = await fs.readdir(dirPath)
  const paths = dir
    .filter(relPath => relPath.endsWith(".xlf"))
    .map(relPath => join(dirPath, relPath))
  if(force || await confirm(`Localize widgets from '${litLocalize.sourceLocale}' to ${litLocalize.targetLocales.length} languages with the DeepL API?`)) {
    await Promise.allSettled(paths.map(path => translateXLIFFDocument(path, true)))
  }
  console.log("Updating widgets with exchange files...")
  await exec("npx @lit/localize-tools build")
}

async function getPackageTranslator() {
  const litLocalizePath = "./lit-localize.json"
  let litLocalize
  try {
    litLocalize = JSON.parse(await fs.readFile(litLocalizePath, "utf8"))
  }
  catch(err) {
    const defaultLitLocalize = {
      "$schema": "https://raw.githubusercontent.com/lit/lit/main/packages/localize-tools/config.schema.json",
      "sourceLocale": "en",
      "targetLocales": ["de", "ar", "bg", "cs", "da", "nl", "et", "fi", "fr", "el", "hu", "it", "lv", "lt", "nb", "pl", "pt-PT", "ro", "ru", "sk", "sl", "es", "sv", "tr", "uk", "pt-BR", "ko", "ja", "id", "zh-hans", "zh-hant"],
      "tsConfig": "./tsconfig.json",
      "output": {
        "mode": "runtime",
        "outputDir": "./localization/generated",
        "localeCodesModule": "./localization/generated/locale-codes.js"
      },
      "interchange": {
        "format": "xliff",
        "xliffDir": "./localization"
      }
    }
    if(!(await confirm(`No lit-localize.json found in this directory (or invalid JSON). Generate one (y) or abort (n)?`))) {
      return
    }
    await fs.writeFile(litLocalizePath, JSON.stringify(defaultLitLocalize, undefined, 2))
    litLocalize = defaultLitLocalize
  }
  if(!litLocalize?.interchange?.xliffDir) {
    throw Error(`interchange.xliffDir not found in ${litLocalizePath}`)
  }
  if(litLocalize?.output?.outputDir) {
    const text = `import {sourceLocale, targetLocales} from './locale-codes.js';\nimport {configureLocalization} from '@lit/localize';\nexport default configureLocalization({sourceLocale, targetLocales, loadLocale: (locale) => import(\`./\${locale}.ts\`)});`
    try {
      await fs.access(litLocalize.output.outputDir)
    }
    catch {
      await fs.mkdir(litLocalize.output.outputDir, {recursive: true})
    }
    await fs.writeFile(join(litLocalize.output.outputDir, "index.js"), text, "utf8")
  }
  try {
    return new deepl.Translator(process.env.DEEPL_API_KEY)
  }
  catch {
    if(!process.env.DEEPL_API_KEY) {
      console.log(`No DEEPL_API_KEY found in env - skipping machine translation`)
      return
    }
    throw Error(`Invalid key *****${process.env.DEEPL_API_KEY.slice(-5)}`)
  }
}

async function getTargetLocales() {
  const litLocalize = JSON.parse(await fs.readFile("./lit-localize.json", "utf8"))
  return litLocalize?.targetLocales
}

async function getOutputDir() {
  const litLocalize = JSON.parse(await fs.readFile("./lit-localize.json", "utf8"))
  return litLocalize?.output?.outputDir
}

async function getXliffDir() {
  const litLocalize = JSON.parse(await fs.readFile("./lit-localize.json", "utf8"))
  return litLocalize?.interchange?.xliffDir
}

function xliffFromUnits(units, trgLang, values={}) {
  const fileStatements = Object.keys(units).map(fk => `<file id="${fk}" original="${fk}">\n${Object.keys(units[fk])
    .map(k => `<unit id="${k}"><segment><source>${units[fk][k]}</source><target>${values[fk]?.[k] ?? ""}</target></segment></unit>`).join("\n")}\n</file>`)
    .join("\n")
  const preamble = `<?xml version="1.0" encoding="utf-8" ?>\n`
  const ns = "urn:oasis:names:tc:xliff:document:2.0"
  return `${preamble}<xliff xmlns="${ns}" version="2.1" srcLang="en" trgLang="${trgLang}">\n${fileStatements}\n</xliff>`
}

async function translateXLIFFDocument(path, isXliff1=true) {
  let srcPath, targetPath, sourceLanguage, targetLanguage
  try {
    if(isXliff1) {
      const xliff1 = await fs.readFile(path, "utf8")
      const xliffJs = await xliff12ToJs(xliff1)
      sourceLanguage = xliffJs.sourceLanguage
      targetLanguage = xliffJs.targetLanguage
      const xliff2 = (await js2xliff(xliffJs))
        .replace(`version="2.0"`, `version="2.1"`)
        .replaceAll(/=(".*")/g, match => match.replaceAll("<", "&lt;").replaceAll(">", "&gt;"))
      const parsedXliff2 = new JSDOM(xliff2, {contentType: "text/xml"})
      
      for(let target of parsedXliff2.window.document.querySelectorAll("target")) {
        target.parentElement.setAttribute("state", "final")
      }
      srcPath = path.replace(".xlf", ".temp.xliff")
      await fs.writeFile(srcPath, parsedXliff2.serialize(), "utf8")
      targetPath = srcPath.replace(".temp.xliff", ".xliff")
    }
    else {
      const xliff2 = await fs.readFile(path, "utf8")
      const xliff2Js = await xliff2js(xliff2)
      sourceLanguage = xliff2Js.sourceLanguage
      targetLanguage = xliff2Js.targetLanguage
      srcPath = path
      targetPath = path.replace(".xliff", ".temp.xliff")
    }
    const translator = new deepl.Translator(process.env.DEEPL_API_KEY)
    await translator.translateDocument(
      srcPath,
      targetPath,
      sourceLanguage,
      targetLanguage
    )
    const doneXliff2 = await fs.readFile(targetPath, "utf8")
    if(isXliff1) {
      const doneXliffJs = await xliff2js(doneXliff2)
      const doneXliff12 = (await jsToXliff12(doneXliffJs)).replaceAll(/=(".*")/g, match => match.replaceAll("<", "&lt;").replaceAll(">", "&gt;"))
      await fs.writeFile(path, doneXliff12, "utf8")
    }
    else {
      await fs.writeFile(path, doneXliff2, "utf8")
    }
  }
  catch(err) {
    console.error(err)
  }
  finally {
    if(isXliff1) {
      try {
        await fs.unlink(srcPath)
      } catch {}
    }
    try {
      await fs.unlink(targetPath)
    } catch {}
  }
}

async function translateHTMLDocument(path, lang) {
  const translator = new deepl.Translator(process.env.DEEPL_API_KEY)
  await translator.translateDocument(
    path,
    path.split(".").slice(0, -1).join(".") + `.${lang}.html`,
    "en",
    lang
  )
}