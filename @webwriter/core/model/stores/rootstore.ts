import { ZodSchema } from "zod"

import {Package, PackageStore, DocumentStore, UIStore, createEditorStateConfig, AIStore} from "#model"
import { AccountStore } from "#model/stores/accountstore.js"

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
  ai: AIStore

  constructor({corePackages, apiBase, settings, initializePackages}: AllOptions) {
    const onBundleChange = this.onBundleChange
    this.ui = new UIStore({...settings?.ui})
    this.packages = new PackageStore({...settings?.packages, corePackages, initializePackages, apiBase, resetOnInitialize: this.ui.resetOnInitialize, onBundleChange})
    this.accounts = new AccountStore(settings?.accounts?.accounts)
    this.document = new DocumentStore({...settings?.document, lang: this.ui.locale, defaultAccount: this.accounts.getAccount("file")}, this.accounts)
    this.ai = new AIStore();
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

  async persist(schema: ZodSchema<StoreSlice<RootStore>>) {
    try {
      const settings = schema.parse(this)
      const contents = JSON.stringify(settings, undefined, 2)
      localStorage.setItem("webwriter_settings", contents)
    }
    catch(cause: any) {
      throw new Error(`Could not save settings in local storage: ${cause}`, {cause})
    }
  }
}