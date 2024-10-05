export * from "./packagestore"
export * from "./documentstore"
export * from "./uistore"

import { ZodSchema } from "zod"
import merge from "lodash.merge"

import { Package, PackageStore, DocumentStore, UIStore, createEditorStateConfig } from ".."
import { Environment } from "../environment"
import { AccountStore } from "./accountstore"

type StoreOptions<T extends abstract new (...args: any) => any> = ConstructorParameters<T>[0]

type AllOptions = StoreOptions<typeof PackageStore> & StoreOptions<typeof DocumentStore> & {settings: any, initializePackages?: boolean}
type OmitFunctions<T> = Pick<T, {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T]>
export type StoreKey = typeof RootStore["storeKeys"][number]
export type SubStoreKey<S extends StoreKey> = keyof RootStore[S]
type StoreSlice<T extends object> = {
  [P in keyof OmitFunctions<T>]?: {
    [Q in keyof OmitFunctions<T[P]>]?: OmitFunctions<T[P]>[Q]
  }
}

export class RootStore {

  static readonly storeKeys = ["packages", "document", "accounts", "ui"] as const

  packages: PackageStore
  document: DocumentStore
  accounts: AccountStore
  ui: UIStore

  FS: Environment["FS"]
  Path: Environment["Path"]
  Dialog: Environment["Dialog"]

  constructor({corePackages, apiBase, FS, Path, Shell, HTTP, OS, Dialog, bundle, search, pm, watch, getSystemFonts, createWindow, setWindowCloseBehavior, getWindowLabel, checkUpdate, installUpdate, settings, initializePackages}: AllOptions) {
    const onBundleChange = this.onBundleChange
    this.FS = FS
    this.Path = Path
    this.Dialog = Dialog
    this.ui = new UIStore({...settings?.ui})
    this.packages = new PackageStore({...settings?.packages, corePackages, FS, Path, Shell, HTTP, OS, Dialog, bundle, search, pm, watch, onBundleChange, getSystemFonts, createWindow, setWindowCloseBehavior, getWindowLabel, checkUpdate, installUpdate, initializePackages, apiBase})
    this.accounts = new AccountStore({FS, Path, Shell, HTTP, OS, Dialog, bundle, search, pm, watch, getSystemFonts, createWindow, setWindowCloseBehavior, getWindowLabel, checkUpdate, installUpdate, }, settings?.accounts.accounts)
    this.document = new DocumentStore({...settings?.document, lang: this.ui.locale, defaultAccount: this.accounts.getAccount("file")}, {FS, Path, Shell, HTTP, OS, Dialog, bundle, search, pm, watch, getSystemFonts, createWindow, setWindowCloseBehavior, getWindowLabel, checkUpdate, installUpdate}, this.accounts)
  }

  onBundleChange = (packages: Package[]) => {
    this.document.updateSchema(createEditorStateConfig(packages).schema)
  }

  get<S extends StoreKey, K extends keyof RootStore[S]>(storeKey: S, key: K) {
    return (this as RootStore)[storeKey][key]
  }

  set<S extends StoreKey, K extends SubStoreKey<S>>(storeKey: S, key: K, value: RootStore[S][K], persistWithSchema?: ZodSchema<StoreSlice<RootStore>>) {
    (this as RootStore)[storeKey][key] = value
    persistWithSchema && this.persist(persistWithSchema)
  }

  async rehydrate(userSettings: StoreSlice<RootStore> | undefined) {
    Object.entries((userSettings ?? {}) as any)
      .flatMap(([sk, sv]) => Object.entries(sv as any).map(([k, v]) => [sk, k, v]))
      .forEach(([sk, k, v]) => this.set(sk as any, k as any, v))
  }

  async persist(schema: ZodSchema<StoreSlice<RootStore>>, settingsPath?: string) {
    try {
      const settings = schema.parse(this)
      const contents = JSON.stringify(settings, undefined, 2)
      if(WEBWRITER_ENVIRONMENT.backend === "tauri") {
        const {appDir, join} = this.Path
        const path = settingsPath ?? await join(await appDir(), "settings.json")
        await this.FS.writeFile(path, contents)
      }
      else {
        localStorage.setItem("webwriter_settings", contents)
      }
    }
    catch(cause: any) {
      throw new Error(`Could not save settings on file system: ${cause}`, {cause})
    }
  }
}