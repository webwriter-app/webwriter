/*
Copies and renames npm binaries made with pkg for all supported platforms (Windows, Mac OS, Linux) with Rust style triples specifying the compilation target, so Tauri can use npm as a sidecar.
*/

const fs = require('fs')

const TRIPLES_OF_PACKAGES = {
  "npm-win-x64": "x86_64-pc-windows-msvc",
  "npm-win-arm64": "arm64-pc-windows-msvc",
  "npm-linux-x64": "x86_64-unknown-linux-gnu",
  "npm-linux-arm64": "arm64-unknown-linux-gnu",
  "npm-macos-x64": "x86_64-apple-darwin",
  "npm-macos-arm64": "arm64-apple-darwin"
}

async function main() {

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