export * from "./packagestore"
export * from "./documentstore"
export * from "./uistore"

import { ZodSchema } from "zod"
import merge from "lodash.merge"

import { Package, PackageStore, DocumentStore, UIStore, createEditorStateConfig } from ".."
import { Environment } from "../environment"

type StoreOptions<T extends abstract new (...args: any) => any> = ConstructorParameters<T>[0]

type AllOptions = StoreOptions<typeof PackageStore> & StoreOptions<typeof DocumentStore>
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

  static readonly storeKeys = ["packages", "document", "ui"] as const

  packages: PackageStore
  document: DocumentStore
  ui: UIStore

  FS: Environment["FS"]
  Path: Environment["Path"]
  Dialog: Environment["Dialog"]

  constructor({corePackages, schema, FS, Path, Shell, HTTP, OS, Dialog, bundle, search, pm, watch, getSystemFonts, createWindow, setWindowCloseBehavior, getWindowLabel}: AllOptions) {
    const onBundleChange = this.onBundleChange
    this.FS = FS
    this.Path = Path
    this.Dialog = Dialog
    this.packages = new PackageStore({corePackages, FS, Path, Shell, HTTP, OS, Dialog, bundle, search, pm, watch, onBundleChange, getSystemFonts, createWindow, setWindowCloseBehavior, getWindowLabel})
    this.document = new DocumentStore({schema, bundle})
    this.ui = new UIStore()
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

  async rehydrate(schema: ZodSchema<StoreSlice<RootStore>>, settingsPath?: string) {
    const {appDir, join} = this.Path
    const path = settingsPath ?? await join(await appDir(), "settings.json")
    if(await this.FS.exists(path)) {
      try {
        const contents = await this.FS.readFile(path) as string
        const defaults = schema.parse(this)
        const settings = schema.parse(merge(defaults, JSON.parse(contents)))
        Object.entries(settings)
          .flatMap(([sk, sv]) => Object.entries(sv).map(([k, v]) => [sk, k, v])) // @ts-ignore
          .forEach(([sk, k, v]) => this.set(sk, k, v))
      }
      catch(cause: any) {
        throw new Error(`Could not load settings from file system: ${cause}`, {cause})
      }
    }
  }

  async persist(schema: ZodSchema<StoreSlice<RootStore>>, settingsPath?: string) {
    const {appDir, join} = this.Path
    const path = settingsPath ?? await join(await appDir(), "settings.json")
    try {
      const settings = schema.parse(this)
      const contents = JSON.stringify(settings, undefined, 2)
      await this.FS.writeFile(path, contents)
    }
    catch(cause: any) {
      throw new Error(`Could not save settings on file system: ${cause}`, {cause})
    }
  }
}