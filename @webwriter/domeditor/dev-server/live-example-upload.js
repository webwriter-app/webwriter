import {ImportType, init, parse} from "es-module-lexer"

const sourceFile = /\.(?:m?js|jsx|ts|tsx|vue|svelte)$/
const conditions = ["source", "browser", "import", "default"]

function exportPaths(target, keys = conditions) {
  if(typeof target === "string") return [target]
  if(!target || typeof target !== "object") return []
  return keys.flatMap(key => exportPaths(target[key]))
}

function localPath(path, from = "") {
  const segments = from.split("/").slice(0, -1)
  for(const segment of path.split("/")) {
    if(segment === ".") continue
    if(segment === ".." && segments.length) segments.pop()
    else if(!/^[\w.-]+$/.test(segment) || segment === "..") throw new Error(`Invalid local path: ${path}`)
    else segments.push(segment)
  }
  return segments.join("/")
}

async function readFile(root, path) {
  const segments = path.split("/")
  let folder = root
  for(const segment of segments.slice(0, -1)) folder = await folder.getDirectoryHandle(segment)
  return (await (await folder.getFileHandle(segments.at(-1))).getFile()).text()
}

async function findFile(root, paths) {
  for(const path of new Set(paths)) {
    try {
      return {path, code: await readFile(root, path)}
    } catch(error) {
      if(error.name !== "NotFoundError") throw error
    }
  }
}

