import { hashCode, unscopePackageName, arrayReplaceAt } from "../../utility"
import { Environment, WatchEvent } from "../environment"
import { Package } from ".."

import {version as appVersion} from "../../package.json"
import { toJS } from "mobx"

type ProcessingEntry = {
  key: string
  args: any[]
  promise?: Promise<any>
  done?: boolean
}

interface StoreActionOptions {
  onPending?: (key: string, args: any[]) => void
  onDone?: (key: string, args: any[], error?: Error) => void
  queueKey?: string
}

export function storeAction({onPending, onDone, queueKey}: StoreActionOptions) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    const func = descriptor.value
    descriptor.value = async function(...args: any[]) {
      onPending?.apply(this, [key, args])
      let value: any
      let entry: ProcessingEntry | undefined
      let i: number | undefined
      try {
        if(queueKey && queueKey in this) {
          const store = this as PropertyDescriptor & Record<any, ProcessingEntry[]>
          entry = {key, args}
          i = store[queueKey].length
          store[queueKey] = [...store[queueKey], entry]
          await Promise.allSettled(store[queueKey].map(entry => entry.promise))
          const promise = func.apply(this, args)
          store[queueKey] = arrayReplaceAt(store[queueKey], i, {...entry, promise})
          value = await promise
          store[queueKey] = arrayReplaceAt(store[queueKey], i, {...entry, done: true})
        }
        else {
          value = await func.apply(this, args)
        }
        onDone?.apply(this, [key, args])
        return value
      }
      catch(error: any) {
        onDone?.apply(this, [key, args, error])
        if(queueKey && queueKey in this && entry && i) {
          const store = this as PropertyDescriptor & Record<any, ProcessingEntry[]>
          store[queueKey] = arrayReplaceAt(store[queueKey], i, {...entry, done: true})
        }
        throw error
      }
    }
    return descriptor
  }
}

type Options = {
  corePackages?: Package["name"][]
  onImport?: (packages: Package[]) => void
} & Environment

type PackageOptions = {installed?: boolean, outdated?: boolean, root?: string, imported?: boolean, localPath?: string, reloadCount?: number, importError?: string, watching?: boolean, jsSize?: number, cssSize?: number}

export type PackageWithOptions = Package & PackageOptions

/** Handles packages. Packages are node (npm) packages which contain widgets. The PackageStore can also create bundles from packages, which can for example be imported by the runtime editor or embedded by serializers. Additionally, the PackageStore can open or clear the app directory which stores the packages. */
export class PackageStore {

  /** Converts a H5P library object (library.json) into a node package (package.json), including the raw library data under the key "h5pLibrary". */
  static H5PtoPackageJson(name: string, library: Record<string, any>): Package {
    return {
      name,
      version: `${library["majorVersion"]}.${library["minorVersion"]}.${library["patchVersion"]}`,
      description: library["description"],
      license: library["license"],
      author: library["author"],
      keywords: ["webwriter-h5p", "webwriter-widget"], // @ts-ignore: Fix schema
      h5pLibrary: {...library}
    }
  }

  /** Create a hash value to identify a bundle. The hash is deterministically computed from the packages' names and versions. This allows for caching of existing bundles. */
  static computeBundleHash(packages: PackageWithOptions[], editMode: boolean = false) {
    const bundleID = this.computeBundleID(packages, editMode)
    return hashCode(bundleID).toString(36)
  }

  static computeBundleID(packages: PackageWithOptions[], editMode: boolean = false) {
    const packageVersions = packages.map(pkg => `${pkg.name}@${pkg.version}-${pkg.reloadCount}`)
    return packageVersions.join("~") + (editMode? "!edit": "")
  }

  isPackageImported(name: string) {
    return this.bundleID.replace("!edit", "").split("~").includes(name)
  }

  _pending: ProcessingEntry[] = []
  get pending() {return this._pending}
  set pending(value) {this._pending = value}

  initialized: Promise<void>

  fetching: boolean = false
  initializing: boolean = false
  resetting: boolean = false

  _watching: Record<Package["name"], Function> = {}
  _imported: Record<Package["name"], boolean> = {}

