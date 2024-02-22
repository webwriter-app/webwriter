import {z} from "zod"
import { cargoQueue, map } from "async"
import MiniSearch from "minisearch"
import merge from "lodash.merge"

import { capitalizeWord, escapeRegex, filterObject, hashCode, unscopePackageName } from "../../utility"
import { Environment, WatchEvent } from "../environment"
import { CustomElementsManifest, ManifestCustomElementDeclaration, ManifestDeclaration, ManifestPropertyLike, MemberSettings, Package, SemVer, SnippetEditingSettings, ThemeEditingSettings, WidgetEditingSettings, themes } from ".."
import {version as appVersion} from "../../package.json"
import { licenses, presets } from "../templates"
import { toJS } from "mobx"

type Options = {
  corePackages?: Package["name"][]
  onBundleChange?: (packages: Package[]) => void
} & Environment

type PmQueueTask = {
  command: "install" | "add" | "remove" | "update",
  parameters: string[],
  cwd?: string,
  name?: string
}

type PackageCache = Record<string, Pick<Package, typeof Package["coreKeys"] | "members">>

const IMAGE_FILE_EXTENSIONS = [".apng", ".jpg", ".jpeg", ".jfif", ".pjpeg", ".pjp", ".png", ".svg", ".webp", ".bmp", ".ico", ".cur", ".tif", ".tiff"]
const AUDIO_FILE_EXTENSIONS = [".wav", ".wave", ".mp3", ".aac", ".aacp", ".oga", ".flac", ".weba"]
const VIDEO_FILE_EXTENSIONS = [".mp4", ".webm", ".avif", ".gif", ".mov", ".avi", ".ogv", ".mkv", ".opus", ".mpeg"]
const FONT_FILE_EXTENSIONS = [".woff", ".woff2", ".ttf", ".otf"]

const BUNDLE_LOADER_MAP = {
  "dataurl": [...IMAGE_FILE_EXTENSIONS, ...AUDIO_FILE_EXTENSIONS, ...VIDEO_FILE_EXTENSIONS, FONT_FILE_EXTENSIONS, ".pdf"],
  "json": [".json", ".jsonld"],
  "text": [".txt", ".csv", ".htm", ".html", ".xml"]
}

const BUNDLE_LOADER_OPTIONS = Object.entries(BUNDLE_LOADER_MAP).flatMap(([loader, exts]) => exts.map(ext => `--loader:${ext}=${loader}`))

export class ServiceIssue extends Error {}
export class ReadWriteIssue extends Error {}
export class InstallIssue extends Error {}
export class UninstallIssue extends Error {}
export class UpdateIssue extends Error {}
export class BundleIssue extends Error {}
export class WidgetNameIssue extends Error {}
export class PackageJsonIssue extends Error {}
export class Warning extends Error {}

/** Handles packages. Packages are node (npm) packages which contain widgets. The PackageStore can also create bundles from packages, which can for example be imported by the runtime editor or embedded by serializers. Additionally, the PackageStore can open or clear the app directory which stores the packages. */
export class PackageStore {

  static bundleOptions = ["--bundle", `--format=esm`, `--tsconfig-raw={"compilerOptions":{"experimentalDecorators":true, "target": "es2022", "useDefineForClassFields": false}}`, ...BUNDLE_LOADER_OPTIONS]

  static developmentBundleOptions = ["--sourcemap=inline"]
  static productionBundleOptions = ["--drop-labels=DEV"]

  private static async readFileIfExists(path: string, FS: Environment["FS"]): Promise<string | undefined> {
    return await FS.exists(path)? await FS.readFile(path) as string: undefined
  }

  private static async bundlePath(importIDs: string[], Path: Environment["Path"], FS: Environment["FS"], includesLocal=false, production=false) {
    const hash = PackageStore.computeBundleHash(importIDs, production)
    const appDir = await Path.appDir()
    const jsPath = await Path.join(appDir, "bundlecache", `${hash}.js`)
    const cssPath = await Path.join(appDir, "bundlecache", `${hash}.css`)
    const entryPath = await Path.join(appDir, "bundlecache", `${hash}.entrypoint.js`)
    return {
      jsExists: !includesLocal && await FS.exists(jsPath),
      jsPath,
      cssExists: !includesLocal && await FS.exists(cssPath),
      cssPath,
      entryPath
    }
  }

