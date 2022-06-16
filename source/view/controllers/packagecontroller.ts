import {Command} from "@tauri-apps/api/shell"
import {readTextFile} from "@tauri-apps/api/fs"
import { ReactiveController, ReactiveControllerHost } from "lit"
import type { IPackageJson } from "package-json-type"

export type PackageJson = IPackageJson & {installed: boolean, outdated: boolean}

export class PackageController implements ReactiveController {

  initialized: Promise<void>
  host: ReactiveControllerHost

  constructor(host: ReactiveControllerHost) {
    (this.host = host).addController(this);
    this.initialized = this.initialize().then(() => {}, reason => {
      throw Error("Error initializing package management with 'npm': " + reason)
    })
  }

  async initialize() {
    const list = await this.ls() as any
    console.log(list)
    if(!list?.name) {
      return this.npm("init", ["--yes"])
    }
  }

  hostConnected(): void {
    
  }

  hostDisconnected(): void {
    
  }

  private async npm(subcommand: string, args: string[] = [], json=true): Promise<object | string> {
    const cmdArgs = [subcommand, json ? "--json": "", ...args]
    const output = await Command.sidecar("../binaries/npm", cmdArgs).execute()
    console.log(output)
    if(output.stderr) {
      throw Error(output.stderr)
    }
    else {
      return json? JSON.parse(output.stdout): output.stdout
    }
  }

  async install(args: string[] = [], save=true) {
    return this.npm("install", args)
  }

  async uninstall(args: string[] = [], save=true) {
    return this.npm("uninstall", args)
  }

  async update(args: string[] = [], save=true) {
    return this.npm("update", args)
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
    const dependencies = (await this.ls(["--long"]))["dependencies"] as IPackageJson
    const outdated = this.outdated()
    const packagePaths = Object.values(dependencies)
      .map(v => v?.path)
      .filter((path: string) => path)
    const packageStrings = await Promise.all(packagePaths.map(path => readTextFile(path + "\\package.json")))
    const packages = packageStrings
      .map(packageString => JSON.parse(packageString))
      .map(pkg => ({...pkg, installed: true}))
    Object.entries(await outdated)
      .forEach(([name, value]) => (packages.find(pkg => pkg.name === name) ?? {})["outdated"] = true)
    return packages as PackageJson[]
  }

  async search(text: string, params: {size?: number, from?: number, quality?: number, popularity?: number, maintenance?: number} = {}, searchEndpoint: string = "https://registry.npmjs.com/-/v1/search") {
    // Replaced with https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md, since `search` command does not support any search qualifiers
    const allParams = {text, ...params}
    const url = new URL(searchEndpoint)
    Object.entries(allParams).forEach(([k, v]) => v? url.searchParams.append(k, v.toString()): null)
    const result = await fetch(url.href)
    return result.json()
  }

}