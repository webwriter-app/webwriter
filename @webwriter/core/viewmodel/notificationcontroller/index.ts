import {ReactiveController, ReactiveControllerHost} from "lit"

import { MemberSettings, RootStore, WidgetEditingSettings } from "#model"

export class NotificationController implements ReactiveController {

  host: ReactiveControllerHost
  store: RootStore

  constructor(host: ReactiveControllerHost, store: RootStore) {
	this.store = store;
    (this.host = host).addController(this)
  }

  private getExceptionOrigin() {
    const err = new Error()
    const regex = /\((https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))\)/g
    const warningTraceUrls = Array.from(err.stack?.matchAll(regex) ?? [])
      .map(v => v[1])
      .map(url => url.slice(0, url.lastIndexOf(":", url.lastIndexOf(":") - 1)))
    if(!warningTraceUrls.length) {
      return {}
    }
    const imports = this.store.packages.importMap.imports
    const originatingID = Object.keys(imports).find(k => warningTraceUrls.includes(imports[k]))
    const originatingPackage = originatingID?.split("/").slice(0, 2).join("/")
    let originatingMember = "./" + originatingID?.split("/").slice(2).join("/")
    originatingMember = originatingMember.slice(0, originatingMember?.lastIndexOf("."))
    const originatingSettings = originatingPackage? this.store.packages.getPackageMembers(originatingPackage)?.[originatingMember] as MemberSettings & WidgetEditingSettings: undefined
    return {originatingID, originatingPackage, originatingMember, originatingSettings}
  }

  hostConnected() {
		window.onerror = e => this.handleEvent(e, {throwOnly: true, isOnError: true})
		window.onunhandledrejection = e => this.handleEvent(e, {throwOnly: true})
		const defaultWarn = console.warn
		const defaultError = console.error
		console.warn = (message, ...params) => {
      const {originatingID, originatingPackage, originatingSettings} = this.getExceptionOrigin()
      if(originatingPackage) {
        if(originatingSettings?.warningIgnorePattern) {
          try {
            const regex = new RegExp(originatingSettings.warningIgnorePattern, "g")
            if(regex.test(message)) {
              return
            }
          }
          catch(err) {
            console.warn(`Invalid regex from ${originatingID}: '${originatingSettings.warningIgnorePattern}'`)
          }
        }
      }
      this.handleEvent(message, {warn: defaultWarn, warning: true}, ...params)
		}
		console.error = (message, ...params) => {
      const {originatingID, originatingPackage, originatingSettings} = this.getExceptionOrigin()
      if(originatingPackage) {
        if(originatingSettings?.errorIgnorePattern) {
          try {
            const regex = new RegExp(originatingSettings.errorIgnorePattern, "g")
            if(regex.test(message)) {
              return
            }
          }
          catch(err) {
            console.warn(`Invalid regex from ${originatingID}: '${originatingSettings.errorIgnorePattern}'`)
          }
        }
      }
      this.handleEvent(message, {error: defaultError}, ...params)
		}
  }

	handleEvent = (e: any, {warn=console.warn, error=console.error, warning=false, throwOnly=false, isOnError=false} = {}, ...params: any[]) => {	
    let err: Error
		if(e.type === "unhandledrejection") {
      err = (e as PromiseRejectionEvent).reason
		}
		else if(e instanceof Error) {
			err = e
		}
		else {
			err = new Error(e)
		}
		const notify = (m: string) => this.notify(m, warning? "warning": "danger")
		const log = (m: string) => warning? warn(m, ...params): error(m, ...params)
		const ignoreList = warning? this.warningsToIgnore: this.errorsToIgnore
		if(ignoreList.some(s => err.message?.startsWith(s))) {
			return isOnError
		}
		else if(!throwOnly) {
			notify(err.message)
			log(e)
		}
	}

  notify(message: string, variant: "danger" | "warning" = "danger") {
    return this.store.ui.enqueueNotification({variant, message})
  }

	errorsToIgnore = [
		"TypeError: Cannot set properties of null (setting 'tabIndex')",
		"ResizeObserver loop limit exceeded",
		"UserCancelled",
		"TypeError: Failed to execute 'unobserve' on 'ResizeObserver': parameter 1 is not of type 'Element'.",
		"You are trying to re-register the",
		"Uncaught TypeError: Failed to execute 'unobserve' on 'ResizeObserver'",
    "Option values cannot include a space. All spaces have been replaced with underscores.",
    "Uncaught TypeError: Cannot read properties of null (reading 'anchorNode')",
	  "Uncaught TypeError: e.toLowerCase is not a function"
	]

	warningsToIgnore = [
    "Attempted to register <",
		"ProseMirror expects the CSS white-space property to be set, preferably to 'pre-wrap'. It is recommended to load style/prosemirror.css from the prosemirror-view package.",
    "The `requestUpdate` method should no longer return a Promise but does so on `ww-app`. Use `updateComplete` instead. See https://lit.dev/msg/request-update-promise for more information.",
    "TextSelection endpoint not pointing into a node with inline content",
    "Ignored scripts due to flag.",
    "The main 'lit-element' module entrypoint is deprecated.",
    "Element sl-button scheduled an update (generally because a property was set) after an update completed, causing a new update to be scheduled. This is inefficient and should be avoided unless the next update can only be scheduled as a side effect of the previous update. See https://lit.dev/msg/change-in-update for more information.",
	  "Element sl-icon scheduled an update",
	  "[TAURI] Couldn't find callback id",
    "Element ww-share-form scheduled an update",
    "Element sl-tree-item scheduled an update"
	]
}