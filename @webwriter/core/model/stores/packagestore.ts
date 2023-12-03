import {z} from "zod"
import { cargoQueue } from "async"
import MiniSearch from "minisearch"

import { hashCode, unscopePackageName } from "../../utility"
import { Environment, WatchEvent } from "../environment"
import { Package } from ".."
import {version as appVersion} from "../../package.json"
import { licenses, presets } from "../templates"

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

/** Handles packages. Packages are node (npm) packages which contain widgets. The PackageStore can also create bundles from packages, which can for example be imported by the runtime editor or embedded by serializers. Additionally, the PackageStore can open or clear the app directory which stores the packages. */
export class PackageStore {


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

  static computeBundleID(pkgs: Package[], reloadCount?: number) {
    const hasLocal = pkgs.some(pkg => pkg.localPath)
    const packageVersions = pkgs.map(pkg => `${pkg.name.replaceAll("/", "~")}@${pkg.version}`)
    return packageVersions.join("~~") + (hasLocal && reloadCount? `~~~${reloadCount}`: "")
  }

    /** Create a hash value to identify a bundle. The hash is deterministically computed from the packages' names and versions. This allows for caching of existing bundles. */
    static computeBundleHash(pkgs: Package[]) {
      const bundleID = this.computeBundleID(pkgs)
      return hashCode(bundleID).toString(36)
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

  get importingName() {
    return Object.keys(this.adding).find(name => !(name in this.packages))
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
      await this.pm("add", [...toAdd, "--ignore-scripts"], await this.appDir)
      this.adding = {...this.adding, ...Object.fromEntries(toAdd.map(name => [names[name], false]))}
    }
    if(toRemove.length > 0) {
      await this.pm("remove", toRemove, await this.appDir)
      this.removing = {...this.removing, ...Object.fromEntries(toRemove.map(name => [name, false]))}
    }
    if(toUpdate.length > 0) {
      await this.pm("update", [...toUpdate, "--ignore-scripts"], await this.appDir)
      this.updating = {...this.updating, ...Object.fromEntries(toUpdate.map(name => [name, false]))}
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
      description: "Internal package to manage installed WebWriter packages"
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
    console.log("load")
    this.loading = true
    this.reloadCount++
    console.log("fetch all")
    let [installed, available] = await Promise.all([
      this.fetchInstalled(),
      this.fetchAvailable()
    ])
    console.log("test importability")
    installed = await Promise.all(installed.map(async pkg => {
      const {jsExists, cssExists} = await this.bundlePath([pkg])
      if(!jsExists && !cssExists) {
        var {bundleError} = await this.readBundle([pkg])
        return pkg.extend({importError: bundleError})
      }
      else {
        return pkg
      }
    }))
    const importable = installed.filter(pkg => !pkg.importError)
    const newID = PackageStore.computeBundleID(importable, this.reloadCount)
    if(newID !== this.bundleID) {
      console.log("bundling")
      const {bundleJS, bundleCSS} = await this.readBundle(importable)
      this.bundleID = newID
      this.bundleJS = bundleJS!
      this.bundleCSS = bundleCSS!;
      (this.onBundleChange ?? (() => null))(importable)
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
    const {objects} = await this.search("keywords:webwriter-widget")
    return objects.map(obj => obj["package"]).map(pkg => new Package(pkg))
  }

  private async fetchInstalled() {
    const appDir = await this.appDir
    const dependencies = (await this.readRootPackageJson())?.dependencies ?? {}
    const pkgJsonPaths = await Promise.all(Object.keys(dependencies).map(k => this.Path.join(appDir, "node_modules", k, "package.json")))
    const localPaths = Object.values(dependencies).map(dep => dep.startsWith("file:")? dep.slice("file:".length): undefined)
    const pkgs = await Promise.all(pkgJsonPaths.map(async p => JSON.parse(await this.FS.readFile(p) as string)))
    return pkgs.map((pkg, i) => new Package({...pkg, installed: true, localPath: localPaths[i], watching: this.watching[pkg.name]}))
  }

  private async bundlePath(pkgs: Package[]) {
    const hash = PackageStore.computeBundleHash(pkgs)
    const appDir = await this.appDir
    const jsPath = await this.Path.join(appDir, "bundlecache", `${hash}.js`)
    const cssPath = await this.Path.join(appDir, "bundlecache", `${hash}.css`)
    const entryPath = await this.Path.join(appDir, "bundlecache", `${hash}.entrypoint.js`)
    const includesLocal = pkgs.some(pkg => pkg.localPath)
    return {
      jsExists: !includesLocal && await this.FS.exists(jsPath),
      jsPath,
      cssExists: !includesLocal && await this.FS.exists(cssPath),
      cssPath,
      entryPath
    }
  }

  private async readFileIfExists(path: string): Promise<string | undefined> {
    return await this.FS.exists(path)? await this.FS.readFile(path) as string: undefined
  }

  async readBundle(pkgs: Package[]) {
    const appDir = await this.appDir
    const bundleID = PackageStore.computeBundleID(pkgs)
    if(pkgs.length === 0) {
      return {bundleID, bundleJS: "", bundleCSS: ""}
    }
    let {jsPath, jsExists, cssPath, cssExists, entryPath} = await this.bundlePath(pkgs)
    if(!jsExists && !cssExists) {
      const entryCode = pkgs
        .map(pkg => {
          return `import '${pkg.name + ((pkg?.exports ?? {} as any)["edit"]? "/edit": "")}'`
        })
        .join(";")
      await this.FS.mkdir(await this.Path.join(appDir, "bundlecache"))
      await this.FS.writeFile(entryPath, entryCode)
      try {
        await this.bundle([`${entryPath}`, "--bundle", "--sourcemap=inline", `--outfile=${jsPath}`, `--format=esm`])
      }
      catch(err: any) {
        return {bundleError: err.message}
      }
    }
    const [bundleJS, bundleCSS] = await Promise.all([
      this.readFileIfExists(jsPath),
      this.readFileIfExists(cssPath)
    ])
    return {bundleID, bundleJS, bundleCSS}
  }

  /** Toggles watching on a single named package.*/
  async toggleWatch(name: string, forceValue?: boolean) {
    console.log(name, forceValue)
    const pkg = this.packages[name]
    const watching = forceValue ?? !pkg.watching
    if(watching) {
      this.unwatchCallbacks[name] = await this.watch(pkg.localPath!, () => {
        !this.loading && this.load()
      }, {recursive: true})
    }
    else {
      this.unwatchCallbacks[name]()
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
      const extraExists = await this.FS.exists(extraPath)
      if(extraExists && !overwrite) {
        throw Error("Existing extra file found under " + extraPath)
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
    await this.FS.writeFile(pkgJsonPath, JSON.stringify(newPkg))
  }

  /** Uses the provided system shell to open the app directory. */
  async viewAppDir() {
    const appDir = await this.Path.appDir()
    return this.Shell.open(appDir)
  }
}