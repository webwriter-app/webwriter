import { msg } from "@lit/localize"
import {ReactiveController, ReactiveControllerHost} from "lit"
import { ZodSchema, z } from "zod"

import { Package, RootStore, StoreKey, SubStoreKey } from "../model"

type OmitFunctions<T> = Pick<T, {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T]>

export type SettingSpec<T=any> = {
  schema: ZodSchema<T>
  label?: string
  advanced?: boolean
  hidden?: boolean
}

export const keymapSchema = z
  .record(z.object({shortcut: z.string()}))
  .describe(msg("Keyboard shortcuts for commands"))

type StoreSettings<T> = T extends object? {
  [P in keyof OmitFunctions<T>]?: {
    [Q in keyof OmitFunctions<T[P]>]?: SettingSpec<OmitFunctions<T[P]>[Q]>
  }
}: T

type AnySettings = Record<string, Record<string, SettingSpec>>

export type Settings<T=null, K extends keyof T = any> = T extends null? AnySettings: StoreSettings<Pick<T, K>>  

export class SettingsController implements ReactiveController {

  host: ReactiveControllerHost
	store: RootStore

  constructor(host: ReactiveControllerHost, store: RootStore) {
    this.store = store;
    (this.host = host).addController(this)
  }

  async hostConnected() {
    await this.store.packages.initialized
    this.store.rehydrate(this.settingsSchema)
  }
  hostDisconnected() {}

  get specLabels(): Partial<Record<StoreKey, string>> {
    return {
      ui: msg("General"),
      resources: msg("Documents")
    }
  } 

	get specs(): Settings<RootStore, StoreKey> {
    return {
      ui: {
        locale: {
          schema: z.union([
              z.literal("en").describe("English - " + msg("English")),
              z.literal("de").describe("Deutsch - " + msg("German"))
            ])
            .describe(msg("Language for the WebWriter interface and new documents")),
          label: msg("Language")
        },
        showTextPlaceholder: {
          schema: z
            .boolean()
            .describe(msg("Show a placeholder text when a document is empty")),
          label: msg("Show placeholder text")
        },
        showWidgetPreview: {
          schema: z
            .boolean()
            .describe(msg("Show an instant preview when hovering over widgets in the palette")),
          label: msg("Show widget preview")
        },
        keymap: {
          schema: keymapSchema,
          label: msg("Keyboard shortcuts"),
          hidden: true
        }
      },
      packages: {
        watching: {
          schema: z.record(z.string(), z.boolean()),
          hidden: true
        },

      }
    }
  }

  get settingsSchema() {
    return z.object(Object.fromEntries(Object.entries(this.specs).map(([sk, sv]) => [
      sk,
      z.object(Object.fromEntries(Object.entries(sv).filter(([k, v]) => v).map(([k, v]) => [
        k,
        v.schema
      ])))
    ])))
  }

	get values() {
    return Object.fromEntries(Object.entries(this.specs).map(([sk, sv]) => [
      sk,
      Object.fromEntries(Object.entries(sv).map(([k, v]) => [
        k,
        this.store.get(sk as StoreKey, k as never)
      ]))
    ]))
  }

  setAndPersist = <S extends StoreKey, K extends SubStoreKey<S>>(storeKey: S, key: K, value: RootStore[S][K]) => {
    this.store.set(storeKey, key, value, this.settingsSchema)
  }
}