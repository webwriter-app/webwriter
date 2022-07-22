/*
Copies shoelace icons into static directory.
*/

const fse = require('fs-extra')
const path = require('path')


const STATIC_PATH = path.normalize("./static")
const ICONS_PATH = path.normalize("./node_modules/@shoelace-style/shoelace/dist/assets/icons/")
const STATIC_ICONS_PATH = path.join(STATIC_PATH, "assets", "icons")

async function main() {
  fse.copySync(ICONS_PATH, STATIC_ICONS_PATH)
}

main().catch((e) => {
  throw e
})