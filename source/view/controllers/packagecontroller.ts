import {Command} from "@tauri-apps/api/shell"
import { ReactiveController, ReactiveControllerHost } from "lit"

export class PackageController implements ReactiveController {

  initialized: Promise<void>
  host: ReactiveControllerHost

  constructor(host: ReactiveControllerHost) {
    (this.host = host).addController(this);
    this.initialized = this.npm("-v", [], false).then(() => {}, reason => {
      throw Error("Packaging command 'npm' not available: " + reason)
    })
    this.search("test").then(result => console.log(result))
  }

  hostConnected(): void {
    
  }

  hostDisconnected(): void {
    
  }

  private async npm(subcommand: string, args: string[] = [], json=true): Promise<object | string> {
    const cmdArgs = [subcommand, json ? "--json": "", ...args]
    const output = await Command.sidecar("../binaries/npm", cmdArgs).execute()
    console.log([output.code, output.stdout, output.stderr, output.signal])
    if(output.code !== 0) {
      throw Error(output.stderr)
    }
    else {
      return json? JSON.parse(output.stdout): output.stdout
    }
  }

  async init(args: string[] = [], yes=true) {
    this.npm("init", [yes? "--yes": "", ...args])
  }

  async install(args: string[] = []) {
    return this.npm("install", args)
  }

  async uninstall(args: string[] = []) {
    return this.npm("uninstall", args)
  }

  async update(args: string[] = []) {
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

  async search(text: string, params: {size?: number, from?: number, quality?: number, popularity?: number, maintenance?: number} = {}, searchEndpoint: string = "https://registry.npmjs.com/-/v1/search") {
    // Replaced with https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md, since `search` command does not support any search qualifiers
    const allParams = {text, ...params}
    const url = new URL(searchEndpoint)
    Object.entries(allParams).forEach(([k, v]) => v? url.searchParams.append(k, v.toString()): null)
    const result = await fetch(url.href)
    return result.json()
  }

}