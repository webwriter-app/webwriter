import { cargoQueue } from "async"
import MiniSearch from "minisearch"

import { capitalizeWord, deepUpdate, filterObject, hashCode, mergeDeep, set, unscopePackageName } from "#utility"
import { createEditorState, createEditorStateConfig, CustomElementsManifest, EditorStateWithHead, ManifestCustomElementDeclaration, ManifestDeclaration, ManifestPropertyLike, MemberSettings, Package, SemVer, themes } from ".."
import {version as appVersion} from "../../package.json"
import { licenses, presets } from "../templates"
import { ImportMap } from "@jspm/import-map"
import { toJS } from "mobx"
import { HTMLParserSerializer } from "#model/marshal/html.js"
import scopedCustomElementRegistry from "@webcomponents/scoped-custom-element-registry/src/scoped-custom-element-registry.js?raw"
import { get } from "lodash"

type Options = {
  corePackages?: Package["name"][]
  onBundleChange?: (packages: Package[]) => void,
  watching?: Record<string, boolean>,
  initializePackages?: boolean,
  apiBase?: string
}

type Snippet = {
  id: number,
  label?: Record<string, string>,
  html: string
}

type PmQueueTask = {
  command: "install" | "add" | "remove" | "update",
  parameters: string[],
  handle?: FileSystemDirectoryHandle,
  cwd?: string,
  name?: string
}

type PackageCache = Record<string, Pick<Package, typeof Package["coreKeys"] | "members">>

export const TEST_RESULT = Symbol("TEST_RESULT")

export type TestResult = {
  [TEST_RESULT]: true
  id: string
  path: string[]
  passed: boolean
  duration?: number
  sync?: boolean
  timedOut?: boolean
}

export type TestEventData = 
  | {type: "beforeAll"}
  | {
    type: "beforeOne"
    id: string
    path: string[]
  }
  | {
    type: "afterOne"
  } & TestResult
  | {type: "afterAll"}

export type TestNode<T extends TestNode | TestResult = TestResult> = Record<string, T> | T

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


export class PackageIssue extends Error {}
export class ServiceIssue extends PackageIssue {}
export class ReadWriteIssue extends PackageIssue {}
export class InstallIssue extends PackageIssue {}
export class UninstallIssue extends PackageIssue {}
export class UpdateIssue extends PackageIssue {}
export class BundleIssue extends PackageIssue {

  stack?: string
  id?: string

  constructor(message?: string, options?: ErrorOptions & {stack?: string, id?: string}) {
    super(message, options)
    this.stack = options?.stack
    this.id = options?.id
  }

  toJSON() {
    return {id: this.id, stack: this.stack, message: this.message, cause: this.cause}
  }
}
export class WidgetNameIssue extends Error {}
export class PackageJsonIssue extends Error {}
export class Warning extends Error {}

/** Handles packages. Packages are node (npm) packages which contain widgets. The PackageStore can also create bundles from packages, which can for example be imported by the runtime editor or embedded by serializers. Additionally, the PackageStore can open or clear the app directory which stores the packages. */
export class PackageStore {

  importMap: ImportMap = new ImportMap({})
  testImportMap: ImportMap = new ImportMap({})

  resetOnInitialize = false

  static allowedOrgs = [
    "@webwriter"
  ]

  set installedPackages(value: string[]) {
    let valueUnique = Array.from(new Set(value))
    valueUnique = valueUnique.filter(a => !valueUnique.some(b => b !== a && b.startsWith("@" + a.split("@")[1])))
    localStorage.setItem("webwriter_installedPackages", JSON.stringify(valueUnique))
  }

  get installedPackages() {
    return JSON.parse(localStorage.getItem("webwriter_installedPackages") ?? "[]")
  }

  get installedPackagesAsPkg() {
    return this.installedPackages.map(id => Package.fromID(id))
  }

  static get bundleOptions()  {return [
    "--bundle",
    `--outdir=./bundlecache`,
    `--entry-names=[dir]/[name].bundle`,
    `--metafile=bundlecache/meta.json`,
    "--target=es2022",
    `--format=esm`,
    "--conditions=source",
    ...BUNDLE_LOADER_OPTIONS
  ]}

  static developmentBundleOptions = ["--sourcemap=inline"]
  static productionBundleOptions = ["--drop-labels=DEV", "--minify"]

  updateOnStartup = true

  apiBase: string

  private db: IDBOpenDBRequest | null = null

