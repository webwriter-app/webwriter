import { hashCode, unscopePackageName, arrayReplaceAt } from "../../utility"
import { Environment } from "../../environment"
import H5P_REPOSITORIES from "../../h5p-repositories.json"
import { toJS } from "mobx"
import { Package } from ".."

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

type PackageOptions = {installed?: boolean, outdated?: boolean, root?: string, imported?: boolean, importError?: string}

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
      keywords: ["webwriter-h5p", "webwriter-widget"],
      h5pLibrary: {...library}
    }
  }

  /** Create a hash value to identify a bundle. The hash is deterministically computed from the packages' names and versions. This allows for caching of existing bundles. */
  static computeBundleHash(packages: PackageWithOptions[], editMode: boolean = false) {
    const packageVersions = packages.map(pkg => `${pkg.name}@${pkg.version}`)
    return hashCode(packageVersions.join() + (editMode? "edit": ""))
  }

  static isPackageImported(name: string) {
    return !!window.customElements.get(unscopePackageName(name))
  }

  _pending: ProcessingEntry[] = []
  get pending() {return this._pending}
  set pending(value) {this._pending = value}

  fetching: boolean = false
  initializing: boolean = false
  resetting: boolean = false

  _packages: Record<string, PackageWithOptions> = {}
  corePackages: Package["name"][] = []

  importError: Record<string, string> = {}

  onImport: Options["onImport"]

  FS: Environment["FS"]
  Path: Environment["Path"]
  Shell: Environment["Shell"]
  bundle: Environment["bundle"]
  search: Environment["search"]
  npm: Environment["npm"]

  constructor(options: Options) {
    Object.assign(this, options)
    this.initialize()
  }

  get installing() {
    return this.pending
      .map(entry => entry.key === "install" && !entry.done? entry.args: [])
      .flat(2)
      .filter(arg => !arg.startsWith("-"))
  }

  get updating() {
    return this.pending
      .map(entry => entry.key === "update" && !entry.done? entry.args: [])
      .flat(2)
      .filter(arg => !arg.startsWith("-"))
  }

  get uninstalling() {
    return this.pending
      .map(entry => entry.key === "uninstall" && !entry.done? entry.args: [])
      .flat(2)
      .filter(arg => !arg.startsWith("-"))
  }

  set packages(value: PackageWithOptions[] | Record<string, PackageWithOptions>) {
    const pkgs = Array.isArray(value)
      ? Object.fromEntries(value.map(x => [x.name, x]))
      : value
    this._packages = pkgs

  }

  get packages(): PackageWithOptions[] {
    return Object.values(this._packages).map(pkg => ({
      ...pkg,
      importError: this.importError[pkg.name]
    }))
  }

  get installed() {
    return this.packages.filter(pkg => pkg.installed)
  }

  get imported() {
    return this.packages.filter(pkg => pkg.imported)
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
    const list = await this.npm("ls", undefined, true, appDir) as PackageWithOptions
    if(!list?.name) {
      await this.npm("init", ["--yes"], false, appDir)
      await this.npm("install", this.corePackages, true, appDir)
      // await Promise.all(H5P_REPOSITORIES.map(this.installH5Package))
    }
    const packages = await this.fetchInstalled()
    await this.writeBundle(packages, {editMode: true})
    const importable = (await this.writeBundle(packages, {editMode: true}))?.packages
    this.import(importable ?? [], {editMode: true})
  }
  
  async testImportable(packages: PackageWithOptions[], setImportError=true) {
    const pkgs = Object.fromEntries(packages.map(pkg => [pkg.name, pkg]))
    for(const pkg of this.packages) {
      try {
        const options = {bundlename: `test-importable`, force: false, editMode: true}
        await this.writeBundle([pkg], options)
        const updatedPkg = {...pkg}
        pkgs[pkg.name] = updatedPkg
      }
      catch(error: any) {
        if(setImportError) {
          this.importError = {...this.importError, [pkg.name]: error.message}
        }
      }
    }
    return Object.values(pkgs).filter(pkg => !this.importError[pkg.name])
  }

  /** Loads the installed packages, optionally setting the `packages` property. */
  @storeAction({
    onPending() {(this as any).fetching = true},
    onDone() {(this as any).fetching = false}
  })
  async fetchInstalled(setPackages=true) {
    let packages = [] as PackageWithOptions[]
    const appDir = await this.Path.appDir()
    const list = (await this.npm("ls", ["--long"], true, appDir)) as Partial<Package>
    const dependencies = list["dependencies"] as Package["dependencies"]
    if(dependencies) {
      const packagePaths = Object.values(dependencies)
        .map(v => (v as any)?.path)
        .filter((path: string) => path)
      const packageStrings = await Promise.all(packagePaths.map(path => this.FS.readFile(path + "/package.json")))
      const packagePathsAndStrings = packagePaths.map((path, i) => [path, packageStrings[i]])
      packages = packagePathsAndStrings
        .map(([path, packageString]) => [path, JSON.parse(packageString)])
        .filter(([path, pkg]) => pkg.keywords?.includes("webwriter-widget"))
        .map(([path, pkg]) => ({...pkg, installed: true, root: path}))
        .map(pkg => ({...pkg, imported: PackageStore.isPackageImported(pkg.name)}))
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

  /** Installs one or more packages. Extra arguments for npm can be provided. */
  @storeAction({queueKey: "pending"})
  async install(args: string[] = []) {
    const appDir = await this.Path.appDir()
    const packageNames = args.filter(arg => !arg.startsWith("-"))
    await this.npm("install", args, true, appDir)
    const allPackages = await this.fetchAll(0)
    const packages = allPackages.filter(pkg => pkg.installed)
    const importable = (await this.writeBundle(packages, {editMode: true}))?.packages
    await this.import(importable ?? [], {editMode: true})
  }

  /** Installs a H5P package from a git repository and convert it to a node package. */
  @storeAction({queueKey: "pending"})
  async installH5Package(url: string) {
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
    this.FS.writeFile(dir + "/package.json", JSON.stringify(pkg, undefined, 2), "utf8")
    this.FS.writeFile(dir + "/index.js", "export default null", "utf8")
    this.install(["file:" + dir])
  }

  /** Updates one or more packages. Extra arguments for npm can be provided. */
  @storeAction({queueKey: "pending"})
  async update(args: string[] = []) {
    const appDir = await this.Path.appDir()
    await this.npm("update", args, true, appDir)
    const packages = await this.fetchAll(0)
    const importable = (await this.writeBundle(packages, {editMode: true}))?.packages
    await this.import(importable ?? [], {editMode: true})
  }

  /** Uninstalls one or more packages. Extra arguments for npm can be provided. */
  @storeAction({queueKey: "pending"})
  async uninstall(args: string[] = []) {
    const appDir = await this.Path.appDir()
    await this.npm("uninstall", args, true, appDir)
    await this.fetchAll(0)
  }

  /** Lists all packages. Extra arguments for npm can be provided. */
  async ls(args: string[] = []) {
    return this.npm("ls", args)
  }

  /** Writes a bundle to the provided file system. */
  async writeBundle(packages: PackageWithOptions[], {bundlename="bundle", force=false, editMode=false}: {bundlename?: string, force?: boolean, editMode?: boolean} = {bundlename: "bundle", force: false, editMode: false}) {
    if(!await this.bundleExists(packages, {bundlename, editMode}) || force) {
      let pkgs = packages
      const appDir = await this.Path.appDir()
      if(packages.length > 1) {
        pkgs = await this.testImportable(packages)
      }
      const bundleFilename = `${bundlename}#${PackageStore.computeBundleHash(pkgs, editMode)}`
      const bundlePath = await this.Path.join(appDir, bundleFilename)
      const entrypointPath = await this.Path.join(appDir, "entrypoint.js")
      const exportStatements = pkgs.map(pkg => {
        const hasEditor = pkg.exports && (pkg as any).exports["edit"]
        const name = unscopePackageName(pkg.name.replaceAll("-", "ಠಠಠ"))
        const moduleName = editMode && hasEditor? `${pkg.name}/edit`: pkg.name
        return `import '${moduleName}'`
      })
      const entrypoint = exportStatements.join(";")
      this.FS.writeFile(entrypointPath, entrypoint)
      await this.bundle([`${entrypointPath}`, "--bundle", `--outfile=${bundlePath}.js`, `--format=esm`])
      return {bundlePath, packages: pkgs}
    }
  }

  /** Imports a bundle from the provided file system. */
  async import(packages: PackageWithOptions[], {bundlename="bundle", editMode=false}: {bundlename?: string, editMode?: boolean} = {bundlename: "bundle", editMode: false}) {
    const packageNames = packages.map(pkg => pkg.name)
    const appDir = await this.Path.appDir()
    const bundleFilename = `${bundlename}#${PackageStore.computeBundleHash(packages, editMode)}.js`
    const bundlePath = await this.Path.join(appDir, bundleFilename)
    const bundleCode = await this.FS.readFile(bundlePath)
    let blobURL = URL.createObjectURL(new Blob([bundleCode], {type: 'application/javascript'}))
    try {
      await import(blobURL)
    }
    catch(error) {
      console.error(error) 
    }
    const importedPackages = packages.map(pkg => pkg.name)
    this.packages = this.packages.map(pkg => importedPackages.includes(pkg.name)? {...pkg, imported: true}: pkg)
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

}