  _packages: Record<string, PackageWithOptions> = {}
  corePackages: Package["name"][] = []
  bundleCode: string = ""
  bundleCSS: string = ""
  bundleID: string = ""

  importError: Record<string, string> = {}

  onImport: Options["onImport"]

  FS: Environment["FS"]
  Path: Environment["Path"]
  Shell: Environment["Shell"]
  OS: Environment["OS"]
  Dialog: Environment["Dialog"]
  bundle: Environment["bundle"]
  search: Environment["search"]
  pm: Environment["pm"]
  watch: Environment["watch"]

  constructor(options: Options) {
    Object.assign(this, options)
    this.initialized = this.initialize()
  }

  get allPending() {
    return Promise.allSettled(this.pending.map(entry => entry.promise))
  }

  get adding() {
    return this.pending
      .flatMap(entry => entry.key === "add" && !entry.done? entry.args[0]: [])
      .filter(arg => !arg?.startsWith("-"))
  }

  get upgrading() {
    return this.pending
      .flatMap(entry => entry.key === "upgrade" && !entry.done? entry.args[0]: [])
      .filter(arg => !arg?.startsWith("-"))
  }

  get removing() {
    return this.pending
      .flatMap(entry => entry.key === "remove" && !entry.done? entry.args[0]: [])
      .filter(arg => !arg?.startsWith("-"))
  }

  private _reloadCounts: Record<Package["name"], number> = {}

  private _cachedPackages: PackageWithOptions[] = []

  get packages(): PackageWithOptions[] {
    const cached = this._cachedPackages
    const pkgs = Object.values(this._packages).map(pkg => ({
      ...pkg,
      importError: this.importError[pkg.name],
      watching: Boolean(this.watching[pkg.name])
    }))

    const isPkgsInCached = pkgs.every(pkg => cached.find(cpkg => JSON.stringify(cpkg) === JSON.stringify(pkg)))
    const isCachedInPkgs = cached.every(cpkg => cached.find(pkg => JSON.stringify(cpkg) === JSON.stringify(pkg)))
    if(isPkgsInCached && isCachedInPkgs) {
      return this._cachedPackages
    }
    else {
      this._cachedPackages = pkgs
      return pkgs
    }
  }

  set packages(value: PackageWithOptions[] | Record<string, PackageWithOptions>) {
    const pkgs = Array.isArray(value)
      ? Object.fromEntries(value.map(x => [x.name, x]))
      : value
    this._packages = pkgs

  }

  get watching() {
    return Object.fromEntries(Object.entries(this._watching).map(([k, v]) => [k, Boolean(v)]))
  }

  set watching(value: Record<Package["name"], boolean>) {
    const toCleanup = Object.entries(value)
      .filter(([k, v]) => !v && k in this._watching)
      .map(([k]) => k)
    const toAdd = Object.entries(value)
      .filter(([k, v]) => v && !this._watching[k] && this._packages[k]?.localPath)
      .map(([k]) => k)
    toAdd.forEach(k => this._watching[k] = () => null)
    this._watching = {...this._watching}
    this.cleanupWatching(toCleanup)
    const toAddPaths = toAdd.map(k => this._packages[k].localPath as string)
    Promise.all(toAddPaths.map(k => this.watch(k, e => this.handleLocalPathChange(k, e), {recursive: true}))
    ).then(cbs => this.setWatchingCallbacks(toAdd, cbs))      
  }

  private setWatchingCallbacks(names: string[], callbacks: (() => void)[]) {
    callbacks.forEach((cb, i) => this._watching[names[i]] = cb)
    this._watching = {...this._watching}
  }

  private cleanupWatching(names: string[]) {
    names.forEach(k => {this._watching[k](); delete this._watching[k]})
  }

  private async handleLocalPathChange(path: string, e: WatchEvent) {
    const changedPkg = this.packages.find(pkg => pkg.localPath === path)
    const pkgs = await this.fetchInstalled(true, changedPkg!.name)
    await this.writeBundle(pkgs, {bundlename: "bundle", force: true, editMode: true})
    await this.import(pkgs, {bundlename: "bundle", editMode: true})
  }

