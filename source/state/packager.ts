import {Command} from "@tauri-apps/api/shell"
import {readTextFile, writeTextFile, removeFile, readDir} from "@tauri-apps/api/fs"
import { ReactiveController, ReactiveControllerHost } from "lit"
import { property } from "lit/decorators/property.js"
import type { IPackageJson } from "package-json-type"
import { BlockElementConstructor } from "webwriter-model"
import { Bundler } from "./bundler"
import { hashCode } from "../utility"

export type PackageJson = IPackageJson & {installed: boolean, outdated: boolean, root: string}

export class Packager {

  installedPackages: PackageJson[] = []
	availablePackages: PackageJson[] = []
  packageModules: Record<string, BlockElementConstructor> = {}
	totalPackagesAvailable: number

  private async npm(subcommand: string, args: string[] = [], json=true): Promise<object | string> {
    const cmdArgs = [subcommand, json ? "--json": "", ...args]
    const output = await Command.sidecar("../static/binaries/npm", cmdArgs).execute()
    if(output.stderr) {
      throw Error(output.stderr)
    }
    else {
      return json? (output.stdout? JSON.parse(output.stdout): null): output.stdout
    }
  }

  async initialize() {
    const list = await this.ls() as any
    if(!list?.name) {
      return this.npm("init", ["--yes"])
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

  async ls(args: string[] = [], ) {
    return this.npm("ls", args)
  }

  async outdated(args: string[] = []) {
    return this.npm("outdated", args)
  }

  async view(args: string[] = []) {
    return this.npm("view", args)
  }

  async getInstalledPackages() {
    console.time("getInstalledPackages")
    console.time("ls")
    const dependencies = (await this.ls(["--long"]))["dependencies"] as IPackageJson
    console.timeEnd("ls")
    // console.time("outdated")
    // const outdated = await this.outdated()
    // console.timeEnd("outdated")
    console.time("package.json")
    const packagePaths = Object.values(dependencies)
      .map(v => v?.path)
      .filter((path: string) => path)
    const packageStrings = await Promise.all(packagePaths.map(path => readTextFile(path + "\\package.json")))
    console.timeEnd("package.json")
    console.time("processing")
    const packagePathsAndStrings = packagePaths.map((path, i) => [path, packageStrings[i]])
    const packages = packagePathsAndStrings
      .map(([path, packageString]) => [path, JSON.parse(packageString)])
      .filter(([path, pkg]) => pkg.keywords?.includes("webwriter"))
      .map(([path, pkg]) => ({...pkg, installed: true, root: path}))
    // Object.entries(outdated)
    //   .forEach(([name, value]) => (packages.find(pkg => pkg.name === name) ?? {})["outdated"] = true)
    console.timeEnd("processing")
    console.timeEnd("getInstalledPackages")
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
	}


  private computeBundleHash(packages: PackageJson[]) {
    const packageVersions = packages.map(pkg => `${pkg.name}@${pkg.version}`)
    return hashCode(packageVersions.join())
  }

  async isBundleOutdated(packages: PackageJson[], bundlename="target/bundle") {
    try {
      await readTextFile(`${bundlename}#${this.computeBundleHash(packages)}`)
      return false
    }
    catch(e) {
      return true
    }
    
  }

  async writeBundle(packages: PackageJson[], bundlename="target/bundle", force=false) {
    if(this.isBundleOutdated(packages, bundlename) || force) {
      const exportStatements = packages.map(pkg => `export {default as ${pkg.name.replaceAll("-", "ಠಠಠ")}} from '${pkg.name}'`)
      const hash = this.computeBundleHash(packages)
      const entrypoint = exportStatements.join(";")
      const bundlePath = `${bundlename}#${hash}`
      await writeTextFile("./target/entrypoint.js", entrypoint)
      await Bundler.build(["./target/entrypoint.js", "--bundle", `--outfile=${bundlePath}.js`, `--format=esm`])
      await removeFile("./target/entrypoint.js")
      return bundlePath
    }
  }

  async importBundle(packages: PackageJson[], bundlename="target/bundle") {
    const bundlePath = `${bundlename}#${this.computeBundleHash(packages)}.js`
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
    Object.entries(this.packageModules).forEach(([k, v]) => v.tagName = v.tagName ?? k)
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

  async fetchAvailablePackages(from=0, append=true, loading=true) {
    this.loading = loading
    this.host.requestUpdate()
    await this.host.updateComplete
    await super.fetchAvailablePackages(from, append)
    this.loading = false
    this.host.requestUpdate()
  }

  async fetchAllPackages(from=0, append=true, loading=true) {
    this.loading = loading
    this.host.requestUpdate()
    await this.host.updateComplete
    await super.fetchInstalledPackages()
    console.log("fetching available")
    await super.fetchAvailablePackages(from, append)
    this.loading = false
    this.host.requestUpdate()
  }

  async install(args: string[] = []) {
    const result = await super.install(args)
    this.host.requestUpdate()
    return result
  }

  async uninstall(args: string[] = []) {
    const result = await super.uninstall(args)
    this.host.requestUpdate()
    return result
  }

  async update(args: string[] = []) {
    const result = await super.update(args)
    this.host.requestUpdate()
    return result
  }

  hostConnected(): void {
    
  }

  hostDisconnected(): void {
    
  }
}