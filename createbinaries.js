/*
Copies and renames npm binaries made with pkg for all supported platforms (Windows, Mac OS, Linux) with Rust style triples specifying the compilation target, so Tauri can use npm as a sidecar.
*/

const fs = require('fs')
const path = require('path')
const child_process = require("child_process")

"echo {\"scripts\": \"lib/**/*\"} > ./node_modules/npm/pkg.json && node ./node_modules/pkg/lib-es5/bin.js ./node_modules/npm/index.js --config ./node_modules/npm/pkg.json --targets node16-win-x64,node16-macos-x64,node16-linux-x64,node16-win-arm64,node16-macos-arm64,node16-linux-arm64 --no-bytecode --public-packages \"*\" --public --output ./binaries/npm"

const TRIPLES_OF_PACKAGES = {
  "npm-win-x64": "x86_64-pc-windows-msvc",
  "npm-win-arm64": "arm64-pc-windows-msvc",
  "npm-linux-x64": "x86_64-unknown-linux-gnu",
  "npm-linux-arm64": "arm64-unknown-linux-gnu",
  "npm-macos-x64": "x86_64-apple-darwin",
  "npm-macos-arm64": "arm64-apple-darwin"
}

const PKG_PATH = path.normalize("./node_modules/pkg/lib-es5/bin.js")
const NPM_PATH = path.normalize("./node_modules/npm/")
const NPM_ENTRYPOINT = path.join(NPM_PATH, "index.js")
const PKG_CONFIG = "{\"scripts\": \"lib/**/*\"}"
const PKG_CONFIG_PATH = path.join(NPM_PATH, "pkg.json")
const PKG_TARGETS = "node16-win-x64,node16-macos-x64,node16-linux-x64,node16-win-arm64,node16-macos-arm64,node16-linux-arm64"
const PKG_OUTPUT = path.normalize("./binaries/npm")
const PKG_EXTRA_FLAGS = "--no-bytecode --public-packages \"*\" --public"

async function main() {

  fs.writeFileSync(`${PKG_CONFIG_PATH}`, PKG_CONFIG)


  child_process.execSync(`node ${PKG_PATH} ${NPM_ENTRYPOINT} --config ${PKG_CONFIG_PATH} --targets ${PKG_TARGETS} --output ${PKG_OUTPUT} ${PKG_EXTRA_FLAGS}`, {encoding: "utf8"})
 
  for(const [binname, triple] of Object.entries(TRIPLES_OF_PACKAGES)) {
    const suffix = binname.includes("win")? ".exe": ""
    const binariesDir = "./binaries"
    !fs.existsSync(binariesDir)? fs.mkdirSync(binariesDir): null
    fs.renameSync(
      `./binaries/${binname}${suffix}`,
      `./binaries/npm-${triple}${suffix}`
    )
  }
}

main().catch((e) => {
  throw e
})