/*
Copies shoelace icons into static directory.
*/

const { existsSync, mkdirSync, cpSync } = require('node:fs')
const path = require('path')
const process = require("process")


const STATIC_PATH = path.normalize(process.argv[2] ?? "./static")
const ICONS_PATH = path.normalize("./node_modules/@tabler/icons/icons")
const CC_PATH = path.normalize("./node_modules/@wagnerflo/cc-icons/fonts/cc-icons-svg/")
const ASSETS_PATH = path.normalize("./@webwriter/core/view/assets")
const STATIC_ASSETS_PATH = path.join(STATIC_PATH, "assets")
const STATIC_ICONS_PATH = path.join(STATIC_PATH, "assets", "icons")
const STATIC_ICONS_OUTLINE_PATH = path.join(STATIC_PATH, "assets", "icons", "outline")

async function main() {
  !existsSync(STATIC_ICONS_PATH) && mkdirSync(STATIC_ICONS_PATH, {recursive: true})
  cpSync(ICONS_PATH, STATIC_ICONS_PATH, {recursive: true})
  cpSync(CC_PATH, STATIC_ICONS_OUTLINE_PATH, {recursive: true})
  cpSync(ASSETS_PATH, STATIC_ASSETS_PATH, {recursive: true})
}

main().catch((e) => {
  throw e
})