  static async readBundle(importIDs: string[], bundle: Environment["bundle"], Path: Environment["Path"], FS: Environment["FS"], includesLocal=false, production=false) {
    let appDir
    try {
       appDir = await Path.appDir()
    }
    catch(cause) {
      throw new ReadWriteIssue("Could not read path of app directory: " + String(cause), {cause})
    }
    const bundleID = PackageStore.computeBundleID(importIDs, undefined, production)
    if(importIDs.length === 0) {
      return {bundleID, bundleJS: "", bundleCSS: ""}
    }
    let {jsPath, jsExists, cssPath, cssExists, entryPath} = await this.bundlePath(importIDs, Path, FS, includesLocal, production)
    if(!jsExists && !cssExists || includesLocal || production) {
      const entryCode = importIDs
        .map(id => id.replace(new RegExp(`@` + SemVer.pattern.source, "g"), ""))
        .map(k => `import "${k}"`)
        .join(";")
      try {
        await FS.mkdir(await Path.join(appDir, "bundlecache"))
        await FS.writeFile(entryPath, entryCode)
      }
      catch(cause) {
        throw new ReadWriteIssue(`Could not create entrypoint file ${entryPath}`, {cause})
      }
      try {
        await bundle([
          `${entryPath}`,
          `--outfile=${jsPath}`,
          ...PackageStore.bundleOptions,
          ...(!production? PackageStore.developmentBundleOptions: PackageStore.productionBundleOptions) 
        ])
      }
      catch(rawCause) {
        const importPaths = [...new Set(importIDs
          .map(id => id.slice(0, id.replace("@", "_").indexOf("@"))))]
          .map(path => escapeRegex(path))
        const esbuildPathRegex = new RegExp(`^\\s*(?:[^/]+\/)+(${importPaths.join("|")}\/(?:[^/]+\\/)+[^/]+\\d+:\\d+:)`, "g")
        const cause = (rawCause as string)
          .split("\n")
          .map(str => str.replaceAll(esbuildPathRegex, "$1"))
          .join("\n")
          .split("X [ERROR] ")
          .map(err => err.trim())
          .join("\n")
        throw new BundleIssue(`Bundle produced errors`, {cause})
      }
    }
    const [bundleJS, bundleCSS] = await Promise.all([
      this.readFileIfExists(jsPath, FS),
      this.readFileIfExists(cssPath, FS)
    ])
    return {bundleID, bundleJS, bundleCSS}
  }


  /** Converts a H5P library object (library.json) into a node package (package.json), including the raw library data under the key "h5pLibrary". */
  static H5PtoPackageJson(name: string, library: Record<string, any>): Package {
    return new Package({
      name,
      version: `${library["majorVersion"]}.${library["minorVersion"]}.${library["patchVersion"]}`,
      description: library["description"],
      license: library["license"],
      author: library["author"],
      keywords: ["webwriter-h5p", "webwriter-widget"],
      h5pLibrary: {...library}
    })
  }

  static computeBundleID(importIDs: string[], reloadCount?: number, production=false) {
    return importIDs.join("~~") + (reloadCount? `~~~${reloadCount}`: "") + (production? `~~~prod`: "")
  }

  /** Create a hash value to identify a bundle. The hash is deterministically computed from the packages' names and versions. This allows for caching of existing bundles. */
  static computeBundleHash(importIDs: string[], production=false) {
    const bundleID = this.computeBundleID(importIDs, undefined, production)
    return hashCode(bundleID).toString(36)
  }

  static getManifestCustomElements(customElements: CustomElementsManifest) {
    return (customElements?.modules ?? [])
      .flatMap(mod => (mod?.declarations ?? []) as ManifestDeclaration[])
      .filter((decl): decl is ManifestCustomElementDeclaration => "customElement" in decl)
  }

  static settingsFromDeclaration(customElements: CustomElementsManifest | undefined, tag: string) {
    if(!customElements) {
      return {}
    }
    const elementDeclarations = this.getManifestCustomElements(customElements)
    const value = (elementDeclarations.find(decl => decl.tagName === tag)?.members?.find(m => m.kind === "field" && m.static && m.name === "editingConfig" && m.default) as ManifestPropertyLike)?.default
    try {
      return JSON.parse(value ?? "null")
    }
    catch(err: any) {
      console.warn("Error parsing `editingSettings` on widget declaration, using default config instead (must be a valid JSON literal, including quoted property names):" + err?.message)
      return null
    }
  }

