import { LitElement } from "lit"

export * from "./commandcontroller"
export * from "./localizationcontroller"
export * from "./notificationcontroller"
export * from "./settingscontroller"
export * from "./storecontroller"
export * from "./environmentcontroller"
export * from "./iconcontroller"

import {StoreController, EnvironmentController, CommandController, LocalizationController, NotificationController, SettingsController, IconController} from "#viewmodel"
import { RootStore } from "#model"
import { msg } from "@lit/localize"

async function getAllLocalHandles(): Promise<FileSystemDirectoryHandle[]> {
  const db = indexedDB.open("webwriter")
  await new Promise(r => db.addEventListener("success", r))
  const tx = db.result.transaction("handles", "readwrite")
  const store = tx.objectStore("handles")
  const req = store.getAll()
  return new Promise(r => req.addEventListener("success", async () => {
    db.result.close()
    r(req.result.map(entry => entry.handle))
  }))
}

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
      if ('serviceWorker' in navigator && window.isSecureContext && WEBWRITER_ENVIRONMENT.backend !== "tauri") {
        const registration = await navigator.serviceWorker.register( // @ts-ignore
          import.meta.env.MODE === 'production' ? '/bundleservice.js' : '/dev-sw.js?dev-sw', // @ts-ignore
          { type: WEBWRITER_ENVIRONMENT.engine.name === "Gecko"? "classic": "module", scope: "/" }
        )
        const worker = registration.installing
        if(worker) {
          await Promise.race([
            new Promise(resolve => worker.addEventListener("statechange", e => worker.state === "activated"? resolve: null)),
            new Promise(r => setTimeout(r, 3000))
          ])
        }
      }
      const userSettings = await SettingsController.getUserSettings()
      this.store = StoreController(new RootStore({settings: userSettings, corePackages: CORE_PACKAGES, initializePackages: true, apiBase: "https://api.webwriter.app/ww/v1/"}), this)
      this.settings = new SettingsController(this, this.store)
      this.localization = new LocalizationController(this, this.store)
      this.commands = new CommandController(this as any, this.store)
      this.notifications = new NotificationController(this, this.store)
      window.addEventListener("beforeunload", e => {
        if(this.store.document.changed) {
          e.preventDefault()
          return ""
        }
      })
      if(WEBWRITER_ENVIRONMENT.engine.name === "Blink") {
        const localHandles = await getAllLocalHandles()
        const localPermissions = await Promise.all(localHandles.map(handle => (handle as any).queryPermission({mode: "readwrite"})))
        if(localPermissions.some((perm: any) => perm !== "granted")) {
          const button = document.createElement("button")
          button.textContent = "Load local packages"
          button.id = "load-local"
          button.title = "It is neccessary to re-grant permissions for each local package folder ONCE due to the way your browser works."
          document.body.append(button)
          await new Promise(r => button.addEventListener("click", async () => {
            await Promise.all(localHandles.map(handle => (handle as any).requestPermission({mode: "readwrite"})))
            r(undefined)
          }))
          button.remove()
        } 
      }
      await this.store.packages.load()
      this.requestUpdate()
      this.initializing = false
      document.body.classList.add("loaded")
      resolve(undefined)
    })
	}
}