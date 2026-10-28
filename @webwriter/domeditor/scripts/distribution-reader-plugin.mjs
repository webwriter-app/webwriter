import { build } from "esbuild"
import { existsSync } from "node:fs"
import {readFile} from "node:fs/promises"
import { isAbsolute, normalize, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const virtualId = "virtual:distribution-reader-sources"
const resolvedVirtualId = `\0${virtualId}`
const actions = {insert: "installInsert"}

const blockedInputs = [
  /\/src\/components\/(?!media-capture\.ts$|media-source\.styles\.ts$)/,
  /\/src\/app-settings(?:\.ts|\/|$)/,

  /\/src\/domeditor\.ts$/,
  /\/src\/editor-entry\.ts$/,
]

function absoluteInput(input, projectRoot) {
  if(input.startsWith("reader-raw:")) input = input.slice("reader-raw:".length)
  return normalize(isAbsolute(input) ? input : resolve(projectRoot, input)).replaceAll("\\", "/")
}

function assertAllowedInputs(result, projectRoot, label) {
  for (const input of Object.keys(result.metafile.inputs)) {
    const path = absoluteInput(input, projectRoot)
    if (blockedInputs.some((pattern) => pattern.test(path))) {
      throw new Error(`Distribution ${label} bundle includes prohibited source: ${relative(projectRoot, path)}`)
    }
  }
  const externalImports = Object.values(result.metafile.outputs).flatMap((output) => output.imports)
    .filter((entry) => entry.external)
  if (externalImports.length) {
    throw new Error(`Distribution ${label} bundle has external imports: ${externalImports.map((entry) => entry.path).join(", ")}`)
  }
}

function watchInputs(pluginContext, result, projectRoot) {
  for (const input of Object.keys(result.metafile.inputs)) {
    const path = absoluteInput(input, projectRoot)
    if (existsSync(path)) pluginContext.addWatchFile(path)
  }
}

const readerBuildOptions = {
  define: {"import.meta.env.MODE": '"reader"', "import.meta.env.BASE_URL": '"./"'},
  tsconfigRaw: {compilerOptions: {experimentalDecorators: true, useDefineForClassFields: false}},
  plugins: [{name: "reader-raw-assets", setup(build) {
    build.onResolve({filter: /^yjs$/}, args => {
      if(args.pluginData?.readerYjs) return
      return build.resolve("yjs", {resolveDir: fileURLToPath(new URL("../", import.meta.url)), kind: "import-statement", pluginData: {readerYjs: true}})
    })
    build.onResolve({filter: /\?raw$/}, async args => {
      const resolved = await build.resolve(args.path.slice(0, -4), {resolveDir: args.resolveDir, kind: args.kind})
      return {path: resolved.path, namespace: "reader-raw"}
    })
    build.onLoad({filter: /.*/, namespace: "reader-raw"}, async args => ({contents: await readFile(args.path, "utf8"), loader: "text"}))
  }}],
}

async function bundleEntry(entry, projectRoot, globalName) {
  const result = await build({
    ...readerBuildOptions,
    absWorkingDir: projectRoot,
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    platform: "browser",
    format: "iife",
    globalName,
    minify: true,
  })
  assertAllowedInputs(result, projectRoot, globalName)
  return result
}

async function bundleAction(name, exportName, actionEntry, projectRoot) {
  const result = await build({
    ...readerBuildOptions,
    absWorkingDir: projectRoot,
    stdin: {
      contents: `export { ${exportName} as install } from ${JSON.stringify(actionEntry)}`,
      resolveDir: projectRoot,
      sourcefile: `distribution-${name}-entry.js`,
      loader: "js",
    },
    bundle: true,
    write: false,
    metafile: true,
    platform: "browser",
    format: "iife",
    globalName: "distributionAction",
    minify: true,
  })
  assertAllowedInputs(result, projectRoot, `${name} action`)
  return result
}

/** Build the reader and its independent action modules into self-contained iframe sources. */
export function distributionReaderPlugin() {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url))
  const coreEntry = resolve(projectRoot, "src/distribution-reader.ts")
  const actionEntry = resolve(projectRoot, "src/distribution-reader-actions.ts")
  return {
    name: "distribution-reader-sources",
    resolveId(source) {
      if (source === virtualId) return resolvedVirtualId
    },
    async load(source) {
      if (source !== resolvedVirtualId) return

      const coreResult = await bundleEntry(coreEntry, projectRoot, "distributionReader")
      watchInputs(this, coreResult, projectRoot)
      const core = coreResult.outputFiles[0].text
      const sources = { core }

      for (const [name, exportName] of Object.entries(actions)) {
        const result = await bundleAction(name, exportName, actionEntry, projectRoot)
        watchInputs(this, result, projectRoot)
        sources[name] = result.outputFiles[0].text
      }

      return `export default ${JSON.stringify(sources)}`
    },
  }
}
