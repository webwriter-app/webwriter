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
    fontFamilies: string[]
  } & UAParser.IResult
}


export class EnvironmentController implements ReactiveController {

  host: ReactiveControllerHost
  api: Environment
  apiReady: Promise<Environment>

  constructor(host: ReactiveControllerHost) {
    (this.host = host).addController(this)
  }

  async hostConnected() {
    const backend = detectBackend()
    this.apiReady = import(`../model/environment/${backend}.ts`)
		this.api = await this.apiReady
    globalThis.WEBWRITER_ENVIRONMENT = {
      backend,
      fontFamilies: await this.api.getSystemFonts(),
      language: navigator.language,
      ...UAParser(navigator.userAgent)
    }
  }
}