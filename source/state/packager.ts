import {Command} from "@tauri-apps/api/shell"
import {readTextFile, writeTextFile, removeFile, readDir} from "@tauri-apps/api/fs"
import { ReactiveController, ReactiveControllerHost } from "lit"
import { property } from "lit/decorators/property.js"
import type { IPackageJson } from "package-json-type"
import { BlockElementConstructor } from "webwriter-model"
import { Bundler } from "./bundler"
import { hashCode } from "../utility"
import { join, appDir } from '@tauri-apps/api/path'

const DEFAULT_PACKAGE_JSON = JSON.stringify({
  "name": "webwriter-instance",
  "version": "0"
})

export type PackageJson = IPackageJson & {installed: boolean, outdated: boolean, root: string}

export class Packager {

  static corePackages = ["ww-plaintext", "ww-embed", "@open-wc/scoped-elements"]

  installedPackages: PackageJson[] = []
	availablePackages: PackageJson[] = []
  packageModules: Record<string, BlockElementConstructor> = {}
	totalPackagesAvailable: number
  appDir: string

  private async npm(subcommand: string, args: string[] = [], json=true, appDir=true): Promise<object | string> {
    const cmdArgs = [subcommand, ...(json ? ["--json"]: []), ...args]
    const opts = appDir? {cwd: this.appDir}: {}
    const output = await Command.sidecar("../binaries/npm", cmdArgs, opts).execute()
    if(output.stderr) {
      throw Error(output.stderr)
    }
    else {
      return json? (output.stdout? JSON.parse(output.stdout): null): output.stdout
    }
  }

  async initialize(inAppDir=true) {
    this.appDir = (await appDir()).slice(0, -1)
    const list = await this.ls() as any
    if(!list?.name) {
      await this.npm("init", ["--yes"], false, true)
      // const packageJsonPath = await join(this.appDir, "package.json")
      // await (new Command(`"${DEFAULT_PACKAGE_JSON}" > "${packageJsonPath}"`)).execute()
      return this.install(Packager.corePackages)
    }

  }

  async install(args: string[] = [], save=true) {
    return this.npm("install", [...args, save? "-s": ""])
  }

  async uninstall(args: string[] = [], save=true) {
    return this.npm("uninstall", [...args, save? "-s": ""])
  }

  async update(args: string[] = [], save=true) {
    return this.npm("update", [...args, save? "-s": ""])
  }

  async ls(args: string[] = []) {
    return this.npm("ls", args)
  }

  async outdated(args: string[] = []) {
    return this.npm("outdated", args)
  }

  async getInstalledPackages() {
    const dependencies = (await this.ls(["--long"]))["dependencies"] as IPackageJson
    if(!dependencies) {
      return []
    }
    const packagePaths = Object.values(dependencies)
      .map(v => v?.path)
      .filter((path: string) => path)
    const packageStrings = await Promise.all(packagePaths.map(path => readTextFile(path + "\\package.json")))
    const packagePathsAndStrings = packagePaths.map((path, i) => [path, packageStrings[i]])
    const packages = packagePathsAndStrings
      .map(([path, packageString]) => [path, JSON.parse(packageString)])
      .filter(([path, pkg]) => pkg.keywords?.includes("webwriter"))
      .map(([path, pkg]) => ({...pkg, installed: true, root: path}))
    // Object.entries(outdated)
    //   .forEach(([name, value]) => (packages.find(pkg => pkg.name === name) ?? {})["outdated"] = true)
    return packages as PackageJson[]
  }

  async markOutdatedPackages() {
    const outdated = await this.outdated()
    Object.entries(outdated)
      .forEach(([name, value]) => (this.installedPackages.find(pkg => pkg.name === name) ?? {})["outdated"] = true)
  }

  async search(text: string, params: {size?: number, from?: number, quality?: number, popularity?: number, maintenance?: number} = {}, searchEndpoint: string = "https://registry.npmjs.com/-/v1/search") {
    // Replaced with https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md, since `search` CLI command does not support any search qualifiers
    const allParams = {text, ...params}
    const url = new URL(searchEndpoint)
    Object.entries(allParams).forEach(([k, v]) => v? url.searchParams.append(k, v.toString()): null)
    const result = await fetch(url.href)
    return result.json()
  }

  async fetchInstalledPackages() {
		this.installedPackages = await this.getInstalledPackages()
	}

	async fetchAvailablePackages(from=0, append=true) {
		const {total, objects} = await this.search("keywords:webwriter", {from})
		const packages = objects.map(obj => obj["package"])
		this.totalPackagesAvailable = total
		this.availablePackages = append? [...this.availablePackages, ...packages]: packages
    objects.map(obj => obj.package)
      .forEach(({name, version}) => (this.installedPackages.find(pkg => pkg.name === name && pkg.version !== version) ?? {})["outdated"] = true)
	}


  private computeBundleHash(packages: PackageJson[]) {
    const packageVersions = packages.map(pkg => `${pkg.name}@${pkg.version}`)
    return hashCode(packageVersions.join())
  }

