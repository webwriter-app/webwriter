/*
Copies and renames binaries for all supported platforms (Windows, Mac OS, Linux) with Rust style triples specifying the compilation target, so Tauri can use them as a sidecar.
*/

const fs = require('fs')
const path = require('path')

const TRIPLES = {
  "esbuild-x86_64-pc-windows-msvc.exe": "@esbuild/win32-x64/esbuild.exe",
  "esbuild-aarch64-pc-windows-msvc.exe": "@esbuild/win32-arm64/esbuild.exe",
  "esbuild-x86_64-apple-darwin": "@esbuild/darwin-x64/bin/esbuild",
  "esbuild-aarch64-apple-darwin": "@esbuild/darwin-arm64/bin/esbuild",
  "esbuild-x86_64-unknown-linux-gnu": "@esbuild/linux-x64/bin/esbuild",
  "esbuild-aarch64-unknown-linux-gnu": "@esbuild/linux-arm64/bin/esbuild",
  "bun-x86_64-pc-windows-msvc.exe": "bun/bin/bun.exe",
  // "bun-aarch64-pc-windows-msvc.exe": "bun/bin/bun.exe", // MISSING
  "bun-x86_64-apple-darwin": "bun/bin/bun",
  "bun-aarch64-apple-darwin": "bun/bin/bun",
  "bun-x86_64-unknown-linux-gnu": "bun/bin/bun",
  "bun-aarch64-unknown-linux-gnu": "bun/bin/bun"
}

const BINARIES_DIR = path.resolve("./@webwriter/app-desktop/src-tauri/bin")

async function main() {
  !fs.existsSync(BINARIES_DIR) && fs.mkdirSync(BINARIES_DIR, {recursive: true})

  for(const [triple, binpath] of Object.entries(TRIPLES)) {
    const rootpackagePath = `./node_modules/${binpath}`
    const subpackagePath = `./@webwriter/app-desktop/node_modules/${binpath}`
    const rootpackagePathExists = fs.existsSync(rootpackagePath)
    const subpackagePathExists = fs.existsSync(subpackagePath)
    const srcpath = subpackagePathExists? subpackagePath: rootpackagePath
    if(subpackagePathExists || rootpackagePathExists) {
      const binpath = path.join(BINARIES_DIR, triple)
      console.log(`Copying ${srcpath} to ${binpath}`)
      fs.copyFileSync(srcpath, binpath)
    }
    else {
      console.warn(`'${srcpath}' not found`)
    }
  }
}

main().catch((e) => {
  throw e
})