  get installed() {
    return this.packages.filter(pkg => pkg.installed)
  }

  get imported() {
    return this.packages.filter(pkg => pkg.imported)
  }

  get local() {
    return this.packages.filter(pkg => pkg.localPath)
  }

  get outdatedPkgs() {
    return this.packages.filter(pkg => pkg.outdated)
  }

  get availableWidgetTypes() {
    return this.packages.map(pkg => unscopePackageName(pkg.name))
  }

  /** Initializes the app directory. If the directory is empty (on first run of the app), creates the directory and installs the core packages. */
  @storeAction({onPending() {(this as any).initializing = true}, onDone() {(this as any).initializing = false}})
  async initialize() {
    let appDir = await this.Path.appDir()
    !(await this.FS.exists(appDir)) && await this.FS.mkdir(appDir)
    const packageJsonPath = await this.Path.join(appDir, "package.json")
    const packageJsonExists = await this.FS.exists(packageJsonPath)
    if(!packageJsonExists) {
      const pkgConfig: Package = {name: "webwriter.webwriter", version: appVersion, license: "UNLICENSED"}
      await this.FS.writeFile(packageJsonPath, JSON.stringify(pkgConfig))
      await this.pm("add", this.corePackages, true, appDir)
      // await Promise.all(H5P_REPOSITORIES.map(this.installH5Package))
    }
    const packages = await this.fetchInstalled()
    const importable = (await this.writeBundle(packages, {editMode: true}))?.packages
    await this.import(importable ?? [], {editMode: true})
  }
  
  async testImportable(packages: PackageWithOptions[], setImportError=true) {
    const pkgs = Object.fromEntries(packages.map(pkg => [pkg.name, pkg]))
    for(const pkg of this.packages) {
      try {
        const options = {bundlename: `test-importable`, force: false, editMode: true}
        const {jsSize, cssSize} = await this.writeBundle([pkg], options) ?? {}
        const updatedPkg = {...pkg, jsSize, cssSize}
        pkgs[pkg.name] = updatedPkg
      }
      catch(error: any) {
        if(setImportError) {
          this.importError = {...this.importError, [pkg.name]: error.message}
        }
      }
    }
    return this.importError
  }

  /** Loads the installed packages, optionally setting the `packages` property. */
  @storeAction({
    onPending() {(this as any).fetching = true},
    onDone() {(this as any).fetching = false}
  })
  async fetchInstalled(setPackages=true, incrementReloadCount: string | null = null) {
    let packages = [] as PackageWithOptions[]
    const appDir = await this.Path.appDir()
    const packageJsonPath = await this.Path.join(appDir, "package.json")
    const packageJsonString = await this.FS.readFile(packageJsonPath) as string
    const dependencies = (JSON.parse(packageJsonString)?.dependencies ?? {}) as Record<string, string>
    const pkgJsonPaths = await Promise.all(Object.keys(dependencies).map(k => this.Path.join(appDir, "node_modules", k, "package.json")))
    const pkgs = await Promise.all(pkgJsonPaths.map(async p => JSON.parse(await this.FS.readFile(p) as string)))
    if(pkgs) {
      packages = Object.values(pkgs)
        .filter(pkg => pkg.keywords?.includes("webwriter-widget"))
        .map(pkg => {
          const identifier = dependencies[pkg.name]
          const localPath = identifier.startsWith("file:") || identifier.startsWith("link:")? identifier.replaceAll(/^(file|link):/g, ""): undefined
          const imported = this.isPackageImported(pkg.name)
          if(incrementReloadCount === pkg.name) {
            this._reloadCounts = {...this._reloadCounts, [pkg!.name]: (this._reloadCounts[pkg!.name] ?? 0) + 1}
          }
          return {...pkg, installed: true, imported, localPath, reloadCount: this._reloadCounts[pkg.name] ?? 0}
        })
      const importErrors = await this.testImportable(packages)
      packages = packages.map(pkg => ({...pkg, importError: importErrors[pkg.name]}))
    }
    if(setPackages) {
      this.importError = {}
      this.packages = packages
    }
    return packages
  }