  constructor(options: Options) {
    Object.assign(this, options)
    this.appDir = this.Path.appDir()
    this.rootPackageJsonPath = this.appDir.then(dir => this.Path.join(dir, "package.json"))
    this.initialized = this.initialize()
  }

  FS: Environment["FS"]
  Path: Environment["Path"]
  Shell: Environment["Shell"]
  OS: Environment["OS"]
  Dialog: Environment["Dialog"]
  bundle: Environment["bundle"]
  search: Environment["search"]
  pm: Environment["pm"]
  watch: Environment["watch"]
  onBundleChange: Options["onBundleChange"]

  initialized: Promise<void>
  loading: boolean = false
  initializing: boolean = false
  resetting: boolean = false
  appDir: Promise<string>
  rootPackageJsonPath: Promise<string>

  bundleJS: string = ""
  bundleCSS: string = ""
  bundleID: string = ""

  packages: Record<string, Package> = {}

  adding: Record<string, boolean> = {}
  removing: Record<string, boolean> = {}
  updating: Record<string, boolean> = {}

  issues: Record<string, Error[]> & {_?: Error[]} = {}

  get managementIssues() {
    return this.issues._ ?? []
  }

  set managementIssues(_: Error[]) {
    this.issues = {...this.issues, _}
  }

  appendManagementIssues(...issues: Error[]) {
    this.appendPackageIssues("_", ...issues)
  }

  getPackageIssues(id: string) {
    return this.issues[id] ?? []
  }

  setPackageIssues(id: string, issues: Error[]) {
    this.issues[id] = issues
  }

  appendPackageIssues(id: string, ...issues: Error[]) {
    this.issues[id] = [...this.getPackageIssues(id), ...issues]
  }

  get importingName() {
    return Object.keys(this.adding).find(name => this.adding[name] && !(name in this.packages))
  }

  searchIndex = new MiniSearch<Package>({
    fields: ["id", "name", "description", "version", "keywords"],
    extractField: (doc, fieldName) => (fieldName === "keywords"? doc?.keywords?.join(", "): String(doc[fieldName as keyof typeof doc])) ?? "",
    idField: "name"
  })

  searchPackages = (query: string) => {
    return this.searchIndex.search(query, {boost: {id: 5, name: 4, keywords: 3, version: 2, description: 1}, prefix: true, fuzzy: 1})
  }

  pmQueue = cargoQueue(async (tasks: PmQueueTask[]) => {
    const toAdd = tasks.filter(t => t.command === "add").flatMap(t => t.parameters)
    const toRemove = tasks.filter(t => t.command === "remove").flatMap(t => t.parameters)
    const toUpdate = tasks.filter(t => t.command === "update").flatMap(t => t.parameters)
    if(toAdd.length > 0) {
      const names = Object.fromEntries(toAdd.map(key => [
        key,
        !key.startsWith("file")? key: tasks.find(t => t.parameters.includes(key))!.name!
      ]))
      try {
        await this.pm("add", [...toAdd, "--ignore-scripts"], await this.appDir)
      }
      catch(err) {
        console.error(err)
      }
      finally {
        this.adding = {...this.adding, ...Object.fromEntries(toAdd.map(name => [names[name], false]))}
      }
    }
    if(toRemove.length > 0) {
      try {
        await this.pm("remove", toRemove, await this.appDir)
      }
      catch(err) {
        console.error(err)
      }
      finally {
        this.removing = {...this.removing, ...Object.fromEntries(toRemove.map(name => [name, false]))}
      }
    }
    if(toUpdate.length > 0) {
      try {
        await this.pm("update", [...toUpdate, "--ignore-scripts"], await this.appDir)
      }
      catch(err) {
        console.error(err)
      }
      finally {
        this.updating = {...this.updating, ...Object.fromEntries(toUpdate.map(name => [name, false]))}
      }
    }
  })

  private unwatchCallbacks: Record<string, CallableFunction> = {}

  get watching() {
    return Object.fromEntries(Object.entries(this.unwatchCallbacks).filter(([k, v]) => !!v).map(([k, v]) => [k, !!v]))
  }

  set watching(value: Record<string, boolean>) {
    for (const [name, watching] of Object.entries(value)) {
      this.toggleWatch(name, watching)
    }
  }

  get widgetNames() {
    return Object.keys(this.packages).map(name => unscopePackageName(name))
  }

