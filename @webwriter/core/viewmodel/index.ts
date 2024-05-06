import { LitElement } from "lit"

export * from "./commandcontroller"
export * from "./localizationcontroller"
export * from "./notificationcontroller"
export * from "./settingscontroller"
export * from "./storecontroller"
export * from "./environmentcontroller"
export * from "./iconcontroller"

import {StoreController, EnvironmentController, CommandController, LocalizationController, NotificationController, SettingsController, IconController} from "."
import { PackageStore, RootStore } from "../model"
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
      await this.environment.apiReady
      this.store = StoreController(new RootStore({corePackages: CORE_PACKAGES, ...this.environment.api}), this)
      this.localization = new LocalizationController(this, this.store)
      this.commands = new CommandController(this as any, this.store)
      this.notifications = new NotificationController(this, this.store)
      this.settings = new SettingsController(this, this.store)
      this.initializeWindow()
      await this.store.packages.initialized
      const path = new URL(window.location.href).searchParams.get("open")
      if(path) {
        const fileURL = new URL("file://")
        fileURL.pathname = path
        this.store.document.load(fileURL.href)
      }
      const {join, appDir} = this.environment.api.Path
      await this.store.packages.initialized
      const packageJsonPath = await join(await appDir(), "package.json")
      this.environment.api.watch(packageJsonPath, (e) => {
        !this.store.packages.initializing && !this.store.packages.loading && this.store.packages.load()
      })
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
      await this.environment.api.createWindow("settings.html", {...WINDOW_OPTIONS, title: `${msg("Settings")} - WebWriter`, visible: false, label: "settings"})
      this.environment.api.setWindowCloseBehavior(["closeAllIfLastVisible", "closeOthersOnReload"], this.confirmWindowClose)
    }
    else if(label === "settings") {
      this.environment.api.setWindowCloseBehavior(["hideOnCloseUnlessLast"])
    }
    else {
      this.environment.api.setWindowCloseBehavior(["closeAllIfLastVisible"], this.confirmWindowClose)
    }
  }
}