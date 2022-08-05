import {Command} from "@tauri-apps/api/shell"
import { ReactiveController, ReactiveControllerHost } from "lit"

export class Bundler {

  protected static async esbuild(args: string[] = []) {
    const output = await Command.sidecar("../binaries/esbuild", [...args]).execute()
    if(output.code !== 0) {
      throw Error(output.stderr)
    }
    else {
      return output
    }
  }

  static async build(args: string[] = []) {
    const result = await this.esbuild(args)
  }
}

export class BundlerController extends Bundler implements ReactiveController {
  initialized: Promise<void>
  host: ReactiveControllerHost

  constructor(host: ReactiveControllerHost) {
    super();
    (this.host = host).addController(this);
    this.initialized = BundlerController.esbuild(["--version"]).then(() => {}, reason => {
      throw Error("Bundling command 'esbuild' not available: " + reason)
    })
  }

  hostConnected(): void {
    
  }

  hostDisconnected(): void {
    
  }
}