  get widgetPackageMap(): Record<string, Package> {
    return Object.fromEntries(Object.keys(this.packages).map(name => [unscopePackageName(name), this.packages[name]]))
  }

  async initialize(force=false) {
    this.initializing = true
    const rootExists = await this.FS.exists(await this.rootPackageJsonPath)
    const appDirExists = rootExists || await this.FS.exists(await this.appDir)
    if(!rootExists || force) {
      await (appDirExists && this.FS.rmdir(await this.appDir))
      await this.FS.mkdir(await this.appDir)
      await this.writeRootPackageJson()
      await this.pm("install", [], await this.appDir)
    }
    try {
      await this.load()
    }
    catch(err) {
      console.warn("Resetting app directory due to initialization error.", err)
      await this.initialize(true)
    }
    this.initializing = false
  }

  get defaultRootPackage() {
    return new Package({
      name: "webwriter-root",
      version: appVersion,
      private: true,
      description: "Internal package to manage installed WebWriter packages",
      devDependencies: {
        "@custom-elements-manifest/analyzer": "^0.9.0"
      }
    })
  }

  private async readRootPackageJson() {
    if(!await this.FS.exists(await this.rootPackageJsonPath)) {
      return undefined
    }
    const json = JSON.parse(await this.FS.readFile(await this.rootPackageJsonPath) as string)
    return new Package(json)
  }

  private async writeRootPackageJson(pkg: Package = this.defaultRootPackage) {
    return this.FS.writeFile(await this.rootPackageJsonPath, JSON.stringify(pkg, undefined, 2))
  }

  async add(url: string, name?: string) {
    console.log(url, name)
    this.adding = {...this.adding, [name ?? url]: true}
    return this.pmQueue.push({command: "add", parameters: [url], cwd: await this.appDir, name})
  }

  async remove(name: string) {
    this.removing = {...this.removing, [name]: true}
    return this.pmQueue.push({command: "remove", parameters: [name], cwd: await this.appDir})
  }

  async update(name?: string) {
    this.updating = name
      ? {...this.updating, [name]: true}
      : Object.fromEntries(this.packagesList.filter(pkg => pkg.installed).map(pkg => [pkg.name, true]))
    return this.pmQueue.push({command: "update", parameters: name? [name, "--latest"]: ["--latest"], cwd: await this.appDir})
  }

  get packagesList() {
    return Object.values(this.packages)
  }
  
  private async writeH5Package(url: string | string[]): Promise<string | string[]> {
    if(Array.isArray(url)) {
      return Promise.all(url.map(u => this.writeH5Package(u) as Promise<string>))
    }
    const {href, pathname, hash} = new URL(url)
    const urlWithoutHash = href.split("#")[0]
    const packageName = pathname.split("/").filter(v => v).pop()?.replace(".git", "") as string
    const appDir = await this.Path.appDir()
    const dir = appDir + "h5_packages/" + packageName
    const ref = hash? hash.replace("#", ""): "master"
    await this.FS.mkdir(dir + "/.git")
    await this.FS.writeFile(dir + "/.git/config", "", "utf8")
    // yield call(clone, {fs, http, dir, url: urlWithoutHash, singleBranch: true, ref, depth: 1})
    const libString = await this.FS.readFile(dir + "/library.json", "utf8") as string
    const lib = JSON.parse(libString)
    const pkg = PackageStore.H5PtoPackageJson(packageName, lib)
    const packageJsonPath = await this.Path.join(dir, "package.json")
    const indexJsPath = await this.Path.join(dir, "index.js")
    this.FS.writeFile(packageJsonPath, JSON.stringify(pkg, undefined, 2), "utf8")
    this.FS.writeFile(indexJsPath, "export default null", "utf8")
    return dir
  }

  reloadCount = 0

