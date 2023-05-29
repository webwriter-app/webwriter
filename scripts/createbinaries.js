/*
Copies and renames binaries for all supported platforms (Windows, Mac OS, Linux) with Rust style triples specifying the compilation target, so Tauri can use them as a sidecar.
*/

const fs = require('fs')
const path = require('path')
const child_process = require("child_process")

const TRIPLES_OF_YARN = {
  "yarn-win-x64": "x86_64-pc-windows-msvc",
  "yarn-win-arm64": "aarch64-pc-windows-msvc",
  "yarn-macos-x64": "x86_64-apple-darwin",
  "yarn-macos-arm64": "aarch64-apple-darwin",
  "yarn-linux-x64": "x86_64-unknown-linux-gnu",
  "yarn-linux-arm64": "aarch64-unknown-linux-gnu",
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
const YARN_PATH = path.normalize("./node_modules/yarn/")
const YARN_ENTRYPOINT = path.join(YARN_PATH, "/lib/cli.js")
const PKG_CONFIG = "{\"scripts\": \"lib/**/*\"}"
const PKG_CONFIG_PATH = path.join(YARN_PATH, "pkg.json")
const PKG_TARGETS = "node16-win-x64,node16-macos-x64,node16-linux-x64,node16-win-arm64,node16-macos-arm64,node16-linux-arm64"
const BINARIES_DIR = path.normalize("./@webwriter/app-desktop/src-tauri/bin")
const PKG_OUTPUT = path.join(BINARIES_DIR, "yarn")
const PKG_EXTRA_FLAGS = "--no-bytecode --public-packages \"*\" --public"

async function main() {
  !fs.existsSync(BINARIES_DIR) && fs.mkdirSync(BINARIES_DIR, {recursive: true})

  fs.writeFileSync(`${PKG_CONFIG_PATH}`, PKG_CONFIG)

  child_process.execSync(`node ${PKG_PATH} ${YARN_ENTRYPOINT} --config ${PKG_CONFIG_PATH} --targets ${PKG_TARGETS} --output ${PKG_OUTPUT} ${PKG_EXTRA_FLAGS}`, {encoding: "utf8"})

  for(const [binname, triple] of Object.entries(TRIPLES_OF_YARN)) {
    const suffix = binname.includes("win")? ".exe": ""
    fs.renameSync(
      path.join(BINARIES_DIR, `${binname}${suffix}`),
      path.join(BINARIES_DIR, `yarn-${triple}${suffix}`)
    )
  }

  for(const [packagename, triple] of Object.entries(TRIPLES_OF_ESBUILD)) {
    const prefix = !packagename.includes("windows")? "bin/": ""
    const suffix = packagename.includes("windows")? ".exe": ""
    if(fs.existsSync(`./node_modules/${packagename}`)) {
      fs.copyFileSync(
        `./node_modules/${packagename}/${prefix}esbuild${suffix}`,
        path.join(BINARIES_DIR, `esbuild-${triple}${suffix}`)
      )
    }
  }
}

main().catch((e) => {
  throw e
})