function inferLibrary(language, source) {
  if(language === "vue" || language === "svelte") return language
  if(/["']@angular\//.test(source)) return "angular"
  if(/["'](?:react|react-dom)(?:\/[^"']+)?["']/.test(source) || language === "jsx" || language === "tsx") return "react"
  if(/["']vue(?:\/[^"']+)?["']/.test(source)) return "vue"
  if(/["']svelte(?:\/[^"']+)?["']/.test(source)) return "svelte"
  if(/["'](?:lit|@webwriter\/lit)(?:\/[^"']+)?["']/.test(source)) return "lit"
  return "vanilla"
}

export async function readWidgetFolder(root) {
  const manifest = JSON.parse(await readFile(root, "package.json"))
  if(!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("package.json must contain an object.")
  }
  const widgets = new Map()
  for(const [key, target] of Object.entries(manifest.exports ?? {})) {
    const match = /^\.\/widgets\/(?:[\w.-]+\/)*([a-z][\w.-]*-[\w.-]+?)(?:\.(?:\*|m?js|css))?$/.exec(key)
    if(!match) continue
    const tag = match[1]
    if(!widgets.has(tag)) widgets.set(tag, [])
    if(!key.endsWith(".css")) widgets.get(tag).push(...exportPaths(target)
      .map(path => path.replace(/\.\*$/, ".js")).filter(path => sourceFile.test(path)))
  }
  if(widgets.size > 1) throw new Error("Choose a package that exports exactly one widget.")
  if(!widgets.size) throw new Error("package.json does not export a widget under ./widgets/.")
  const [[tag, targets]] = widgets
  if(!targets.length) throw new Error(`package.json does not export a script for <${tag}>.`)
  const expected = targets.map(path => localPath(path))
  const generated = expected.find(path => path.endsWith("-component.js"))
  const conventional = ["js", "jsx", "ts", "tsx", "vue", "svelte"].map(extension => `${tag}.${extension}`)
  const candidates = [...expected.filter(path => !path.startsWith("dist/") && path !== generated),
    ...(generated ? [generated.replace(/-component\.js$/, ".svelte")] : []), ...conventional, ...expected]
  let entry = await findFile(root, candidates)
  if(!entry) throw new Error(`Could not find the source for <${tag}>.`)
  const entryPath = entry.path

  const extraFiles = new Map()
  let registration
  let registrationPath
  const componentPath = /\bfrom\s*["'](\.\.?\/[^"']+\.vue)["']/.exec(entry.code)?.[1]
  if(componentPath) {
    registration = entry.code
    registrationPath = entry.path
    entry = await findFile(root, [localPath(componentPath, entry.path)])
    if(!entry) throw new Error(`Could not find ${componentPath}.`)
  } else if(entry.path.endsWith(".js")) {
    const compiled = /\bfrom\s*["'](\.\.?\/[^"']+)-component\.js["']/.exec(entry.code)?.[1]
    const component = compiled && await findFile(root, [localPath(compiled + ".vue", entry.path)])
    if(component) {
      extraFiles.set(entry.path, entry.code)
      registration = entry.code.replace(compiled + "-component.js", compiled + ".vue")
      registrationPath = entry.path
      entry = component
    }
  }

  const language = entry.path.endsWith(".mjs") ? "js" : entry.path.split(".").at(-1)
  if(language === "vue" && !registration) {
    registration = `import {defineCustomElement} from "vue"
import Widget from "./${entry.path.split("/").at(-1)}"
customElements.define(${JSON.stringify(tag)}, defineCustomElement(Widget))`
    registrationPath = entry.path.replace(/\.vue$/, ".js")
  }

  const modules = new Map()
  const aliases = Object.create(null)
  await init
  function moduleReferences(code, path) {
    const source = /\.(?:vue|svelte)$/.test(path)
      ? Array.from(code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g), match => match[1])
      : [code]
    return source.flatMap(script => parse(script)[0].filter(entry => entry.t !== ImportType.ImportMeta && entry.n).map(entry => entry.n))
  }

  async function collect(code, path) {
    for(const specifier of new Set(moduleReferences(code, path))) {
      const target = specifier.startsWith(".") ? specifier : exportPaths(manifest.imports?.[specifier], ["browser", "import", "default"])[0]
      if(!target) {
        if(specifier.startsWith("#")) throw new Error(`Missing package import ${specifier}.`)
        continue
      }
      if(registration && path === registrationPath && target.endsWith(".vue")) continue
      const base = localPath(target, specifier.startsWith(".") ? path : "")
      const local = await findFile(root, sourceFile.test(base) ? [base] : [base, base + ".js", base + ".ts", base + "/index.js"])
      if(!local) throw new Error(`Could not find local import ${specifier} in ${path}.`)
      if(local.path === entry.path) throw new Error("The widget entry cannot import itself through a local module.")
      aliases[base] = local.path
      const existing = modules.get(local.path)
      if(existing) continue
      if(!/\.m?js$/.test(local.path)) throw new Error(`Local helper ${local.path} must be a JavaScript module.`)
      modules.set(local.path, local.code)
      await collect(local.code, local.path)
    }
  }

  await collect(entry.code, entry.path)
  if(registration) await collect(registration, registrationPath)
  const shared = [...modules].map(([path, code]) => ({specifier: `#local/${path}`, path, code}))

  for(const path of ["build.mjs", "compile.mjs", "tsconfig.json", ...Object.entries(manifest.exports ?? {})
    .filter(([key]) => !key.startsWith("./widgets/")).flatMap(([, target]) => exportPaths(target)
      .flatMap(path => path.endsWith(".*") ? [path.slice(0, -1) + "js", path.slice(0, -1) + "css"] : [path]))]) {
    const file = await findFile(root, [localPath(path)])
    if(file) extraFiles.set(file.path, file.code)
  }

  const collaboration = ["", ".js", ".*"].some(suffix => manifest.editingConfig?.[`./widgets/${tag}${suffix}`]?.sharedData === true)
  const stylesheet = Object.entries(manifest.exports ?? {})
    .find(([key]) => key.startsWith("./widgets/") && key.endsWith(`/${tag}.css`))?.[1]
  const stylePaths = stylesheet ? exportPaths(stylesheet).filter(path => path.endsWith(".css")) : [entryPath.replace(/\.[^.]+$/, ".css")]
  const style = await findFile(root, stylePaths.map(path => localPath(path)))
  if(style) extraFiles.set(style.path, style.code)
  return {
    source: entry.code, sourcePath: entry.path, registration, registrationPath, language, shared,
    library: inferLibrary(language, entry.code), aliases,
    manifest, extraFiles: [...extraFiles],
    markup: (style ? `<style>${style.code.replace(/<\/style/gi, "<\\/style")}</style>\n` : "")
      + `<${tag}>${collaboration ? '<script type="application/json" slot="data">{}</script>' : ""}</${tag}>`,
    collaboration,
  }
}

export async function resolveFolderImports(code, filename, shared, imports, aliases, registrationPath) {
  if(!filename) return code
  await init
  const paths = new Map(shared.map(({path, specifier}) => [path, specifier]))
  const [references] = parse(code)
  for(const reference of references.reverse()) {
    const name = reference.n
    if(!name || reference.t === ImportType.ImportMeta) continue
    const target = name.startsWith(".") ? name : exportPaths(imports?.[name], ["browser", "import", "default"])[0]
    if(!target) continue
    const path = localPath(target, name.startsWith(".") ? filename : "")
    const alternate = registrationPath && name.startsWith(".") ? localPath(target, registrationPath) : path
    const specifier = paths.get(aliases[path] ?? path) ?? paths.get(aliases[alternate] ?? alternate)
    if(!specifier) throw new Error(`Could not resolve local import ${name}.`)
    const replacement = reference.d >= 0 ? JSON.stringify(specifier) : specifier
    code = code.slice(0, reference.s) + replacement + code.slice(reference.e)
  }
  return code
}
