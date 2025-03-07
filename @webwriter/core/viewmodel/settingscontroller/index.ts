import { msg } from "@lit/localize";
import { html, ReactiveController, ReactiveControllerHost, TemplateResult } from "lit";
import { ZodSchema, z } from "zod";

import {
  Locale,
  RootStore,
  StoreKey,
  SubStoreKey,
} from "#model";
import { ViewModelMixin } from "#viewmodel";
import {
  FileAccount,
  LLMAccount,
  PocketbaseAccount,
} from "#model/schemas/account.js"

type OmitFunctions<T> = Pick<
  T,
  {
    [K in keyof T]: T[K] extends Function ? never : K;
  }[keyof T]
>;

export type SettingSpec<T = any> = {
  schema: ZodSchema<T>;
  label?: string;
  advanced?: boolean;
  hidden?: boolean;
  confirmation?: TemplateResult
};

export const keymapSchema = z
  .record(z.object({ shortcut: z.string() }))
  .describe(msg("Keyboard shortcuts for commands"));

type StoreSettings<T> = T extends object
  ? {
      [P in keyof OmitFunctions<T>]?: {
        [Q in keyof OmitFunctions<T[P]>]?: SettingSpec<OmitFunctions<T[P]>[Q]>;
      };
    }
  : T;

type AnySettings = Record<string, Record<string, SettingSpec>>;

export type Settings<T = null, K extends keyof T = any> = T extends null
  ? AnySettings
  : StoreSettings<Pick<T, K>>;

export class SettingsController implements ReactiveController {
  host: InstanceType<ReturnType<typeof ViewModelMixin>>;
  store: RootStore;

  constructor(
    host: InstanceType<ReturnType<typeof ViewModelMixin>>,
    store: RootStore
  ) {
    this.store = store;
    (this.host = host).addController(this);
  }

  async hostConnected() {
    const userSettings = await SettingsController.getUserSettings();
    userSettings && this.store.rehydrate(userSettings);
    window.addEventListener("storage", async (e: StorageEvent) => {
      if(e.key?.startsWith("webwriter_")) {
        const userSettings = await SettingsController.getUserSettings()
        userSettings && this.store.rehydrate(userSettings)
      }
    });
  }
  hostDisconnected() {}

  static async getUserSettings() {
    return JSON.parse(localStorage.getItem("webwriter_settings") ?? "null");
  }

  static get specLabels(): Partial<Record<StoreKey, string>> {
    return {
      ui: msg("General"),
      document: msg("Document"),
      packages: msg("Packages")
    };
  }

