import { LitElement } from "lit"

export * from "./commandcontroller"
export * from "./localizationcontroller"
export * from "./notificationcontroller"
export * from "./settingscontroller"
export * from "./storecontroller"
export * from "./environmentcontroller"
export * from "./iconcontroller"
export * from "./backupcontroller"

import {StoreController, EnvironmentController, CommandController, LocalizationController, NotificationController, SettingsController, IconController, BackupController} from "#viewmodel"
import { HTTPClient, PocketbaseAccount, RootStore } from "#model"
import { msg } from "@lit/localize"
import posthog from "posthog-js"
import { idle } from "#model/utility/index.js"

async function getAllLocalHandles(): Promise<FileSystemDirectoryHandle[]> {
  const db = indexedDB.open("webwriter")
  await new Promise(r => db.addEventListener("success", r))
  if(!db.result.objectStoreNames.contains("handles")) {
    return []
  }
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
  backups: BackupController

  initialized: Promise<void>
  initializing: boolean = false

	async connectedCallback() {
    this.initialized = new Promise(async resolve => {
      super.connectedCallback()
      this.initializing = true
      this.environment = new EnvironmentController(this)
      await this.environment.ready

      if(WEBWRITER_ENVIRONMENT.engine.name === "Gecko") {
        document.body.innerHTML = `<div style="text-align: center; padding: 2rem;">
          <p>Sorry! WebWriter is currently not supported in your browser for technical reasons. We are working to support all modern browsers. An up-to-date version of Chrome, Edge, or Safari should work.</p>
          <p>Entschuldigung! WebWriter wird aus technischen Gründen in Ihrem Browser bisher nicht unterstützt. Wir arbeiten daran, alle modernen Browser zu unterstützen. Bis dahin sollte eine aktuelle Version von Chrome, Edge oder Safari funktionieren.</p>
        </div>`
        return
      }
      if ('serviceWorker' in navigator && window.isSecureContext) {
        const registration = await navigator.serviceWorker.register( // @ts-ignore
          import.meta.env.MODE === 'production' ? '/index.service.js' : '/dev-sw.js?dev-sw', // @ts-ignore
          { type: WEBWRITER_ENVIRONMENT.engine.name === "Gecko"? "classic": "module", scope: "/" }
        )
        /*const worker = registration.installing
        if(worker) {
          await Promise.race([
            new Promise(resolve => worker.addEventListener("statechange", e => worker.state === "activated"? resolve: null)),
            new Promise(r => setTimeout(r, 3000))
          ])
        }*/
      }
      this.icons = new IconController(this)
      const userSettings = await SettingsController.getUserSettings()
      this.store = StoreController(new RootStore({settings: userSettings, corePackages: CORE_PACKAGES, initializePackages: true, apiBase: "https://node1.webwriter.elearn.rwth-aachen.de/ww/v1/"}), this)
      this.settings = new SettingsController(this, this.store)
      this.localization = new LocalizationController(this, this.store)
      this.commands = new CommandController(this as any, this.store)
      this.notifications = new NotificationController(this, this.store)
      this.backups = new BackupController(this as any, this.store)
      if(this.store.ui.authoringAnalytics) {
        await Promise.race([
          idle(15000),
          new Promise (r => posthog.init(
            'phc_V2cc746TcRUY7xTnU3YA2nLv95sCvHJEZ0A1laH8d2Q',
            { api_host: 'https://eu.i.posthog.com', loaded: r },
          ))
        ])
      }
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
      function getCookie(name: string) {
        function escape(s: string) { return s.replace(/([.*+?\^$(){}|\[\]\/\\])/g, '\\$1'); }
        var match = document.cookie.match(RegExp('(?:^|;\\s*)' + escape(name) + '=([^;]*)'));
        return match ? match[1] : null;
      }
      try {
        const cookie = getCookie("pb_auth")
        if(cookie) {
          const {token, record} = JSON.parse(decodeURIComponent(cookie))
          const exists = Boolean(this.store.accounts.getAccount("pocketbase", record.email))
          !exists && this.store.accounts.addAccount(new PocketbaseAccount({token, email: record.email, url: new URL(this.store.packages.apiBase).origin, model: record}))
        }
      }
      catch(err) {
        console.error("Error reading cookie", err)
      }
      await this.store.packages.initialize()
      const locationUrl = new URL(location.href)
      const src = locationUrl.searchParams.get("src")
      if(src) {
        await this.store.document.load(
          new URL(decodeURIComponent(src)),
          undefined,
          (new HTTPClient()) as any,
          undefined,
          false
        )
        locationUrl.searchParams.delete("src")
        history.replaceState({}, "", locationUrl)
      }
      if(!isSettings) {
        try {
          await this.backups.restore()
        }
        catch(err) {
          console.error(err)
        }
      }
      this.requestUpdate()
      this.initializing = false
      document.body.classList.add("loaded")
      resolve(undefined)
    })
	}
}