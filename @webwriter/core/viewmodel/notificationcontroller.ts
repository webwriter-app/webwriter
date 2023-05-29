import {ReactiveController, ReactiveControllerHost} from "lit"

import { RootStore } from "../model"

export class NotificationController implements ReactiveController {

  host: ReactiveControllerHost
	store: RootStore

  constructor(host: ReactiveControllerHost, store: RootStore) {
		this.store = store;
    (this.host = host).addController(this)
  }


  hostConnected() {
		window.onerror = e => this.handleEvent(e, {throwOnly: true, isOnError: true})
		window.onunhandledrejection = e => this.handleEvent(e, {throwOnly: true})
		const defaultWarn = console.warn
		const defaultError = console.error
		console.warn = (message, ...params) => {
      this.handleEvent(message, {warn: defaultWarn, warning: true}, ...params)
		}
		console.error = (message, ...params) => {
      this.handleEvent(message, {error: defaultError}, ...params)
		}
  }

	handleEvent = (e: any, {warn=console.warn, error=console.error, warning=false, throwOnly=false, isOnError=false} = {}, ...params: any[]) => {
    const message = e?.type === "error"? e?.message: e?.reason?.message ?? e
    const notify = (m: string) => this.notify(m, warning? "warning": "danger")
    const log = (m: string) => warning? warn(m, ...params): error(m, ...params)
    const ignoreList = warning? this.warningsToIgnore: this.errorsToIgnore
		if(ignoreList.some(s => message.startsWith && message.startsWith(s))) {
			return isOnError
		}
		else if(!throwOnly) {
      notify(message)
      log(message)
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
    "Option values cannot include a space. All spaces have been replaced with underscores."
	]

	warningsToIgnore = [
		"ProseMirror expects the CSS white-space property to be set, preferably to 'pre-wrap'. It is recommended to load style/prosemirror.css from the prosemirror-view package.",
    "The `requestUpdate` method should no longer return a Promise but does so on `ww-app`. Use `updateComplete` instead. See https://lit.dev/msg/request-update-promise for more information."
	]
}