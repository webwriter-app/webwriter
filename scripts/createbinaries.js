/*
Copies and renames binaries for all supported platforms (Windows, Mac OS, Linux) with Rust style triples specifying the compilation target, so Tauri can use them as a sidecar.
*/

const fs = require('fs')
const path = require('path')
const child_process = require("child_process")

const TRIPLES = {
  "@pnpm/win-x64/pnpm.exe": "pnpm-x86_64-pc-windows-msvc.exe",
  //  "@pnpm/win-arm64": "aarch64-pc-windows-msvc",  // TODO: Not available yet
  "@pnpm/macos-x64/pnpm": "pnpm-x86_64-apple-darwin",
  "@pnpm/macos-arm64/pnpm": "pnpm-aarch64-apple-darwin",
  "@pnpm/linux-x64/pnpm": "pnpm-x86_64-unknown-linux-gnu",
  "@pnpm/linux-arm64/pnpm": "pnpm-aarch64-unknown-linux-gnu",
  "@esbuild/win32-x64/esbuild.exe": "esbuild-x86_64-pc-windows-msvc.exe",
  "@esbuild/win32-arm64/esbuild.exe": "esbuild-aarch64-pc-windows-msvc.exe",
  "@esbuild/darwin-x64/bin/esbuild": "esbuild-x86_64-apple-darwin",
  "@esbuild/darwin-arm64/bin/esbuild": "esbuild-aarch64-apple-darwin",
  "@esbuild/linux-x64/bin/esbuild": "esbuild-x86_64-unknown-linux-gnu",
  "@esbuild/linux-arm64/bin/esbuild": "esbuild-aarch64-unknown-linux-gnu",
}

const ANALYZER_RENAME_MAP = {
  "analyzer-win-x64.exe": "analyzer-x86_64-pc-windows-msvc.exe",
  "analyzer-win-arm64.exe": "analyzer-aarch64-pc-windows-msvc.exe",
  "analyzer-macos-x64": "analyzer-x86_64-apple-darwin",
  "analyzer-macos-arm64": "analyzer-aarch64-apple-darwin",
  "analyzer-linux-x64": "analyzer-x86_64-unknown-linux-gnu",
  "analyzer-linux-arm64": "analyzer-aarch64-unknown-linux-gnu",
}

const PKG_PATH = path.resolve("./node_modules/@yao-pkg/pkg/lib-es5/bin.js")
const PKG_TARGETS = "node20-win-x64,node20-macos-x64,node20-linux-x64,node20-win-arm64,node20-macos-arm64,node20-linux-arm64"
const BINARIES_DIR = path.resolve("./@webwriter/app-desktop/src-tauri/bin")
const PKG_OUTPUT = path.join(BINARIES_DIR, "analyzer")
const PKG_EXTRA_FLAGS = "--no-bytecode --public-packages \"*\" --public"
const ANALYZER_PATH = path.resolve("./node_modules/@custom-elements-manifest/analyzer")
const ANALYZER_PATH_JS = path.resolve("./node_modules/@custom-elements-manifest/analyzer/index.js")
const ANALYZER_PATH_BUNDLE = path.resolve("./node_modules/@custom-elements-manifest/analyzer/bundle.js")
const ANALYZER_PATH_CONFIG = path.resolve("./node_modules/@custom-elements-manifest/analyzer/vite.config.js")

async function main() {
  !fs.existsSync(BINARIES_DIR) && fs.mkdirSync(BINARIES_DIR, {recursive: true})

  /*const viteConfig = {
    build: {
      target: "node20",
      minify: false,
      rollupOptions: {
        input: ANALYZER_PATH_JS,
        output: {
          format: "cjs",
          dir: ANALYZER_PATH,
          entryFileNames: `bundle.js`
        }
      }
    }
  }
  const viteConfigString = `export default ${JSON.stringify(viteConfig)}`
  fs.writeFileSync(ANALYZER_PATH_CONFIG, viteConfigString, {encoding: "utf8"})
  child_process.execSync(`cd "${ANALYZER_PATH}" && vite build`, {encoding: "utf8"})

  child_process.execSync(`node "${PKG_PATH}" "${ANALYZER_PATH_BUNDLE}" --targets ${PKG_TARGETS} --output "${PKG_OUTPUT}" ${PKG_EXTRA_FLAGS}`, {encoding: "utf8"})*/
  /*
  for(const [binname, triple] of Object.entries(ANALYZER_RENAME_MAP)) {
    fs.renameSync(
      path.join(BINARIES_DIR, binname),
      path.join(BINARIES_DIR, triple)
    )
  }*/

  for(const [binpath, triple] of Object.entries(TRIPLES)) {
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