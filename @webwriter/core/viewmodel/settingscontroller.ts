import { msg } from "@lit/localize";
import { ReactiveController, ReactiveControllerHost } from "lit";
import { ZodSchema, z } from "zod";

import {
  Environment,
  Locale,
  Package,
  RootStore,
  StoreKey,
  SubStoreKey,
} from "../model";
import { App } from "../view";
import { ViewModelMixin } from ".";
import {
  FileAccount,
  LLMAccount,
  NpmAccount,
  PocketbaseAccount,
} from "../model/schemas/accounts";
import { autorun, observe, reaction, when } from "mobx";

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
    if (!this.host.store.packages.apiBase) {
      const { join, appDir } = this.host.environment.api.Path;
      const { exists, writeFile } = this.host.environment.api.FS;
      const path = await join(await appDir(), "settings.json");
      if (!(await exists(path))) {
        await this.persist();
      }
      this.host.environment.api.watch(path, async () => {
        const userSettings = await SettingsController.getUserSettings(
          this.host.environment.api
        );
        this.store.rehydrate(userSettings);
      });
    } else {
      const userSettings = await SettingsController.getUserSettings();
      userSettings && this.store.rehydrate(userSettings);
      window.addEventListener("storage", async () => {
        const userSettings = await SettingsController.getUserSettings();
        userSettings && this.store.rehydrate(userSettings);
      });
    }
  }
  hostDisconnected() {}

  static async getUserSettings(environment?: Environment) {
    if (environment) {
      const path = await environment.Path.join(
        await environment.Path.appDir(),
        "settings.json"
      );
      if (await environment.FS.exists(path)) {
        try {
          const str = (await environment.FS.readFile(path)) as string;
          const rawSettings = JSON.parse(str);
          return this.settingsSchema.parse(rawSettings);
        } catch (err) {
          console.error(err);
        }
      }
    } else {
      return JSON.parse(localStorage.getItem("webwriter_settings") ?? "null");
    }
  }

  static get specLabels(): Partial<Record<StoreKey, string>> {
    return {
      ui: msg("General"),
      document: msg("Document"),
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
      },
      accounts: {
        accounts: {
          schema: z.object({
            file: z.record(z.string(), FileAccount.schema),
            pocketbase: z.record(z.string(), PocketbaseAccount.schema),
            npm: z.record(z.string(), NpmAccount.schema),
            // @meeting
            openai: z.record(z.string(), OpenAIAccount.schema),
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
                .map(([k, v]) => [k, v.schema])
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
