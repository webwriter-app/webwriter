const xliff2js = require('xliff/xliff2js')
const xliff12ToJs = require("xliff/xliff12ToJs")
const js2xliff = require('xliff/js2xliff')
const jsToXliff12 = require('xliff/jsToXliff12')
const deepl = require("deepl-node")
const {JSDOM} = require("jsdom")
const { readFile, writeFile, readdir, unlink: remove } = require("node:fs/promises")
const {join} = require("path")

const DO_NOT_TRANSLATE = ["de"]

async function main() {
  const dirPath = "./@webwriter/core/viewmodel/localizationcontroller/localization"
  const dir = await readdir(dirPath)
  const paths = dir
    .filter(relPath => relPath.endsWith(".xlf") && !DO_NOT_TRANSLATE.some(code => relPath.endsWith(`${code}.xlf`)))
    .map(relPath =>  join(dirPath, relPath))
  await Promise.allSettled(paths.map(translateXLIFFDocument))
}

async function translateXLIFFDocument(path) {
  let tempPath, targetPath
  try {
    const xliff1 = await readFile(path, "utf8")
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
    await writeFile(tempPath, parsedXliff2.serialize(), "utf8")
    const translator = new deepl.Translator(process.env.DEEPL_API_KEY)
    targetPath = tempPath.replace(".temp.xliff", ".xliff")
    await translator.translateDocument(
      tempPath,
      targetPath,
      sourceLanguage,
      targetLanguage
    )
    const doneXliff2 = await readFile(targetPath, "utf8")
    const doneXliffJs = await xliff2js(doneXliff2)
    const doneXliff12 = (await jsToXliff12(doneXliffJs)).replaceAll(/=(".*")/g, match => match.replaceAll("<", "&lt;").replaceAll(">", "&gt;"))
    await writeFile(path, doneXliff12, "utf8")
  }
  catch(err) {
    console.error(err)
  }
  finally {
    try {
      await remove(tempPath)
    }
    catch {}
    try {
      await remove(targetPath)
    }
    catch {}
  }
}

main()