  async isBundleOutdated(packages: PackageJson[], bundlename="bundle") {
    try {
      const bundleFilename = `${bundlename}#${this.computeBundleHash(packages)}`
      const bundlePath = await join(this.appDir, bundleFilename)
      await readTextFile(bundlePath)
      return false
    }
    catch(e) {
      return true
    }
    
  }

  async writeBundle(packages: PackageJson[], bundlename="bundle", force=false) {
    if(this.isBundleOutdated(packages, bundlename) || force) {
      const bundleFilename = `${bundlename}#${this.computeBundleHash(packages)}`
      const bundlePath = await join(this.appDir, bundleFilename)
      const entrypointPath = await join(this.appDir, "entrypoint.js")
      const exportStatements = packages.map(pkg => `export {default as ${pkg.name.replaceAll("-", "ಠಠಠ")}} from '${pkg.name}'`)
      const entrypoint = exportStatements.join(";")
      await writeTextFile(entrypointPath, entrypoint)
      await Bundler.build([entrypointPath, "--bundle", `--outfile=${bundlePath}.js`, `--format=esm`])
      await removeFile(entrypointPath)
      return bundlePath
    }
  }

  async importBundle(packages: PackageJson[], bundlename="bundle") {
    const bundleFilename = `${bundlename}#${this.computeBundleHash(packages)}.js`
    const bundlePath = await join(this.appDir, bundleFilename)
    const bundleCode = await readTextFile(bundlePath)
    let blobURL = URL.createObjectURL(new Blob([bundleCode], {type: 'application/javascript'}));
    const customElements = globalThis.customElements
    Object.defineProperty(window, "customElements", {
      get: () => new Proxy(customElements, {
        get: (_, prop, __) => {
          if(prop === "define") {
            return new Proxy(customElements.define, {apply: (target, thisArg, argumentsList) => {
              !customElements.get(argumentsList[0])? customElements.define(argumentsList[0], argumentsList[1], argumentsList[2]): null
            }})
          }
        } 
      })
    })
    const bundle = await import(/* @vite-ignore */ blobURL)
    Object.defineProperty(window, "customElements", {get: () => customElements})
    this.packageModules = Object.fromEntries(Object.entries(bundle).map(([k, v]) => [k.replaceAll("ಠಠಠ", "-"), v])) as Record<string, BlockElementConstructor>
    Object.entries(this.packageModules).forEach(([k, v]) => v["tagName"] = v["tagName"] ?? k)
    Object.entries(this.packageModules).forEach(([k, v]) => customElements.define(k, v))
  }


}


export class PackagerController extends Packager implements ReactiveController {
  
  initialized: Promise<void>
  host: ReactiveControllerHost

  loading: boolean = false

  constructor(host: ReactiveControllerHost) {
    super();

    (this.host = host).addController(this);
    this.initialized = this.initialize().then(() => {}, reason => {
      throw Error("Error initializing package management with 'npm': " + reason)
    })
  }

  async fetchInstalledPackages(loading=true, importPackages=false) {
    this.loading = loading
    await this.initialized
    this.host.requestUpdate()
    await this.host.updateComplete
    await super.fetchInstalledPackages()
    importPackages? await super.writeBundle(this.installedPackages): null
    importPackages? await super.importBundle(this.installedPackages): null
    this.loading = false
    this.host.requestUpdate()
  }

  async markOutdatedPackages(): Promise<void> {
    await super.markOutdatedPackages()
    this.host.requestUpdate()
  }

  async fetchAvailablePackages(from=0, append=true) {
    await this.initialized
    this.host.requestUpdate()
    await this.host.updateComplete
    await super.fetchAvailablePackages(from, append)
    this.host.requestUpdate()
  }

  async fetchAllPackages(from=0, append=true, loading=true) {
    this.loading = loading
    await this.initialized
    this.host.requestUpdate()
    await this.host.updateComplete
    await super.fetchInstalledPackages()
    await super.fetchAvailablePackages(from, append)
    this.loading = false
    this.host.requestUpdate()
  }

  async install(args: string[] = [], importPackages=true) {
    const result = await super.install(args)
    await this.fetchInstalledPackages()
    importPackages? await super.writeBundle(this.installedPackages): null
    importPackages? await super.importBundle(this.installedPackages): null
    this.host.requestUpdate()
    return result
  }

  async uninstall(args: string[] = [], importPackages=true) {
    const result = await super.uninstall(args)
    await this.fetchInstalledPackages()
    importPackages? await super.writeBundle(this.installedPackages): null
    importPackages? await super.importBundle(this.installedPackages): null
    this.host.requestUpdate()
    return result
  }

  async update(args: string[] = [], importPackages=true) {
    const result = await super.update(args)
    await this.fetchInstalledPackages()
    importPackages? await super.writeBundle(this.installedPackages): null
    importPackages? await super.importBundle(this.installedPackages): null
    this.host.requestUpdate()
    return result
  }

  hostConnected(): void {
    
  }

  hostDisconnected(): void {
    
  }
}