  /** Reads local packages from disk, importing them, and/or fetches available packages from the configured registry.*/
  async load() {
    this.loading = true
    this.issues = {}
    this.reloadCount++
    let [installed, available] = await Promise.all([
      this.fetchInstalled(),
      this.fetchAvailable()
    ])
    await this.validateInstalled(installed)
    const importable = installed.filter(pkg => !this.getPackageIssues(pkg.id)?.length)
    const includesLocal = importable.some(pkg => pkg?.localPath)
    const importIDs = this.widgetImportIDs(importable)
    const newID = PackageStore.computeBundleID(importIDs, !includesLocal? undefined: this.reloadCount)
    if(newID !== this.bundleID) {
      try {
        const {bundleJS, bundleCSS} = await PackageStore.readBundle(importIDs, this.bundle, this.Path, this.FS, includesLocal)
        this.bundleID = newID
        this.bundleJS = bundleJS!
        this.bundleCSS = bundleCSS!;
        (this.onBundleChange ?? (() => null))(importable)
      }
      catch(err) {
        this.appendManagementIssues(err as Error)
      }
    }
    console.log("merging package list")
    let final: Package[] = []
    for(const pkg of installed) {
      const aPkg = available.find(a => a.name === pkg.name)
      if(aPkg) {
        available = available.filter(a => a.name !== pkg.name)
      }
      const latest = aPkg?.version
      final.push(pkg.extend({latest, installed: true}))
    }
    final = final.concat(available)
    this.searchIndex.removeAll()
    this.searchIndex.addAll(final)
    this.packages = Object.fromEntries(final.map(pkg => [pkg.name, pkg]))
    this.loading = false
    console.log("loading done")
  }

  private async fetchAvailable() {
    let rawPkgs = [] as any[]
    try {
      const {objects} = await this.search("keywords:webwriter-widget")
      rawPkgs = objects.map(obj => obj["package"])
    }
    catch(cause) {
      this.appendManagementIssues(new ServiceIssue("Could not run search", {cause}))
    }
    const members = await Promise.all(rawPkgs.map(async pkg => this.readPackageMembers(pkg)))
    return rawPkgs.map((pkg, i) => new Package(pkg, {members: members[i]}))
  }

  private async fetchInstalled() {
    const appDir = await this.appDir;
    let pkgJsonPaths = [] as any[], localPaths: any[]
    try {
      const dependencies = (await this.readRootPackageJson())?.dependencies ?? {}
      pkgJsonPaths = await Promise.all(Object.keys(dependencies).map(k => this.Path.join(appDir, "node_modules", k, "package.json")))
      localPaths = Object.values(dependencies).map(v => v.startsWith("file:")? v.slice(5): undefined)
    }
    catch(cause) {
      this.appendManagementIssues(new ReadWriteIssue("Could not read installed package.json files", {cause}))
    }
    return Promise.all(pkgJsonPaths.map((p, i) => this.readPackage(p, localPaths[i])))
  }

  private async validateInstalled(pkgs: Package[]) {
    // Warn for packages without exports
    // Warn for packages that register extra custom elements
  }

  private async readPackage(jsonPath: string, localPath?: string) {
    const pkgRootPath = jsonPath.slice(0, -("package.json".length))
    const pkgJson = JSON.parse(await this.FS.readFile(jsonPath) as string)
    const members = await this.readPackageMembers(pkgJson, pkgRootPath)
    const {jsExists, cssExists} = await PackageStore.bundlePath(this.widgetImportIDs([pkgJson]), this.Path, this.FS)
    const pkg = new Package(pkgJson, {installed: true, watching: this.watching[pkgJson.name], localPath, members})
    if(!jsExists && !cssExists) {
      try {
        await PackageStore.readBundle(this.widgetImportIDs([pkg]), this.bundle, this.Path, this.FS, !!pkg.localPath)
      }
      catch(cause) {
        this.appendPackageIssues(pkg.id, cause as Error)
      }
    }
    return pkg
  }

  private async readPackageMembers(pkg: Package, path?: string) {
    const exports = pkg.exports ?? {}
    const editingConfig = pkg?.editingConfig ?? {}
    
    const customElements = undefined // !path? undefined: await this.readAnalysis(pkg, path)
    const widgetKeys = Object.keys(exports).filter(k => k.startsWith("./widgets/"))
    const widgets = Object.fromEntries(widgetKeys.map((name, i) => [
      name,
      {name, ...(editingConfig[widgetKeys[i]] ?? PackageStore.settingsFromDeclaration(customElements, name.replace("./widgets/", "")) ?? {})}
    ]))

    const snippetKeys = Object.keys(exports).filter(k => k.startsWith("./snippets/"))
    const themeKeys = Object.keys(exports).filter(k => k.startsWith("./themes/"))
    const keys = [...snippetKeys, ...themeKeys]
    const paths = keys.map(k => exports[k as keyof typeof exports])
    const sources = !path? {}: Object.fromEntries(await Promise.all(paths.map(async (p, i) => {
      let fullPath
      try {
        fullPath = await this.Path.join(path, p)
      }
      catch(cause) {
        throw new ReadWriteIssue(`Could not join paths '${path}' and '${p}'`, {cause})
      }
      let result
      try {
        result = await this.FS.readFile(fullPath)
      }
      catch(cause) {
        throw new ReadWriteIssue(`Could not read file ${fullPath}`, {cause})
      }
      return [keys[i], result]
    })))
    const snippets = Object.fromEntries(snippetKeys.map(name => [
      name,
      {...editingConfig[name], name, source: sources[name]}
    ]))
    const themes = Object.fromEntries(themeKeys.map(name => [
      name,
      {...editingConfig[name], name, source: sources[name]}
    ]))
    
    return {...widgets, ...snippets, ...themes}
  }

