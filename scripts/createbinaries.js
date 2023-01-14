/*
Copies and renames binaries for all supported platforms (Windows, Mac OS, Linux) with Rust style triples specifying the compilation target, so Tauri can use them as a sidecar.
*/

const fs = require('fs')
const path = require('path')
const child_process = require("child_process")

const TRIPLES_OF_NPM = {
  "npm-win-x64": "x86_64-pc-windows-msvc",
  "npm-win-arm64": "aarch64-pc-windows-msvc",
  "npm-macos-x64": "x86_64-apple-darwin",
  "npm-macos-arm64": "aarch64-apple-darwin",
  "npm-linux-x64": "x86_64-unknown-linux-gnu",
  "npm-linux-arm64": "aarch64-unknown-linux-gnu",
}

const TRIPLES_OF_ESBUILD = {
  "esbuild-windows-64": "x86_64-pc-windows-msvc",
  "esbuild-windows-arm64": "aarch64-pc-windows-msvc",
  "esbuild-darwin-64": "x86_64-apple-darwin",
  "esbuild-darwin-arm64": "aarch64-apple-darwin",
  "esbuild-linux-64": "x86_64-unknown-linux-gnu",
  "esbuild-linux-arm64": "aarch64-unknown-linux-gnu",
}

const PKG_PATH = path.normalize("./node_modules/pkg/lib-es5/bin.js")
const NPM_PATH = path.normalize("./node_modules/npm/")
const NPM_ENTRYPOINT = path.join(NPM_PATH, "index.js")
const PKG_CONFIG = "{\"scripts\": \"lib/**/*\"}"
const PKG_CONFIG_PATH = path.join(NPM_PATH, "pkg.json")
const PKG_TARGETS = "node16-win-x64,node16-macos-x64,node16-linux-x64,node16-win-arm64,node16-macos-arm64,node16-linux-arm64"
const PKG_OUTPUT = path.normalize("./binaries/npm")
const BINARIES_DIR = path.normalize("./@webwriter/app-desktop/binaries")
const PKG_EXTRA_FLAGS = "--no-bytecode --public-packages \"*\" --public"

async function main() {
  !fs.existsSync(BINARIES_DIR) && fs.mkdirSync(BINARIES_DIR, {recursive: true})

  fs.writeFileSync(`${PKG_CONFIG_PATH}`, PKG_CONFIG)

  child_process.execSync(`node ${PKG_PATH} ${NPM_ENTRYPOINT} --config ${PKG_CONFIG_PATH} --targets ${PKG_TARGETS} --output ${PKG_OUTPUT} ${PKG_EXTRA_FLAGS}`, {encoding: "utf8"})

  for(const [binname, triple] of Object.entries(TRIPLES_OF_NPM)) {
    const suffix = binname.includes("win")? ".exe": ""
    fs.renameSync(
      `./binaries/${binname}${suffix}`,
      `./binaries/npm-${triple}${suffix}`
    )
  }

  for(const [packagename, triple] of Object.entries(TRIPLES_OF_ESBUILD)) {
    const prefix = !packagename.includes("windows")? "bin/": ""
    const suffix = packagename.includes("windows")? ".exe": ""
    if(fs.existsSync(`./node_modules/${packagename}`)) {
      fs.copyFileSync(
        `./node_modules/${packagename}/${prefix}esbuild${suffix}`,
        `./binaries/esbuild-${triple}${suffix}`
      )
    }
  }
}

main().catch((e) => {
  throw e
})