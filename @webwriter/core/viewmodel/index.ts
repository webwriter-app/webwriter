import { LitElement } from "lit"

export * from "./commandcontroller"
export * from "./localizationcontroller"
export * from "./notificationcontroller"
export * from "./settingscontroller"
export * from "./storecontroller"
export * from "./environmentcontroller"
export * from "./iconcontroller"

import {StoreController, EnvironmentController, CommandController, LocalizationController, NotificationController, SettingsController, IconController} from "."
import { FileClient, PackageStore, RootStore } from "../model"
import { msg } from "@lit/localize"
import { WINDOW_OPTIONS } from "./commandcontroller"
import { idle } from "../utility"

const CORE_PACKAGES = ["@open-wc/scoped-elements"] as string[]

type LitElementConstructor = typeof LitElement
export const ViewModelMixin = (cls: LitElementConstructor, isSettings=false) => class extends cls {
	store: StoreController
	environment: EnvironmentController
	commands: CommandController
	localization: LocalizationController
	notifications: NotificationController
	settings: SettingsController
  icons: IconController

  initialized: Promise<void>
  initializing: boolean = false

	async connectedCallback() {
    this.initialized = new Promise(async resolve => {
      super.connectedCallback()
      this.initializing = true
      this.icons = new IconController(this)
      this.environment = new EnvironmentController(this)
      await this.environment.ready
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register(
          // @ts-ignore
          import.meta.env.MODE === 'production' ? '/bundleservice.js' : '/dev-sw.js?dev-sw', // @ts-ignore
          { type: "module", scope: "/" }
        )
        await navigator.serviceWorker.ready
        console.log("App considers service worker ready")
      }
      else {
        document.body.innerHTML = `<div style="text-align: center; padding: 2rem;">Sorry! WebWriter is currently not supported in your browser for <a href="https://caniuse.com/mdn-javascript_statements_import_service_worker_support">technical reasons</a>. An up-to-date version of Chrome, Edge, Firefox, or Safari should work.</div>`
        return
      }
      const isSettingsWindow = this.environment?.api?.getWindowLabel() === "settings"
      const userSettings = await SettingsController.getUserSettings(this.environment.api)
      this.store = StoreController(new RootStore({settings: userSettings, corePackages: CORE_PACKAGES, ...this.environment.api, initializePackages: !isSettingsWindow, apiBase: WEBWRITER_ENVIRONMENT.backend === "tauri"? undefined: "https://api.webwriter.app/ww/v1/"}), this)
      this.settings = new SettingsController(this, this.store)
      this.localization = new LocalizationController(this, this.store)
      this.commands = new CommandController(this as any, this.store)
      this.notifications = new NotificationController(this, this.store)
      if(!this.store.packages.apiBase) {
        this.initializeWindow()
        await this.store.packages.initialized
        const openUrl = new URL(window.location.href).searchParams.get("open")
        if(openUrl) {
          const url = new URL(openUrl)
          const parser = this.store.accounts.parserSerializerFromURL(url)
          const client = this.store.accounts.clientFromURL(url)
          console.log(url, parser, client)
          this.store.document.load(url, parser, client)
        }
        const {join, appDir} = this.environment.api.Path
        await this.store.packages.initialized
        const packageJsonPath = await join(await appDir(), "package.json")
        this.environment.api.watch(packageJsonPath, (e) => {
          !this.store.packages.initializing && !this.store.packages.loading && this.store.packages.load()
        })
      }
      window.addEventListener("beforeunload", e => {
        if(this.store.document.changed) {
          e.preventDefault()
          return ""
        }
      })
      await this.store.packages.load()
      this.requestUpdate()
      this.initializing = false
      document.body.classList.add("loaded")
      resolve(undefined)
    })
	}

  confirmWindowClose = async () => {
    return !this.store.document.changed || await this.environment.api.Dialog.confirm(
      msg("You have unsaved changes. Are you sure you want to leave and discard them?"),
      {type: "warning"}
    )
  }

  async initializeWindow() {
    const label = this.environment.api.getWindowLabel()
    if(label === "main") {
      try {
        // await this.environment.api.createWindow("settings.html", {...WINDOW_OPTIONS, title: `${msg("Settings")} - WebWriter`, visible: false, label: "settings"})
        this.environment.api.setWindowCloseBehavior(["closeAllIfLastVisible", "closeOthersOnReload"], this.confirmWindowClose)
      }
      catch(err) {
        console.log(err)
      }
    }
    else if(label === "settings") {
      this.environment.api.setWindowCloseBehavior(["hideOnCloseUnlessLast"])
    }
    else {
      this.environment.api.setWindowCloseBehavior(["closeAllIfLastVisible"], this.confirmWindowClose)
    }
  }
}