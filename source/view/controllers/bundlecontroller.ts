import {Command} from "@tauri-apps/api/shell"
import { ReactiveController, ReactiveControllerHost } from "lit"

export class BundleController implements ReactiveController {


  initialized: Promise<void>
  host: ReactiveControllerHost

  constructor(host: ReactiveControllerHost) {
    (this.host = host).addController(this);
    this.initialized = this.esbuild("--version").then(() => {}, reason => {
      throw Error("Bundling command 'esbuild' not available: " + reason)
    })
  }

  hostConnected(): void {
    
  }

  hostDisconnected(): void {
    
  }

  private async esbuild(subcommand: string, args: string[] = []) {
    console.log(["esbuild", subcommand, ...args].join(" "))
    const output = await Command.sidecar("../binaries/esbuild", [subcommand, ...args]).execute()
    console.log([output.code, output.stdout, output.stderr, output.signal])
    if(output.code !== 0) {
      throw Error(output.stderr)
    }
    else {
      return output
    }
  }

  async build(args: string[] = []) {
    const result = await this.esbuild("", args)
  }
}