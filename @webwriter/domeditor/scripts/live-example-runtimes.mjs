import {createRequire} from "node:module"
import {fileURLToPath} from "node:url"
import {build} from "esbuild"

const root = fileURLToPath(new URL("..", import.meta.url))
const require = createRequire(new URL("../package.json", import.meta.url))
const virtualPrefix = "\0virtual:live-example-runtime/"

const runtimePackages = {
  widget: ["@webwriter/widget"],
  lit: ["lit"],
  "lit-widget": ["lit", "@webwriter/lit", "@lit-labs/signals"],
  "widget-effects": [],
  react: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "@webwriter/react"],
  vue: ["vue", "@webwriter/vue"],
  angular: ["@angular/compiler", "@angular/core", "@angular/platform-browser", "@angular/elements", "@webwriter/angular"],
  svelte: [
    "svelte",
    "svelte/internal/client",
    "svelte/internal/disclose-version",
    "svelte/internal/flags/legacy",
    "svelte/internal/flags/tracing",
    "@webwriter/svelte",
  ],
}

function availablePackages(packages) {
  return packages.filter((specifier) => {
    try {
      require.resolve(specifier)
      return true
    } catch {
      return false
    }
  })
}

function runtimeEntry(packages) {
  const imports = packages.map((specifier, index) =>
    `import * as module${index} from ${JSON.stringify(specifier)};`,
  )
  const entries = packages.map((specifier, index) =>
    `${JSON.stringify(specifier)}: module${index}`,
  )
  if(packages[0] === "vue") entries.push('"vue/dist/vue.runtime.esm-browser.js": module0')

  return `${imports.join("\n")}\nglobalThis.__liveExampleModules = {\n...globalThis.__liveExampleModules,\n${entries.join(",\n")}\n};\n`
}

async function compileRuntime(name) {
  const packages = availablePackages(runtimePackages[name])
  if (name === "svelte" && !packages.includes("svelte/internal/client")) {
    throw new Error("The installed Svelte package does not expose svelte/internal/client")
  }

  const result = await build({
    absWorkingDir: root,
    stdin: {
      contents: name === "widget-effects"
        ? 'import * as effects from "./src/widget-effects.ts"; (globalThis.__liveExampleModules ??= {})["#preview-widget-effects"] = effects;'
        : runtimeEntry(packages),
      resolveDir: root,
      sourcefile: `live-example-runtime-${name}.js`,
      loader: "js",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    target: "es2022",
    minify: true,
    legalComments: "none",
    define: {"process.env.NODE_ENV": '"production"', __VUE_OPTIONS_API__: "true", __VUE_PROD_DEVTOOLS__: "false", __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false"},
    // Use the runtime-only Vue build, with compile-time flags set above.
    alias: name === "vue" ? {vue: require.resolve("vue/dist/vue.runtime.esm-bundler.js")} : {},
  })

  return result.outputFiles[0].text
}

/**
 * Build per-library browser runtime assets only when Vite requests their virtual
 * modules. Each asset bundles its framework imports together, so shared runtime
 * dependencies are included once within that asset.
 */
export function liveExampleRuntimes() {
  const compiled = new Map()

  return {
    name: "live-example-runtimes",
    enforce: "pre",
    resolveId(source) {
      if(source === "virtual:live-example-svelte-compiler") return "\0" + source
      if (source.startsWith("virtual:live-example-runtime/")) {
        return `${virtualPrefix}${source.slice("virtual:live-example-runtime/".length)}`
      }
    },
    async load(id) {
      if(id === "\0virtual:live-example-svelte-compiler") {
        const result = await build({
          absWorkingDir: root, stdin: {contents: 'export {compile} from "svelte/compiler"', resolveDir: root},
          bundle: true, write: false, platform: "browser", format: "esm", target: "es2022", minify: true,
        })
        return result.outputFiles[0].text
      }
      if (!id.startsWith(virtualPrefix)) return

      const name = id.slice(virtualPrefix.length)
      if (!Object.hasOwn(runtimePackages, name)) {
        throw new Error(`Unknown live example runtime: ${name}`)
      }

      let runtime = compiled.get(name)
      if (!runtime) {
        runtime = compileRuntime(name)
        compiled.set(name, runtime)
      }

      const source = await runtime
      return {
        code: `export default ${JSON.stringify(source)};`,
        moduleSideEffects: false,
      }
    },
  }
}