  static get specs(): Settings<RootStore, StoreKey> {
    const languageOptions = [
      { code: "en", label: msg("English") },
      { code: "de", label: msg("German") },
      { code: "zh-hans", label: msg("Chinese (Simplified)") },
      { code: "es", label: msg("Spanish") },
      { code: "fr", label: msg("French") },
      { code: "pt-PT", label: msg("Portuguese") },
      { code: "ru", label: msg("Russian") },
      { code: "id", label: msg("Indonesian") },
      { code: "ja", label: msg("Japanese") },
      { code: "tr", label: msg("Turkish") },
      { code: "ko", label: msg("Korean") },
      { code: "it", label: msg("Italian") },
      { code: "bg", label: msg("Bulgarian") },
      { code: "cs", label: msg("Czech") },
      { code: "da", label: msg("Danish") },
      { code: "el", label: msg("Greek") },
      { code: "et", label: msg("Estonian") },
      { code: "fi", label: msg("Finnish") },
      { code: "hu", label: msg("Hungarian") },
      { code: "lt", label: msg("Lithuanian") },
      { code: "lv", label: msg("Latvian") },
      { code: "nb", label: msg("Norwegian Bokmål") },
      { code: "nl", label: msg("Dutch") },
      { code: "pl", label: msg("Polish") },
      { code: "ro", label: msg("Romanian") },
      { code: "sk", label: msg("Slovak") },
      { code: "sl", label: msg("Slovenian") },
      { code: "sv", label: msg("Swedish") },
      { code: "uk", label: msg("Ukrainian") },
      { code: "pt-BR", label: msg("Portuguese (Brazil)") },
    ];
    return {
      ui: {
        locale: {
          schema: z
            .union(
              languageOptions.map(({ code, label }) =>
                z
                  .literal(code)
                  .describe(
                    `${
                      Locale.getLanguageInfo(code.split("-")[0]).nativeName
                    } - ${label}`
                  )
              ) as any
            )
            .describe(
              msg("Language for the WebWriter interface and new documents")
            ),
          label: msg("Language"),
        },
        autosave: {
          schema: z
            .boolean()
            .describe(
              msg(
                "Backup changes to the current document automatically. Changes are restored when WebWriter is reloaded."
              )
            ),
          label: msg("Autosave"),
        },
        showSourceEditor: {
          schema: z
            .boolean()
            .describe(
              msg(
                "Advanced: Show source editing commands, e.g. to show the document's HTML or to add custom styles and scripts."
              )
            ),
          label: msg("Show source editing commands"),
        },
        hideIntro: {
          schema: z
            .boolean()
            .describe(
              msg(
                "Hide the introductory tour. Disable so the tour is shown again."
              )
            ),
          label: msg("Hide intro tour"),
        },
        resetOnInitialize: {
          schema: z
            .boolean()
            .describe(
              msg(
                "Advanced: Reset all WebWriter data each time the page is loaded - for debugging purposes."
              )
            ),
          label: msg("Reset all app data on page load"),
        },
        authoringAnalytics: {
          schema: z
            .boolean()
            .describe(
              msg(
                "Send telemetry data about your usage of WebWriter."
              )
            ),
          label: msg("Enable telemetry"),
          confirmation: html`
            <p>${msg("By enabling telemetry, you allow for data collection and retention according to our")} <a target="_blank" href="https://webwriter.app/privacy">${msg("privacy policy")}</a></p>
          `
        },
        /*showTextPlaceholder: {
          schema: z
            .boolean()
            .describe(msg("Show a placeholder text when a document is empty")),
          label: msg("Show placeholder text")
        },*/
        /*showWidgetPreview: {
          schema: z
            .boolean()
            .describe(msg("Show an instant preview when hovering over widgets in the palette")),
          label: msg("Show widget preview")
        },*/
        keymap: {
          schema: keymapSchema,
          label: msg("Keyboard shortcuts"),
          hidden: true,
        },
      },
      packages: {
        watching: {
          schema: z.record(z.string(), z.boolean()),
          hidden: true,
        },
        showUnstable: {
          schema: z
            .boolean()
            .describe(
              msg(
                "Advanced: Show packages with versions like 0.x.x in the package manager"
              )
            ),
          label: msg("Show unstable packages"),
        },
        showUnknown: {
          schema: z
            .boolean()
            .describe(
              msg(
                "Advanced: Show packages from unknown sources in the package manager (Warning: May be unsafe)"
              )
            ),
          label: msg("Show unknown packages"),
        },
      },
      accounts: {
        accounts: {
          schema: z.object({
            file: z.record(z.string(), FileAccount.schema),
            pocketbase: z.record(z.string(), PocketbaseAccount.schema),
            llm: z.record(z.string(), LLMAccount.schema),
          }) as any,
          hidden: true,
        },
      },
    };
  }

  static get settingsSchema() {
    return z.object(
      Object.fromEntries(
        Object.entries(this.specs).map(([sk, sv]) => [
          sk,
          z.object(
            Object.fromEntries(
              Object.entries(sv)
                .filter(([k, v]) => v)
                .map(([k, v]) => [k, v!.schema])
            )
          ),
        ])
      )
    );
  }

  get values() {
    return Object.fromEntries(
      Object.entries(SettingsController.specs).map(([sk, sv]) => [
        sk,
        Object.fromEntries(
          Object.entries(sv).map(([k, v]) => [
            k,
            this.store.get(sk as StoreKey, k as never),
          ])
        ),
      ])
    );
  }

  setAndPersist = <S extends StoreKey, K extends SubStoreKey<S>>(
    storeKey: S,
    key: K,
    value: RootStore[S][K]
  ) => {
    this.store.set(storeKey, key, value, SettingsController.settingsSchema);
  };

  persist = () => this.store.persist(SettingsController.settingsSchema);
}
