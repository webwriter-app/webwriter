const runtimes = {
  widget: () => import("virtual:live-example-runtime/widget"),
  lit: () => import("virtual:live-example-runtime/lit"),
  "lit-widget": () => import("virtual:live-example-runtime/lit-widget"),
  "widget-effects": () => import("virtual:live-example-runtime/widget-effects"),
  react: () => import("virtual:live-example-runtime/react"),
  vue: () => import("virtual:live-example-runtime/vue"),
  angular: () => import("virtual:live-example-runtime/angular"),
  svelte: () => import("virtual:live-example-runtime/svelte"),
}

export async function loadLiveExampleLibrary(library, language, useLitWidget, useWidgetEffects, useWidgetRuntime) {
  const assets = new Set([library === "lit" && useLitWidget ? "lit-widget" : library])
  if(useLitWidget) assets.add("lit-widget")
  if(useWidgetEffects) assets.add("widget-effects")
  if(useWidgetRuntime) assets.add("widget")
  const [modules, compile] = await Promise.all([
    Promise.all([...assets].filter(name => Object.hasOwn(runtimes, name)).map(name => runtimes[name]())),
    loadCompiler(language),
  ])
  return {runtime: modules.map(module => module.default).join("\n"), compile}
}

let compilerReady

async function loadCompiler(language) {
  if(["jsx", "ts", "tsx"].includes(language)) {
    const [{default: esbuild}, {default: wasmURL}] = await Promise.all([
      import("esbuild-wasm/esm/browser.js"), import("esbuild-wasm/esbuild.wasm?url"),
    ])
    compilerReady ??= esbuild.initialize({wasmURL, worker: true}).catch(error => {
      compilerReady = undefined
      throw error
    })
    await compilerReady
    return async source => (await esbuild.transform(source, {
      loader: language, target: "es2022", format: "esm", jsx: "automatic",
      tsconfigRaw: {compilerOptions: {experimentalDecorators: true, useDefineForClassFields: false}},
    })).code
  }
  if(language === "vue") {
    const {parse, compileScript, compileStyle, compileTemplate} = await import("@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js")
    return (source, registration) => {
      const filename = "Widget.vue"
      const id = "live-widget"
      const {descriptor, errors} = parse(source, {filename})
      if(errors.length) throw errors[0]
      let component
      if(descriptor.script || descriptor.scriptSetup) {
        component = compileScript(descriptor, {id, inlineTemplate: true, customElement: true, genDefaultAs: "LiveWidget"}).content
      } else {
        const template = compileTemplate({source: descriptor.template.content, filename, id})
        if(template.errors.length) throw template.errors[0]
        component = `${template.code}\nconst LiveWidget = {render}`
      }
      const styles = descriptor.styles.map(style => {
        const result = compileStyle({source: style.content, filename, id})
        if(result.errors.length) throw result.errors[0]
        return result.code
      })
      const register = registration?.replace(/\bimport\s+(\w+)\s+from\s+["'][^"']+\.vue["'];?/, "const $1 = LiveWidget;")
      if(!register || register === registration) throw new Error("A Vue example needs a registration module that imports its component.")
      return `${component}\nLiveWidget.styles = ${JSON.stringify(styles)}\n${register}`
    }
  }
  if(language === "svelte") {
    const {compile} = await import("virtual:live-example-svelte-compiler")
    return source => compile(source, {filename: "Widget.svelte", generate: "client", customElement: true}).js.code
  }
  return source => source
}