  private static isLocalImportID(id: string) {
    const match = id.match(SemVer.pattern)
    return match? (new SemVer(match[0]).prerelease[0] as any)?.includes("local"): undefined
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

  static computeBundleID(importIDs: string[], production=false, lastLoaded?: number, testRun?: number) {
    return importIDs.join(";") + (production? " !PROD": "") + (testRun !== undefined? `!TEST${testRun}`: "") + (lastLoaded? `!${lastLoaded}`: "")
  }

  /** Create a hash value to identify a bundle. The hash is deterministically computed from the packages' names and versions. This allows for caching of existing bundles. */
  static computeBundleHash(importIDs: string[], production=false, testRun?: number) {
    const ids = importIDs.map(id => id.replace(/-local\d+/, "-local"))
    const bundleID = this.computeBundleID(ids, production, undefined, testRun)
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
    this.db = indexedDB.open("webwriter", 1)
    this.db.addEventListener("upgradeneeded", this.prepareDBs)
  }

  prepareDBs(this: IDBOpenDBRequest) {
    this.result.createObjectStore("handles", {keyPath: "id"})
    this.result.createObjectStore("snippets", {keyPath: "id", autoIncrement: true})
  }

  async putLocalHandle(id: string, handle: FileSystemDirectoryHandle) {
    if(!this.db) {
      return Promise.reject("DB is not initialized")
    }
    const tx = this.db.result.transaction("handles", "readwrite")
    const store = tx.objectStore("handles")
    const done = new Promise(r => tx.addEventListener("complete", r))
    store.put({id, handle})
    return done
  }

  onBundleChange: Options["onBundleChange"]

  initialized: Promise<void>
  loading: boolean = false
  initializing: boolean = false
  resetting: boolean = false

  bundleID: string = ""

  packages: Record<string, Package> = {}
  packageIcons: Record<string, string> = {}

  adding: Record<string, boolean> = {}
  removing: Record<string, boolean> = {}
  updating: Record<string, boolean> = {}

  issues: Record<string, Error[]> & {_?: Error[]} = {}

  get changingID() {
    return [
      ...Object.keys(this.adding).filter(k => this.adding[k]).map(k => `+${k}`),
      ...Object.keys(this.removing).filter(k => this.removing[k]).map(k => `-${k}`),
      ...Object.keys(this.updating).filter(k => this.updating[k]).map(k => `^${k}`),
    ].join(" ")
  }

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

  get importingId() {
    return Object.keys(this.adding).find(id => this.adding[id] && !(id in this.packages))
  }

  searchIndex = new MiniSearch<Package>({
    fields: ["id", "name", "description", "version", "keywords"],
    extractField: (doc, fieldName) => (fieldName === "keywords"? doc?.keywords?.join(", "): String(doc[fieldName as keyof typeof doc])) ?? "",
    idField: "id"
  })

  searchPackages(query: string) {
    return this.searchIndex.search(query, {boost: {id: 5, name: 4, keywords: 3, version: 2, description: 1}, prefix: true, fuzzy: 1})
  }

  async updateImportMap(ids: string[]=this.installedPackages, test=false, forcePkg=false) {
    const url = new URL("_importmaps", this.apiBase);
    (!test || forcePkg) && url.searchParams.append("pkg", "true")
    ids.forEach(id => url.searchParams.append("id", test? id + ".js": id))
    const map = ids.length? await (await fetch(url)).json(): undefined
    if(test) {
      this.testImportMap = new ImportMap({map})
    }
    else {
      this.importMap = new ImportMap({map})
      this.installedPackages = ids
    }
  }

  async checkForMissingMembers(pkgs: Package[]) {
    const ids = pkgs.map(pkg => pkg.id)
    let settings = Object.fromEntries(ids.map(id => [id, this.getPackageMembers(id)]))
    const membersToCheck = ids
      .flatMap(id => Object.values(settings[id]).map(v => [id, v] as [string, MemberSettings]))
      .flatMap(([id, v]) => v.url?.endsWith(".*")? [[id, {...v, url: v.url?.slice(0, -2) + ".js"}], [id, {...v, url: v.url?.slice(0, -2) + ".css"}]]: [[id, v]])
      .filter(([id, v]) => pkgs.find(pkg => pkg.id === id)?.localPath || !(v as MemberSettings).name.startsWith("./tests/")) as [string, MemberSettings][]
    return Promise.all(membersToCheck.map(async ([id, settings]) => {
      try {
        const result = await fetch(settings.url!)
        if(!result.ok) throw Error("Failed to fetch")
      } catch(err) {
        const pkgId = id.split("/").slice(0, 2).join("/")
        if(settings.name.split("/")[1] === "widgets" && settings.url?.endsWith(".css")) {
          return
        }
        else {
          const issue = new BundleIssue(`Missing bundle file expected at '${settings.url?.slice(this.apiBase.length)}'. Did you create an importable bundle, for example with 'npx @webwriter/build dev'? https://webwriter.app/docs/quickstart/`)
          this.appendPackageIssues(pkgId, issue)
        }
      }
    }))
  }

  async processTasks(tasks: PmQueueTask[]) {
    const toAdd = tasks.filter(t => t.command === "add" && !t.name && !t.handle).flatMap(t => t.parameters)
    const toAddLocal = tasks.filter(t => t.command === "add" && t.handle).flatMap(t => ({handle: t.handle!, name: t.name}))
    const toRemove = tasks.filter(t => t.command === "remove").flatMap(t => t.parameters)
    const toUpdate = tasks.filter(t => t.command === "update").flatMap(t => t.parameters)
    try {
      if(toRemove.length > 0) {
        try {
          this.installedPackages = this.installedPackages.filter(id => !toRemove.includes(id))
        }
        catch(err) {
          console.error(err)
        }
      }
      if(toAdd.length > 0) {
        try {
          this.installedPackages = [...this.installedPackages, ...toAdd]
        }
        catch(err) {
          console.error(err)
        }
      }
      if(toAddLocal.length > 0) {
        try {
          const pkgs = await Promise.all(toAddLocal.map(async ({handle, name}) => {
            const pkgHandle = await handle.getFileHandle("package.json")
            const file = await pkgHandle.getFile()
            const text = await file.text()
            const pkg = new Package({...JSON.parse(text)})
            pkg.version.prerelease = [...pkg.version.prerelease, "local"]
            await this.putLocalHandle(pkg.name, handle)
            return pkg
          }))
          this.installedPackages = [...this.installedPackages, ...pkgs.map(pkg => pkg.id)]
        }
        catch(err) {
          if(err instanceof Error && err.name === "NotFoundError") {
            console.error("No package.json found in selected directory", {cause: err})
            return
          }
          console.error(err)
        }
      }
      if(toUpdate.length > 0) {
        try {
          const latestIDs = toUpdate
            .map(id => Package.fromID(id))
            .map(pkg => this.installed.find(ipkg => ipkg.name === pkg.name))
            .filter(pkg => pkg?.latest)
            .map(pkg => `${pkg!.name}@${pkg!.latest}`)
          this.installedPackages = [...this.installedPackages.filter(id => !toUpdate.includes(id)), ...latestIDs]
        }
        catch(err) {
          console.error(err)
        }
      }
    }
    finally {
      await this.load()
      this.removing = {...this.removing, ...Object.fromEntries(toRemove.map(name => [name, false]))}
      this.adding = {...this.adding, ...Object.fromEntries([...toAdd.map(name => [name, false]), ...toAddLocal.map(({name}) => [name + "-local", false])])}
      this.updating = {...this.updating, ...Object.fromEntries(toUpdate.map(name => [name, false]))}
    }
  }

  get pmQueue() {
    return cargoQueue(this.processTasks)
  }

  private unwatchCallbacks: Record<string, CallableFunction> = {}

  get watching() {
    return Object.fromEntries(Object.entries(this.unwatchCallbacks).filter(([k, v]) => !!v).map(([k, v]) => [k, !!v]))
  }

  set watching(value: Record<string, boolean>) {
    for (const [name, watching] of Object.entries(value)) {
      if(watching !== this.watching[name]) {
        this.toggleWatch(name, watching)
      }
    }
  }

  get widgetNames() {
    return Object.keys(this.packages).map(name => unscopePackageName(name))
  }

  get widgetPackageMap(): Record<string, Package> {
    return Object.fromEntries(Object.keys(this.packages).map(name => [unscopePackageName(name), this.packages[name]]))
  }

  hasReset = false
  
  async initialize(): Promise<void> {
    try {
      return this.load()
    }
    catch(err) {
      console.error(err)
      if(!this.hasReset) {
        await this.reset()
        return this.initialize()
      }
    }
  }

  async reset() {
    this.hasReset = true
    localStorage.clear()
    sessionStorage.clear()
    
    const cacheKeys = await caches.keys()
    await Promise.all(cacheKeys.map(key => caches.delete(key)))

    const db = indexedDB.open("webwriter", 1)
    await new Promise(r => db.addEventListener("success", r))
    if(db.result.objectStoreNames.contains("handles")) {
      const tx = db.result.transaction("handles", "readwrite")
      const store = tx.objectStore("handles")
      store.clear()
    }
    if(db.result.objectStoreNames.contains("snippets")) {
      const tx = db.result.transaction("snippets", "readwrite")
      const store = tx.objectStore("snippets")
      store.clear()
    }
    db.result.close()

    /*await new Promise((resolve, reject) => {
      const req = indexedDB?.deleteDatabase("webwriter")
      req.addEventListener("success", resolve)
      req.addEventListener("error", reject)
      req.addEventListener("blocked", reject)
    })*/
  }

  async add(urlOrHandle: string | FileSystemDirectoryHandle, name?: string) {
    const id = typeof urlOrHandle === "string"? urlOrHandle: name!
    let pkg = Package.fromID(id)
    if(typeof urlOrHandle !== "string") {
      const version = pkg.version
      version.prerelease = [...version.prerelease, "local"]
      pkg = new Package({...pkg, version})
    }
    const matchingPkg = this.installed.find(match => pkg.name === match.name)
    if(matchingPkg) {
      const cancelled = !confirm(`Installing ${pkg.id} requires uninstalling ${matchingPkg.id}. Do you want to continue?`)
      if(cancelled) {
        return
      }
      else {
        await new Promise(async r => this.pmQueue.push({command: "remove", parameters: [matchingPkg.id], name: matchingPkg.id}, r))
      }
    }

    if(typeof urlOrHandle === "string") {
      const url = urlOrHandle
      this.adding = {...this.adding, [pkg.id ?? url]: true}
      return this.pmQueue.push({command: "add", parameters: [url], name})
    }
    else {
      const handle = urlOrHandle
      this.adding = {...this.adding, [pkg.id ?? handle.name]: true}
      return this.pmQueue.push({command: "add", parameters: [], handle, name})
    }
  }

  async remove(name: string) {
    this.removing = {...this.removing, [name]: true}
    return this.pmQueue.push({command: "remove", parameters: [name]})
  }

  async update(name: string) {
    this.updating = name
      ? {...this.updating, [name]: true}
      : Object.fromEntries(this.packagesList.filter(pkg => pkg.installed).map(pkg => [pkg.id, true]))
    return this.pmQueue.push({command: "update", parameters: [name]})
  }

  get packagesList() {
    return Object.values(this.packages)
  }

  get filteredPackages() {
    return this.packagesList.filter(pkg => pkg.localPath || (!pkg.version.lt("1.0.0") || this.showUnstable) && (pkg.trusted || this.showUnknown) || pkg.version.prerelease.includes("snippet"))
  }

  lastLoaded: number = 0
  testRun: number = 0
  showUnstable: boolean = false
  showUnknown: boolean = false

  /** Reads local packages from disk, importing them, and/or fetches available packages from the configured registry.*/
  async load() {
    await 0;
    this.lastLoaded = Date.now()
    this.loading = true
    this.issues = {}
    
    let available = await this.fetchPackages()
    let installed = !this.installedPackages.length? []: (await this.fetchPackages(true)).map(pkg => pkg.extend({installed: true, latest: available.find(apkg => pkg.name === apkg.name)?.version})).filter(pkg => !pkg.version.prerelease.includes("local"))
    let final: Package[] = []
    const localIds = this.installedPackages.filter(id => Package.fromID(id).version.prerelease.includes("local"))
    let local = (await Promise.all(localIds.map(id => fetch(new URL(id + "/package.json", this.apiBase)).then(resp => resp.json()))))
      .map(json => {
        const version = new SemVer(json.version)
        version.prerelease = [...version.prerelease, "local"]
        return new Package({...json, version}, {installed: true, localPath: "hidden"})
      })
    local = await Promise.all(local
      .map(async pkg => pkg.extend({editingConfig: await this.readEditingConfig(pkg)}))
      .map(async pkg => (await pkg).extend({members: await this.readPackageMembers(await pkg)}))
    )
    available = available.filter(pkg => !installed.some(ipkg => ipkg.name === pkg.name) && !local.some(lpkg => lpkg.name === pkg.name))
    await this.updateLocalWatchIntervals(local)
    // available.map(pkg => pkg.extend({installed: !!this.installedPackagesAsPkg.find(ipkg => ipkg.name === pkg.name && !ipkg.version.prerelease.includes("local")), ...this.installedPackagesAsPkg.find(ipkg => ipkg.name === pkg.name && !ipkg.version.prerelease.includes("local"))? {version:  this.installedPackagesAsPkg.find(ipkg => ipkg.name === pkg.name && !ipkg.version.prerelease.includes("local"))!.version}: undefined, latest: pkg.version}))
    const snippetData = await this.getSnippet(undefined)
    const snippets = snippetData.map(({id, label, html}) => new Package({
      name: `snippet-${id}`,
      version: "0.0.0-snippet",
      private: true,
      html,
      editingConfig: {".": {label}}
    })).reverse()
    final = [...snippets, ...local, ...installed, ...available]
    await this.updateImportMap()
    this.bundleID = PackageStore.computeBundleID(this.installedPackages, false, final.some(pkg => pkg.localPath)? this.lastLoaded: undefined);
    (this.onBundleChange ?? (() => null))(final.filter(pkg => pkg.installed))
    this.packages = Object.fromEntries(final.map(pkg => [pkg.id, pkg]))
    await Promise.all(final.map(async pkg => [pkg.id, await this.getIconDataUrl(pkg.id)])).then(result => this.packageIcons = Object.fromEntries(result))
    await this.checkForMissingMembers(this.installed)
    this.searchIndex.removeAll()
    this.searchIndex.addAll(final)
    this.loading = false
  }

  get bundleJSURL() {
    const url = new URL("_bundles", this.apiBase)
    this.installed.forEach(pkg => url.searchParams.append("id", pkg.id))
    url.searchParams.append("pkg", "true")
    return url
  }

  get bundleCSSURL() {
    const url = new URL("_bundles", this.apiBase)
    this.installed.forEach(pkg => url.searchParams.append("id", pkg.id))
    url.searchParams.append("type", "css")
    url.searchParams.append("pkg", "true")
    return url
  }

  private async fetchPackages(installedOnly=false) {
    let rawPkgs: any[] = []
    let url = new URL("_packages", this.apiBase)
    if(installedOnly) {
      this.installedPackages.forEach(id => url.searchParams.append("id", id))
    }
    const resp = await fetch(url)
    if(resp.ok) {
      rawPkgs = await resp.json()
    }
    const editingConfigs = await Promise.all(rawPkgs.map(async pkg => this.readEditingConfig(pkg)))
    const members = await Promise.all(rawPkgs.map(async (pkg, i) => this.readPackageMembers({...pkg, editingConfig: editingConfigs[i]})))
    return rawPkgs.map((pkg, i) => {
      const trusted = PackageStore.allowedOrgs.some(org => pkg.name.startsWith(`${org}/`))
      try {
        return new Package({...pkg, editingConfig: editingConfigs[i]}, {members: members[i], trusted})
      }
      catch(err) {
        const parseIssues = JSON.parse((err as any)?.message)
        const errors = parseIssues.map((raw: any) => {
          let issueSection = pkg
          let key = undefined
          for(const part of raw.path) {
            key = part
            issueSection = issueSection[part]
          }
          const cause = (key? `"${key}": `: "") + JSON.stringify(issueSection, undefined, 2)
          const issue = new InstallIssue(raw.message, {cause})
          issue.stack = undefined
          return issue
        })
        this.appendPackageIssues(`${pkg.name}@${pkg.version}`, ...errors)
        return new Package({name: pkg.name, version: pkg.version}, {trusted})
      }
    }).filter(pkg => pkg)
  }

  private async validateInstalled(pkgs: Package[]) {
    // Warn for packages without exports
    // Warn for packages that register extra custom elements
  }

  private async readEditingConfig(pkg: Package): Promise<Package["editingConfig"]> {
    let _pkg = new Package(pkg)
    const exports = _pkg.exports ?? {}
    let externalEditingConfig
    if("./editing-config.json" in exports) {
      try {
        const resp = await fetch(new URL(_pkg.id + exports["./editing-config.json"].slice(1), this.apiBase))
        externalEditingConfig = JSON.parse(await resp.text())
      }
      catch(err) {
        console.error(`Error reading external editing config: ${(err as Error).message}`)
      }
    }
    return mergeDeep(externalEditingConfig ?? {}, pkg?.editingConfig ?? {})
  }

  private async readPackageMembers(pkg: Package) {
    let _pkg = new Package(pkg)
    const exports = _pkg.exports ?? {}

    const members = {} as Record<string, MemberSettings>
    for(const [rawName, p] of Object.entries(exports)) {
      const path = (p as any)?.default ?? p
      const name = rawName.replace(/(\.html|\.\*|\.css)$/g, "")
      const isWidget = name.split("/").at(-2) === "widgets"
      const isSnippet = name.split("/").at(-2) === "snippets"
      const isTheme = name.split("/").at(-2) === "themes"
      const isTest = name.split("/").at(-2) === "tests"
      if(isWidget || isSnippet || isTheme || isTest) {
        const memberSettings = pkg.editingConfig?.[name]
        let source: string | undefined
        members[name] = {name, path, legacy: isWidget && !rawName.endsWith(".*"), ...memberSettings, ...(source? {source}: undefined)}
      }
    }
    return members
  }

  get installed() {
    return Object.values(this.packages).filter(pkg => pkg.installed)
  }

  get available() {
    return Object.values(this.packages).filter(pkg => !pkg.installed)
  }

  get local() {
    return Object.values(this.packages).filter(pkg => pkg.localPath)
  }

  get localSnippets() {
    return Object.values(this.packages).filter(pkg => pkg.isSnippet)
  }

  getPackageMembers(id: string, filter?: "widgets" | "snippets" | "themes" | "tests") {
    const pkg = this.packages[id]
    const members = {} as any
    for(const [memberName, member] of Object.entries(pkg?.members ?? {})) {
      const is = {
        widgets: memberName.startsWith("./widgets/"),
        snippets: memberName.startsWith("./snippets/"),
        themes: memberName.startsWith("./themes/"),
        tests: memberName.startsWith("./tests/")
      }
      const defaultLabel = memberName.replace(/\.\/\w+\//, "").split("-").slice(is.widgets? 1: 0).map(capitalizeWord).join(" ");
      const url = `${this.apiBase}${id}${member.path.slice(1)}`
      if(!filter || is[filter]) {
        members[memberName] = {...member, name: memberName, url, label: {_: defaultLabel, ...member.label}}
      }
    }
    return members as Record<string, MemberSettings>
  }

  get tests() {
    return Object.fromEntries(Object.keys(this.packages).map(id => [id, this.getPackageMembers(id, "tests")]))
  }

  get widgets() {
    return Object.fromEntries(Object.keys(this.packages).map(id => [id, this.getPackageMembers(id, "widgets")]))
    // return Object.fromEntries(Object.entries(this.members).map(([k, v]) => [k, filterObject(v, vk => vk.startsWith("./widgets/"))]))
  }

  get snippets() {
    return Object.fromEntries(Object.keys(this.packages).map(id => [id, this.getPackageMembers(id, "snippets")]))
    // return Object.fromEntries(Object.entries(this.members).map(([k, v]) => [k, filterObject(v, vk => vk.startsWith("./snippets/"))]))
  }

  get themes() {
    return Object.fromEntries(Object.keys(this.packages).map(id => [id, this.getPackageMembers(id, "themes")]))
    // return Object.fromEntries(Object.entries(this.members).map(([k, v]) => [k, filterObject(v, vk => vk.startsWith("./themes/"))]))
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

  get installedWidgetUrls() {
    return this.apiBase? this.installed.flatMap(pkg => Object.keys(pkg?.widgets ?? {}).flatMap(k => new URL(pkg.id + k.slice(1), this.apiBase).href)): []
  }

  get widgetTagNames() {
    return Object.entries(filterObject(this.widgets, k => this.installed.some(pkg => pkg.id === k)))
      .flatMap(([pkgID, widgetConfig]) => Object.keys(widgetConfig))
      .map(k => k.replace("./widgets/", ""))
  }

  widgetImportIDs(pkgs: Package[]) {
    return pkgs.flatMap(pkg => {
      const widgets = pkg?.widgets ?? {}
      return Object.keys(widgets).map(k => pkg.id + k.slice(1) + ".js")
    })
  }

  /** Toggles watching on a single named package.*/
  async toggleWatch(name: string, forceValue?: boolean) {
    await this.initialized
    if(this.apiBase) {
      return
    }
    const pkg = this.packages[name]
    if(!pkg) {
      return 
    }
    const watching = forceValue ?? !pkg?.watching;
    (this.unwatchCallbacks[name] ?? (() => {}))()
    delete this.unwatchCallbacks[name]
    this.packages = {...this.packages, [name]: pkg.extend({watching})}
  }

  async resolveRelativeLocalPath(path: string, handle: FileSystemDirectoryHandle) {
    const parts = path.split("/").slice(1)
    let directory = handle
    let file: File
    for(const [i, part] of parts.entries()) {
      if(i === parts.length - 1) {
        const fileHandle = await directory.getFileHandle(part)
        file = await fileHandle.getFile()
      }
      else {
        directory = await directory.getDirectoryHandle(part)
      }
    }
    return file!
  }

  async getLocalHandle(id: string): Promise<FileSystemDirectoryHandle> {
    const db = indexedDB.open("webwriter", 1)
    await new Promise(r => db.addEventListener("success", r))
    const tx = db.result.transaction("handles", "readwrite")
    const store = tx.objectStore("handles")
    const req = store.get(id)
    return new Promise(r => req.addEventListener("success", async () => {
      db.result.close()
      r(req.result.handle)
    }))
  }

  /** Reads a local package directory, returning the package config. */
  async readLocal(handle: FileSystemDirectoryHandle) {
    let pkgString: string
    let pkgJsonHandle
    try {
      pkgJsonHandle = await handle.getFileHandle("package.json")
    }
    catch(err) {
      throw Error("No package found under " + handle.name)
    }
    const file = await pkgJsonHandle.getFile()
    pkgString = await file.text()
    let pkg
    try {
      pkg = new Package(JSON.parse(pkgString!))
    }
    catch(cause) {
      throw new PackageJsonIssue(`Error parsing package.json: ${cause}`, {cause})
    }
    return pkg
  }

  watchLocalIntervals: Record<string, number> = {}

  async updateLocalWatchIntervals(pkgs: Package[], ms=250) {
    // Each interval, poll package.json AND all exports (including pairs of .js & .css):
    //   If any file is newer than the last load time, trigger a reload (unless we are already reloading)
    const oldNames = Object.keys(this.watchLocalIntervals)
    const newNames = pkgs.map(pkg => pkg.name)
    const toRemove = oldNames.filter(name => !newNames.includes(name))
    const toAdd = newNames.filter(id => !oldNames.includes(id))
    for(const name of toRemove) {
      clearInterval(this.watchLocalIntervals[name])
    }
    for(const name of toAdd) {
      const handle = await this.getLocalHandle(name)
      this.watchLocalIntervals[name] = setInterval(async () => {
        const pkgJsonFile = await (await handle.getFileHandle("package.json")).getFile()
        if(pkgJsonFile.lastModified >= this.lastLoaded) {
          return this.load()
        } 
        let pkgString = await pkgJsonFile.text()
        let pkg
        try {
          pkg = new Package(JSON.parse(pkgString!))
        }
        catch(cause) {
          return
        }
        const exports = pkg?.exports
        const exportPaths = Object.keys(exports as any)
          .filter(k => k.startsWith("./widgets/") || k.startsWith("./snippets/") || k.startsWith("./themes/") || k.startsWith("./tests/"))
          .map(k => typeof (exports as any)[k] !== "string"? (exports as any)[k]?.default as string: (exports as any)[k] as string)
          .flatMap(k => !k.endsWith(".*")? [k]: [k.slice(0, -2) + ".js", ...(k.startsWith("./tests/")? []: [k.slice(0, -2) + ".css"])])
        const exportedFiles = (await Promise.all(exportPaths.map(async path => {
          try {
            return await this.resolveRelativeLocalPath(path, handle)
          }
          catch {
            return null
          }

        }))).filter(file => file)
        if(exportedFiles.some(file => file!.lastModified >= this.lastLoaded)) {
          await this.load()
          if(this.testPkg === pkg.id + "-local") {
            await this.loadTestEnvironment(this.testPkg, false)
          } 
          if(this.testRunOnReload && this.testPkg === pkg.id + "-local") {
            this.resetTests()
            await this.runTest()
          }
        }
  
      }, ms) as unknown as number
    }
  }

  /** Write a given package to a directory, creating files as neccessary. If `force` is false, abort if existing files are found. */
  async writeLocal(handle: FileSystemDirectoryHandle, pkg: Package, {extraFiles = {} as Record<string, string>, mergePackage=false, overwrite=false, preset="none", generateLicense=false}) {
    let allExtraFiles = {...extraFiles}
    if(preset && preset in presets) {
      allExtraFiles = {...allExtraFiles, ...(presets as any)[String(preset)](pkg)}
    }
    if(generateLicense && String(pkg.license) in licenses) {
      allExtraFiles = {...allExtraFiles, ...(licenses as any)[String(pkg.license)](pkg)}
    }
    const root = handle
    await Promise.all(Object.keys(allExtraFiles).map(async path => {
      return writeFile(root, path, allExtraFiles[path], true, overwrite)
    }))
    const existingPkgFile = await readFile(root, "package.json")
    if(existingPkgFile && !mergePackage) {
      throw Error(`Existing package.json file found in '${root.name}'`)
    }
    const existingPkg = existingPkgFile? new Package(JSON.parse(await existingPkgFile.text())): null
    const newPkg = existingPkg? existingPkg.extend(pkg): pkg
    await writeFile(root, "package.json", JSON.stringify(newPkg, undefined, 4), true, true)
    await this.add(root, newPkg.id)
  }

  async getSnippet<T extends string | undefined>(id?: T) {
    const url = new URL(id? `_snippets/${id}`: "_snippets", this.apiBase)
    const response = await fetch(url)
    return response.json() as Promise<T extends undefined? Snippet[]: Snippet>
  }

  async addSnippet(snippet: Snippet) {
    const url = new URL("_snippets", this.apiBase)
    const resp = await fetch(url, {body: new Blob([JSON.stringify(snippet)]), method: "POST"})
    return this.load()
  }

  async putSnippet(id: string, snippet: Snippet) {
    const url = new URL(`_snippets/${id}`, this.apiBase)
    await fetch(url, {body: new Blob([JSON.stringify(snippet)]), method: "PUT"})
    return this.load()
  }

  async removeSnippet(id: string) {
    const url = new URL(`_snippets/${id}`, this.apiBase)
    await fetch(url, {method: "DELETE"})
    return this.load()
  }

  getIconUrl(id: string) {
    const iconPath = this.packages[id].iconPath
    return !iconPath? undefined: new URL(`${id}${iconPath.slice(1)}`, this.apiBase)
  }

  async getIconDataUrl(id: string) {
    const url = this.getIconUrl(id)
    if(!url) {
      return undefined
    }
    try {
      const reader = new FileReader()
      const response = await fetch(url)
      const result = new Promise(r => reader.addEventListener("load", () => r(reader.result)))
      reader.readAsDataURL(await response.blob())
      return result
    }
    catch {
      return undefined
    }
  }

  createTestState(ids: string[]) {
    const pkgs = ids.map(id => this.packages[id])
    return createEditorState(createEditorStateConfig(pkgs))
  }

  testStatus: Record<string, "disabled" | "idle" | "pending" | "preparing" | Record<string, TestResult>> = {}
  testLoading = false
  testState?: EditorStateWithHead
  testBundleID?: string
  activeTest?: string
  testRunOnReload = false

  getTestTree(id: string) {
    const data = this.testStatus[id]
    if(typeof data === "string") {
      return undefined
    }
    else {
      const tree = {} as any
      for(const key of Object.keys(data)) {
        const result = data[key]
        const flatResult = {...result} as any as Omit<TestResult, "path"> & {title: string}
        delete (flatResult as any).path
        flatResult.title = result.path.at(-1)!
        set(tree, result.path, flatResult)
      }
      return tree
    }
  }

  processTestUpdate(data: TestEventData, runNext=true) {
    if(data.type === "beforeAll") {
      this.testStatus = {
        ...this.testStatus,
        [this.activeTest!]: "preparing"
      }
    }
    else if(data.type === "beforeOne" || data.type === "afterOne") {
      const next = {
        ...(typeof this.testStatus[this.activeTest!] === "string"? {}: this.testStatus[this.activeTest!] as any),
        [data.id]: {[TEST_RESULT]: true, ...data}
      }
      delete next[data.id].type
      this.testStatus = {
        ...this.testStatus,
        [this.activeTest!]: next
      }
    }
    else if(data.type === "afterAll" && runNext && this.nextTestId) {
      this.runTest(this.nextTestId)
    }
  }

  set testPkg(value: string | undefined) {
    if(value) {
      const testIDs = Object.values(this.getPackageMembers(value, "tests")).map(test => value + test.name.slice(1))
      this.testState = this.createTestState([value])
      this.testStatus = Object.fromEntries(testIDs.map(id => [id, "idle"]))
    }
    else {
      this.testBundleID = undefined
    }
  }

  async loadTestEnvironment(value?: string, createState=true) {
    this.testLoading = true
    let id = value ?? this.local.at(0)?.id
    if(id) {
      const testIDs = Object.values(this.getPackageMembers(id, "tests")).map(test => id + test.name.slice(1))
      this.testStatus = Object.fromEntries(testIDs.map(id => [id, "idle"]))
      if(createState) {
        this.testState = this.createTestState([id])
      }
      await this.updateImportMap(undefined, true, true)
      this.testBundleID = PackageStore.computeBundleID(this.installed.map(pkg => pkg.id), false, this.lastLoaded, this.testRun)
    }
    this.testLoading = false
  }

  get nextTestId() {
    return Object.keys(this.testStatus).find(k => this.testStatus[k] === "idle")
  }

  get testPkg() {
    return Object.keys(this.testStatus)[0]?.split("/").slice(0, 2).join("/")
  }

  get testRunning() {
    return Object.keys(this.testStatus).some(k => typeof k !== "string" || k === "pending" || k === "preparing")
  }

  get testingDisabled() {
    return this.testRunning || Object.values(this.testStatus).every(v => v === "disabled")
  }

  get testData() {
    return Object.fromEntries(Object.keys(this.testStatus).map(id => {
      const pkgId = id.split("/").slice(0, 2).join("/")
      const testId = "./" + id.split("/").slice(2).join("/")
      return [id, this.tests[pkgId][testId]]
    }))
  }

  setTestState(state: EditorStateWithHead) {
    this.testState = state
  }

  toggleTestDisabled(id: string) {
    const current = this.testStatus[id]
    this.testStatus = {
      ...this.testStatus,
      [id]: current === "disabled"? "idle": "disabled"
    }
  }

  resetTests() {
    const testStatus = {...this.testStatus}
    for(const k of Object.keys(testStatus)) {
      testStatus[k] = typeof testStatus[k] !== "string" || testStatus[k] === "pending" || testStatus[k] === "preparing"? "idle": testStatus[k] 
    }
    this.testStatus = testStatus
  }

  async runTest(id: string | undefined = this.nextTestId) {
    if(!id) {
      return
    }
    this.activeTest = id
    this.testStatus[id] = "pending"
    // prepare test
    const pkgId = id.split("/").slice(0, 2).join("/")
    this.testState = this.createTestState([pkgId])
    await this.updateImportMap([id], true)
    // trigger execution
    this.testBundleID = PackageStore.computeBundleID([id], false, this.lastLoaded, this.testRun)
    this.testRun++
  }

  async stopTests() {
    this.testRun++
  }
  
}

async function writeFile(root: FileSystemDirectoryHandle, path: string, content: string | Blob | BufferSource, ensurePath=false, overwrite=false) {
  const pathParts = path.split("/")
  let directory = root
  for(const [i, part] of pathParts.entries()) {
    if(i === pathParts.length - 1) {
      let fileHandle
      try {
        fileHandle = await directory.getFileHandle(part)
      } catch {}
      if(fileHandle && !overwrite) {
        throw Error("Found existing file, and 'overwrite' is false")
      }
      else {
        fileHandle = await directory.getFileHandle(part, {create: true})
        const writable = await fileHandle.createWritable()
        await writable.write(content)
        await writable.close()
      }
    }
    else {
      directory = await directory.getDirectoryHandle(part, {create: ensurePath})
    }
  }
}

async function readFile(root: FileSystemDirectoryHandle, path: string) {
  const pathParts = path.split("/")
  let directory = root
  for(const [i, part] of pathParts.entries()) {
    if(i === pathParts.length - 1) {
      try {
        const fileHandle = await directory.getFileHandle(part)
        return fileHandle.getFile()
      }
      catch(err) {
        return null
      }
    }
    else {
      try {
        directory = await directory.getDirectoryHandle(part)
      }
      catch(err) {
        return null
      }
    }
  }
  return null
}