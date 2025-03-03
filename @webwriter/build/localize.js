#!/usr/bin/env node

import xliff2js from 'xliff/xliff2js'
import xliff12ToJs from "xliff/xliff12ToJs"
import js2xliff from 'xliff/js2xliff'
import jsToXliff12 from 'xliff/jsToXliff12'
import deepl from "deepl-node"
import {JSDOM} from "jsdom"
import { promises as fs } from "fs"
import {join} from "path"

export async function localize() {
  
}

export async function localizePackageJson() {

}

export async function localizeSnippets() {

}

export async function localizeWidgets() {
  const litLocalizePath = "./lit-localize.json"
  let litLocalize
  try {
    litLocalize = JSON.parse(await fs.readFile(litLocalizePath, "utf8"))
  }
  catch(err) {
    throw Error("No lit-localize.json found in this directory (or invalid JSON).", {cause: err})
  }
  if(!litLocalize?.interchange?.xliffDir) {
    throw Error(`interchange.xliffDir not found in ${litLocalizePath}`)
  }
  if(litLocalize?.output?.outputDir) {
    const text = `import {sourceLocale, targetLocales} from './locale-codes.js';\nimport {configureLocalization} from '@lit/localize';\nexport default configureLocalization({sourceLocale, targetLocales, loadLocale: (locale) => import(\`./\${locale}.ts\`)});`
    await fs.writeFile(join(litLocalize.output.outputDir, "index.js"), text, "utf8")
  }
  try {
    new deepl.Translator(process.env.DEEPL_API_KEY)
  }
  catch {
    if(!process.env.DEEPL_API_KEY) {
      console.log(`No DEEPL_API_KEY found in env - skipping machine translation`)
      return
    }
    throw Error(`Invalid key *****${process.env.DEEPL_API_KEY.slice(-5)}`)
  }
  console.log(`Localizing from '${litLocalize.sourceLocale}' to ${litLocalize.targetLocales.length} languages with the DeepL API...`)
  const dirPath = litLocalize.interchange.xliffDir
  const dir = await fs.readdir(dirPath)
  const paths = dir
    .filter(relPath => relPath.endsWith(".xlf"))
    .map(relPath => join(dirPath, relPath))
  await Promise.allSettled(paths.map(translateXLIFFDocument))
}

async function translateXLIFFDocument(path) {
  let tempPath, targetPath
  try {
    const xliff1 = await fs.readFile(path, "utf8")
    const xliffJs = await xliff12ToJs(xliff1)
    const sourceLanguage = xliffJs.sourceLanguage
    const targetLanguage = xliffJs.targetLanguage
    const xliff2 = (await js2xliff(xliffJs))
      .replace(`version="2.0"`, `version="2.1"`)
      .replaceAll(/=(".*")/g, match => match.replaceAll("<", "&lt;").replaceAll(">", "&gt;"))
    const parsedXliff2 = new JSDOM(xliff2, {contentType: "text/xml"})
    
    for(let target of parsedXliff2.window.document.querySelectorAll("target")) {
      target.parentElement.setAttribute("state", "final")
    }
    tempPath = path.replace(".xlf", ".temp.xliff")
    await fs.writeFile(tempPath, parsedXliff2.serialize(), "utf8")
    const translator = new deepl.Translator(process.env.DEEPL_API_KEY)
    targetPath = tempPath.replace(".temp.xliff", ".xliff")
    await translator.translateDocument(
      tempPath,
      targetPath,
      sourceLanguage,
      targetLanguage
    )
    const doneXliff2 = await fs.readFile(targetPath, "utf8")
    const doneXliffJs = await xliff2js(doneXliff2)
    const doneXliff12 = (await jsToXliff12(doneXliffJs)).replaceAll(/=(".*")/g, match => match.replaceAll("<", "&lt;").replaceAll(">", "&gt;"))
    await fs.writeFile(path, doneXliff12, "utf8")
  }
  catch(err) {
    console.error(err)
  }
  finally {
    try {
      await fs.unlink(tempPath)
    } catch {}
    try {
      await fs.unlink(targetPath)
    } catch {}
  }
}