  /** Loads the available packages, optionally from a starting point. */
  @storeAction({
    onPending() {(this as any).fetching = true},
    onDone() {(this as any).fetching = false}
  })
  async fetchAvailable(from?: number) {
    const {total, objects} = await this.search("keywords:webwriter-widget", {from})
    const packages = objects.map(obj => obj["package"])
    return packages
  }

  /** Loads all packages. */
  @storeAction({
    onPending() {(this as any).fetching = true},
    onDone() {(this as any).fetching = false}
  })
  async fetchAll(from?: number) {
    const installed = await this.fetchInstalled(false)
    const available = await this.fetchAvailable(from)
    const installedPkgNames = installed.map(pkg => pkg.name)
    const outdated = installed
      .filter(({name, version}) => {
        const availVersion = available.find(pkg => pkg.name === name)?.version
        return availVersion && availVersion !== version
      })
    this.packages = [
      ...available.filter(pkg => !installedPkgNames.includes(pkg.name)),
      ...installed.map(pkg => ({...pkg, outdated: outdated.includes(pkg)}))
    ]
    return this.packages
  }

  /** Adds one or more packages. Extra arguments for npm can be provided. */
  @storeAction({queueKey: "pending"})
  async add(args: string[] = []) {
    const appDir = await this.Path.appDir()
    await this.pm("add", args, true, appDir)
    const packages = await this.fetchInstalled(true)
    const localPackages = packages.filter(pkg => pkg.localPath)
    await Promise.all(localPackages.map(async pkg => this.pm("install", ["--prod", "--ignore-optional"], undefined, await this.Path.join(appDir, "node_modules", pkg.name))))
    const importable = (await this.writeBundle(packages, {editMode: true, force: true}))?.packages
    await this.import(importable ?? [], {editMode: true})
    await this.fetchAll(0)
  }

  /** Installs a H5P package from a git repository and converts it to a node package. */
  @storeAction({queueKey: "pending"})
  async addH5Package(url: string) {
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
    this.add(["file:" + dir])
  }

  /** Updates one or more packages. Extra arguments for npm can be provided. */
  @storeAction({queueKey: "pending"})
  async upgrade(args: string[] = []) {
    const appDir = await this.Path.appDir()
    await this.pm("upgrade", args, true, appDir)
    const packages = await this.fetchAll(0)
    const importable = (await this.writeBundle(packages, {editMode: true}))?.packages
    await this.import(importable ?? [], {editMode: true})
  }

  /** Removes one or more packages. Extra arguments for npm can be provided. */
  @storeAction({queueKey: "pending"})
  async remove(args: string[] = []) {
    const appDir = await this.Path.appDir()
    const pkgs = args.filter(arg => !arg?.startsWith("-"))
    this.watching = Object.fromEntries(pkgs.map(pkg => [pkg, false]))
    await this.pm("remove", args, true, appDir)
    await this.fetchAll(0)
    console.log(this.installed.map(pkg => pkg.name))
    await this.import(this.installed ?? [], {editMode: true})
  }

  /** Writes a bundle to the provided file system. */
  async writeBundle(packages: PackageWithOptions[], {bundlename="bundle", force=false, editMode=false}: {bundlename?: string, force?: boolean, editMode?: boolean} = {bundlename: "bundle", force: false, editMode: false}) {
    if(force || !await this.bundleExists(packages, {bundlename, editMode})) {
      let pkgs = packages
      const appDir = await this.Path.appDir()
      if(packages.length > 1) {
        const importErrors = await this.testImportable(packages)
        pkgs = pkgs.map(pkg => ({...pkg, importError: importErrors[pkg.name]}))
      }
      const bundleFilename = `${bundlename}#${PackageStore.computeBundleHash(pkgs, editMode)}`
      const bundlePath = await this.Path.join(appDir, bundleFilename)
      const entrypointPath = await this.Path.join(appDir, "entrypoint.js")
      const exportStatements = pkgs
        .filter(pkg => !pkg.importError)
        .map(pkg => {
          const hasEditor = pkg.exports && (pkg as any).exports["edit"]
          const moduleName = editMode && hasEditor? `${pkg.name}/edit`: pkg.name
          return `import '${moduleName}'`
        })
      const entrypoint = exportStatements.join(";")
      this.FS.writeFile(entrypointPath, entrypoint)
      await this.bundle([`${entrypointPath}`, "--bundle", "--sourcemap=inline", `--outfile=${bundlePath}.js`, `--format=esm`])
      const jsSize = (await this.FS.stat(bundlePath + ".js"))?.size
      const cssSize = (await this.FS.stat(bundlePath + ".css"))?.size
      return {bundlePath, packages: pkgs, jsSize, cssSize}
    }
  }

