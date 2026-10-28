import { build } from "esbuild"
import { existsSync } from "node:fs"
import { isAbsolute, normalize, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const virtualId = "virtual:distribution-reader-sources"
const resolvedVirtualId = `\0${virtualId}`
const actions = {
  edit: "installEdit",
  move: "installMove",
  style: "installStyle",
  delete: "installDelete",
  duplicate: "installDuplicate",
  insert: "installInsert",
}

const blockedInputs = [
  /\/src\/components\//,
  /\/src\/app-settings(?:\.ts|\/|$)/,
  /\/src\/editor-bridge(?:\.ts|\/|$)/,
  /\/src\/domeditor\.ts$/,
  /\/src\/editor-entry\.ts$/,
]

function absoluteInput(input, projectRoot) {
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

async function bundleEntry(entry, projectRoot, globalName) {
  const result = await build({
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
