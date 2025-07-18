import { msg } from "@lit/localize";
import { html, ReactiveController, ReactiveControllerHost, TemplateResult } from "lit";
import { ZodSchema, z } from "zod";

import {
  Locale,
  RootStore,
  StoreKey,
  SubStoreKey,
} from "#model";
import { allLocales, ViewModelMixin } from "#viewmodel";
import {
  FileAccount,
  LLMAccount,
  PocketbaseAccount,
} from "#model/schemas/account.js"

console.log(allLocales)

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

  static get languageOptions() {
    return {
      "om": { label: msg("Oromo") },
      "ab": { label: msg("Abkhazian") },
      "aa": { label: msg("Afar") },
      "af": { label: msg("Afrikaans") },
      "sq": { label: msg("Albanian") },
      "am": { label: msg("Amharic") },
      "ar": { label: msg("Arabic") },
      "hy": { label: msg("Armenian") },
      "as": { label: msg("Assamese") },
      "ay": { label: msg("Aymara") },
      "az": { label: msg("Azerbaijani") },
      "ba": { label: msg("Bashkir") },
      "eu": { label: msg("Basque") },
      "bn": { label: msg("Bengali") },
      "dz": { label: msg("Bhutani") },
      "bh": { label: msg("Bihari") },
      "bi": { label: msg("Bislama") },
      "br": { label: msg("Breton") },
      "bg": { label: msg("Bulgarian") },
      "my": { label: msg("Burmese") },
      "be": { label: msg("Byelorussian") },
      "km": { label: msg("Cambodian") },
      "ca": { label: msg("Catalan") },
      "zh": { label: msg("Chinese") },
      "co": { label: msg("Corsican") },
      "hr": { label: msg("Croatian") },
      "cs": { label: msg("Czech") },
      "da": { label: msg("Danish") },
      "nl": { label: msg("Dutch") },
      "en": { label: msg("English") },
      "eo": { label: msg("Esperanto") },
      "et": { label: msg("Estonian") },
      "fo": { label: msg("Faeroese") },
      "fj": { label: msg("Fiji") },
      "fi": { label: msg("Finnish") },
      "fr": { label: msg("French") },
      "fy": { label: msg("Frisian") },
      "gl": { label: msg("Galician") },
      "ka": { label: msg("Georgian") },
      "de": { label: msg("German") },
      "el": { label: msg("Greek") },
      "kl": { label: msg("Greenlandic") },
      "gn": { label: msg("Guarani") },
      "gu": { label: msg("Gujarati") },
      "ha": { label: msg("Hausa") },
      "he": { label: msg("Hebrew") },
      "hi": { label: msg("Hindi") },
      "hu": { label: msg("Hungarian") },
      "is": { label: msg("Icelandic") },
      "id": { label: msg("Indonesian") },
      "ia": { label: msg("Interlingua") },
      "ie": { label: msg("Interlingue") },
      "ik": { label: msg("Inupiak") },
      "iu": { label: msg("Inuktitut") },
      "ga": { label: msg("Irish") },
      "it": { label: msg("Italian") },
      "ja": { label: msg("Japanese") },
      "jw": { label: msg("Javanese") },
      "kn": { label: msg("Kannada") },
      "ks": { label: msg("Kashmiri") },
      "kk": { label: msg("Kazakh") },
      "rw": { label: msg("Kinyarwanda") },
      "ky": { label: msg("Kirghiz") },
      "rn": { label: msg("Kirundi") },
      "ko": { label: msg("Korean") },
      "ku": { label: msg("Kurdish") },
      "lo": { label: msg("Laothian") },
      "la": { label: msg("Latin") },
      "lv": { label: msg("Latvian") },
      "ln": { label: msg("Lingala") },
      "lt": { label: msg("Lithuanian") },
      "mk": { label: msg("Macedonian") },
      "mg": { label: msg("Malagasy") },
      "ms": { label: msg("Malay") },
      "ml": { label: msg("Malayalam") },
      "mt": { label: msg("Maltese") },
      "mi": { label: msg("Maori") },
      "mr": { label: msg("Marathi") },
      "mo": { label: msg("Moldavian") },
      "mn": { label: msg("Mongolian") },
      "na": { label: msg("Nauru") },
      "ne": { label: msg("Nepali") },
      "no": { label: msg("Norwegian") },
      "oc": { label: msg("Occitan") },
      "or": { label: msg("Oriya") },
      "ps": { label: msg("Pashto") },
      "fa": { label: msg("Persian") },
      "pl": { label: msg("Polish") },
      "pt": { label: msg("Portuguese") },
      "pa": { label: msg("Punjabi") },
      "qu": { label: msg("Quechua") },
      "rm": { label: msg("Rhaeto-Romanian") },
      "ro": { label: msg("Romanian") },
      "ru": { label: msg("Russian") },
      "sm": { label: msg("Samoan") },
      "sg": { label: msg("Sangro") },
      "sa": { label: msg("Sanskrit") },
      "gd": { label: msg("Scots Gaelic") },
      "sr": { label: msg("Serbian") },
      "sh": { label: msg("Serbo-Croatian") },
      "st": { label: msg("Sesotho") },
      "tn": { label: msg("Setswana") },
      "sn": { label: msg("Shona") },
      "sd": { label: msg("Sindhi") },
      "si": { label: msg("Singhalese") },
      "ss": { label: msg("Siswati") },
      "sk": { label: msg("Slovak") },
      "sl": { label: msg("Slovenian") },
      "so": { label: msg("Somali") },
      "es": { label: msg("Spanish") },
      "su": { label: msg("Sudanese") },
      "sw": { label: msg("Swahili") },
      "sv": { label: msg("Swedish") },
      "tl": { label: msg("Tagalog") },
      "tg": { label: msg("Tajik") },
      "ta": { label: msg("Tamil") },
      "tt": { label: msg("Tatar") },
      "te": { label: msg("Telugu") },
      "th": { label: msg("Thai") },
      "bo": { label: msg("Tibetan") },
      "ti": { label: msg("Tigrinya") },
      "to": { label: msg("Tonga") },
      "ts": { label: msg("Tsonga") },
      "tr": { label: msg("Turkish") },
      "tk": { label: msg("Turkmen") },
      "tw": { label: msg("Twi") },
      "ug": { label: msg("Uigur") },
      "uk": { label: msg("Ukrainian") },
      "ur": { label: msg("Urdu") },
      "uz": { label: msg("Uzbek") },
      "vi": { label: msg("Vietnamese") },
      "vo": { label: msg("Volapuk") },
      "cy": { label: msg("Welch") },
      "wo": { label: msg("Wolof") },
      "xh": { label: msg("Xhosa") },
      "yi": { label: msg("Yiddish") },
      "yo": { label: msg("Yoruba") },
      "za": { label: msg("Zhuang") },
      "zu": { label: msg("Zulu") },
      "zh-Hans": { label: msg("Chinese (Simplified)") },
      "zh-Hant": { label: msg("Chinese (Traditional)") },
      "pt-PT": { label: msg("Portuguese") },
      "nb": { label: msg("Norwegian Bokmål") },
      "pt-BR": { label: msg("Portuguese (Brazil)") },
    }
  }

  static get specs(): Settings<RootStore, StoreKey> {
    return {
      ui: {
        locale: {
          schema: z
            .union(
              Object.entries(this.languageOptions).filter(([code]) => allLocales.includes(code)).map(([code, { label}]) =>
                z
                  .literal(code)
                  .describe(
                    `${label} (${Locale.getLanguageInfo(code.split("-")[0]).nativeName})`
                  )
              ) as any
            )
            .describe(
              msg("Language for the WebWriter interface and new documents")
            ),
          label: msg("Language"),
        },
        propagateLang: {
          schema: z
            .boolean()
            .describe(
              msg(
                "When the document language is changed, update all widgets' languages accordingly."
              )
            ),
          label: msg("Update language across document"),
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
        /*resetOnInitialize: {
          schema: z
            .boolean()
            .describe(
              msg(
                "Advanced: Reset all WebWriter data each time the page is loaded - for debugging purposes."
              )
            ),
          label: msg("Reset all app data on page load"),
        },*/

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
