import {ReactiveController, ReactiveControllerHost} from "lit"
import UAParser from "ua-parser-js"

import { Environment } from "../model"

/**
 * Detects the environment WebWriter is running in.
 * @returns Either "tauri" for a Tauri WebView, "node" for a NodeJS runtime, or "unknown" for anything else.
 */
export function detectBackend() {
  try {
  	if(window && (window as any)?.__TAURI__ ) {
      return "tauri"
    }
    else if(window && (globalThis === window)) {
      return "node"
    }
    else {
      return "unknown"
    } 
  }
  catch(error) {
    return "unknown"
  }
}

declare global {
	var WEBWRITER_ENVIRONMENT: {
    language: string,
    backend: "tauri" | "node" | "unknown",
    fontFamilies: string[],
    dev: boolean
  } & UAParser.IResult
}

export class EnvironmentController implements ReactiveController {

  host: ReactiveControllerHost
  api: Environment
  apiReady: Promise<Environment>
  ready: Promise<void>
  backend: "tauri" | "node" | "unknown"

  constructor(host: ReactiveControllerHost) {
    (this.host = host).addController(this)
  }

  async hostConnected() {
    this.ready = new Promise(async resolve => {
      const backend = detectBackend()
      if(backend === "tauri") {
        this.apiReady = import(`../model/environment/${backend}.ts`)
        this.api = await this.apiReady
      }
      globalThis.WEBWRITER_ENVIRONMENT = {
        backend,
        fontFamilies: await this?.api?.getSystemFonts(),
        language: navigator.language, // @ts-ignore: Defined by Vite
        dev: Boolean(import.meta.env?.DEV),
        ...UAParser(navigator.userAgent)
      }
      resolve()
    })
  }
}