  /** Loads bundle code from the provided file system into the store, to be imported by the view later. */
  async import(packages: PackageWithOptions[], {bundlename="bundle", editMode=false}: {bundlename?: string, editMode?: boolean} = {bundlename: "bundle", editMode: false}) {
    const packageNames = packages.map(pkg => pkg.name)
    const appDir = await this.Path.appDir()
    const bundleFilename = `${bundlename}#${PackageStore.computeBundleHash(packages, editMode)}`
    const bundlePathJS = await this.Path.join(appDir, bundleFilename + ".js")
    const bundlePathCSS = await this.Path.join(appDir, bundleFilename + ".css")
    const bundleCode = await this.FS.readFile(bundlePathJS)
    const bundleCSS = await this.FS.exists(bundlePathCSS)? await this.FS.readFile(bundlePathCSS): ""
    this.bundleCode = bundleCode as string
    this.bundleCSS = bundleCSS as string
    const importedPackages = packages.map(pkg => pkg.name)
    this.packages = this.packages.map(pkg => importedPackages.includes(pkg.name)? {...pkg, imported: true}: pkg)
    this.bundleID = PackageStore.computeBundleID(this.imported, editMode)
    this.onImport? this.onImport(packages): null
  }

  /** Checks if the bundle already exists on disk. */
  async bundleExists(packages: PackageWithOptions[], {bundlename="bundle", editMode=false}: {bundlename?: string, editMode?: boolean} = {bundlename: "bundle", editMode: false}) {
    const hash = PackageStore.computeBundleHash(packages, editMode)
    const bundleFilename = `${bundlename}#${hash}`
    const appDir = await this.Path.appDir()
    const bundlePath = await this.Path.join(appDir, bundleFilename)
    return this.FS.exists(bundlePath)
  }

  /** Uses the provided system shell to open the app directory. */
  async viewAppDir() {
    const appDir = await this.Path.appDir()
    return this.Shell.open(appDir)
  }

  /** Uses the provided file system to clear the app directory and reinitializes it. */
  @storeAction({
    onPending() {(this as any).resetting = true},
    onDone() {(this as any).resetting = false}
  })
  async resetAppDir() {
    const appDir = await this.Path.appDir()
    await this.FS.rmdir(appDir)
    return this.initialize()
  }

  /** Adds a local directory as a package. If it does not contain a package, create a package there. */
  @storeAction({})
  async addLocal(path?: string, pkg?: Package) {
    const localPath = path ?? await this.Dialog.promptRead({directory: true, multiple: false, recursive: true}) as string | null
    if(localPath === null) {
      return
    }
    const appDir = await this.Path.appDir()
    const resolvedPath = await this.Path.resolve(localPath)
    const basename = await this.Path.basename(resolvedPath)
    const pkgJsonPath = await this.Path.join(resolvedPath, "package.json")
    const existingPkg = await this.FS.exists(pkgJsonPath)
      ? Package.parse(JSON.parse(await this.FS.readFile(pkgJsonPath) as string))
      : null
    const resolvedPkg: Package = existingPkg 
      ?? pkg 
      ?? {name: basename, version: "0.0.1", keywords: ["webwriter-widget"]}
    if(!existingPkg) {
      this.FS.writeFile(pkgJsonPath, Package.serialize(resolvedPkg))
    }
    const url = new URL("link:")
    url.pathname = resolvedPath
    await this.add([`link:${resolvedPath}`])
  }

  @storeAction({queueKey: "pending"})
  async toggleWatch(name: Package["name"]) {
    this.watching = {...this.watching, [name]: !this.watching[name]}
  }

}