  /*
  private async readAnalysis(pkg: Package, path: string) {
    const relativeManifestPath = typeof pkg.customElements === "string"? pkg.customElements: undefined
    const cemPath = await this.Path.join(await this.appDir, "node_modules", ".bin", "cem")
    if(!relativeManifestPath) {
      const exports = pkg.exports ?? {}
      const widgetKeys = Object.keys(exports).filter(k => k.startsWith("./widgets/"))
      const globs = widgetKeys.map(k => `"${k}"`).join(" ")
      const webComponentLib = this.sniffWebComponentLibrary(pkg)
      const opts = [cemPath, "analyze", webComponentLib? `--${webComponentLib}`: "", `--globs ${globs}`]
      await this.pm("exec", opts, path)
    }
    const manifestPath = relativeManifestPath
      ? await this.Path.resolve(relativeManifestPath)
      : path + "custom-elements.json"
    const str = await this.FS.readFile(manifestPath, "utf8") as string
    return JSON.parse(str) as CustomElementsManifest
  }*/

  private sniffWebComponentLibrary(pkg: Package): undefined | "litelement" | "fast" | "stencil" | "catalyst" {
    const depNames = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {})
    ] 
    if(depNames.includes("lit")) {
      return "litelement"
    }
    else if(depNames.includes("@microsoft/fast-element")) {
      return "fast"
    }
    else if(depNames.includes("@stencil/core")) {
      return "stencil"
    }
    else if(depNames.includes("@github/catalyst")) {
      return "catalyst"
    }
    else {
      return undefined
    }
  }

  get installed() {
    return Object.values(this.packages).filter(pkg => pkg.installed)
  }

  get available() {
    return Object.values(this.packages).filter(pkg => !pkg.installed)
  }

  get members() {
    const members = {} as Record<string, MemberSettings>
    for(const pkg of this.packagesList) {
      members[pkg.id] = {} as any
      for(const [name, member] of Object.entries(pkg.members)) {
        const isWidget = name.startsWith("./widgets/")
        const isSnippet = name.startsWith("./snippets/")
        const isSnippetWithWidget = isSnippet && name.replace("./snippets/", "./widgets/") in members[pkg.id]
        const defaultLabel = name.replace(/\.\/\w+\//, "").split("-").slice(isSnippetWithWidget || isWidget? 1: 0).map(capitalizeWord).join(" ");
        (members as any)[pkg.id][name] = {...member, name, label: {_: defaultLabel, ...member.label}}
      }
    }
    return members
  }

  get widgets() {
    return Object.fromEntries(Object.entries(this.members).map(([k, v]) => [k, filterObject(v, vk => vk.startsWith("./widgets/"))]))
  }

  get snippets() {
    return Object.fromEntries(Object.entries(this.members).map(([k, v]) => [k, filterObject(v, vk => vk.startsWith("./snippets/"))]))
  }

  get themes() {
    return Object.fromEntries(Object.entries(this.members).map(([k, v]) => [k, filterObject(v, vk => vk.startsWith("./themes/"))]))
  }

  get allThemes() {
    const allThemes = {...themes}
    for (const [id, map] of Object.entries(this.themes)) {
      for (const [relativeName, themeSettings] of Object.entries(map)) {
        (allThemes as any)[`${id}${relativeName.slice(1)}`] = themeSettings
      }
    }
    return allThemes
  }

  get insertables() {
    return Object.fromEntries(Object.entries(merge(this.snippets, this.widgets, this.themes)).map(([k, v]) => [k, Object.values(v).filter((v: any) => !v.noDefaultSnippet)]))
  }

  get widgetTagNames() {
    return Object.entries(filterObject(this.widgets, k => this.installed.some(pkg => pkg.id === k)))
      .flatMap(([pkgID, widgetConfig]) => Object.keys(widgetConfig))
      .map(k => k.replace("./widgets/", ""))
  }

  widgetImportIDs(pkgs: Package[]) {
    return pkgs.flatMap(pkg => Object.keys(pkg.widgets ?? {}).map(k => pkg.id + k.slice(1)))
  }

  /** Toggles watching on a single named package.*/
  async toggleWatch(name: string, forceValue?: boolean) {
    const pkg = this.packages[name]
    if(!pkg) {
      return 
    }
    const watching = forceValue ?? !pkg?.watching
    if(watching && pkg?.localPath) {
      this.unwatchCallbacks[name] = await this.watch(pkg.localPath, async (e) => {
        if((e?.type?.create || e?.type?.remove) && !this.adding[pkg.id]) {
          this.loading = true
          await this.add("file:" + pkg.localPath!)
          this.load()
        }
        else {
          !this.loading && this.load()
        }
      }, {recursive: true})
    }
    else {
      (this.unwatchCallbacks[name] ?? (() => {}))()
      delete this.unwatchCallbacks[name]
    }
    this.packages = {...this.packages, [name]: pkg.extend({watching})}
  }

  /** Open the entrypoint file of the package.*/
  async open(name: string) {
    if(!(name in this.packages)) {
      throw Error(`Package ${name} not found`)
    }
    const pkg = this.packages[name]
    if(pkg.main || pkg.browser) {
      const main = pkg.main ?? pkg.browser
      const appDir = await this.Path.appDir()
      const path = await this.Path.join(appDir, "node_modules", name, main!)
      return this.Shell.open(path)
    }
    else {
      throw Error(`No main file configured for package ${name}`)
    }
  }

  /** Reads a local package directory, returning the package config. */
  async readLocal(path: string) {
    const resolvedPath = await this.Path.resolve(path)
    const pkgJsonPath = await this.Path.join(resolvedPath, "package.json")
    const exists = await this.FS.exists(pkgJsonPath)
    if(!exists) {
      throw Error("No package found under " + pkgJsonPath)
    }
    const pkgString = await this.FS.readFile(pkgJsonPath) as string
    const pkg = new Package(JSON.parse(pkgString))
    return pkg
  }

  /** Write a given package to a directory, creating files as neccessary. If `force` is false, abort if existing files are found. */
  async writeLocal(path: string, pkg: Package, {extraFiles = {} as Record<string, string>, mergePackage=false, overwrite=false, preset="none", generateLicense=false}) {
    const resolvedPath = await this.Path.resolve(path)

    let allExtraFiles = {...extraFiles}
    if(preset && preset in presets) {
      allExtraFiles = {...allExtraFiles, ...(presets as any)[String(preset)](pkg)}
    }
    if(generateLicense && String(pkg.license) in licenses) {
      allExtraFiles = {...allExtraFiles, ...(licenses as any)[String(pkg.license)](pkg)}
    }
    await Promise.all(Object.keys(allExtraFiles).map(async fileName => {
      const extraPath  = await this.Path.join(resolvedPath, fileName)
      const extraPathDir = await this.Path.dirname(extraPath)
      const extraExists = await this.FS.exists(extraPath)
      const extraDirExists = await this.FS.exists(extraPathDir)
      if(extraExists && !overwrite) {
        throw Error("Existing extra file found under " + extraPath)
      }
      if(!extraDirExists) {
        await this.FS.mkdir(extraPathDir)
      }
      return this.FS.writeFile(extraPath, allExtraFiles[fileName])
    }))
    const pkgJsonPath = await this.Path.join(resolvedPath, "package.json")
    const exists = await this.FS.exists(pkgJsonPath)
    if(exists && !mergePackage) {
      throw Error("Existing package.json file found under " + pkgJsonPath)
    }
    const existingPkg = exists? new Package(JSON.parse(await this.FS.readFile(pkgJsonPath) as string)): null
    const newPkg = existingPkg? existingPkg.extend(pkg): pkg
    await this.FS.writeFile(pkgJsonPath, JSON.stringify(newPkg, undefined, 2))
  }

  /** Uses the provided system shell to open the app directory. */
  async viewAppDir() {
    const appDir = await this.Path.appDir()
    return this.Shell.open(appDir)
  }
}