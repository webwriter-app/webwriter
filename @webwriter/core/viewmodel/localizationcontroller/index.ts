import {ReactiveController, ReactiveControllerHost} from "lit"
import {configureLocalization } from "@lit/localize"

import {sourceLocale, targetLocales} from "./localization/generated/locales"
import { RootStore } from "#model"

const localizedTemplates = new Map(
  targetLocales.map((locale) => [locale, import(`./localization/generated/${locale}.ts`)])
);

export const {getLocale, setLocale} = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: async (locale: any) => localizedTemplates.get(locale)
})

export const allLocales = [sourceLocale, ...targetLocales]

export class LocalizationController implements ReactiveController {

  host: ReactiveControllerHost
	store: RootStore

  constructor(host: ReactiveControllerHost, store: RootStore) {
    this.store = store;
    (this.host = host).addController(this)
  }

  hostConnected() {
    const lang = navigator.languages.find(lang => allLocales.includes(lang))
		lang? this.store.set("ui", "locale", lang): null
  }

  hostDisconnected() {
    
  }

  async setLocale(locale: string) {
		if(locale !== document.documentElement.lang) {
			document.documentElement.lang = locale
			await setLocale(locale)
			this.host.requestUpdate()
		}
	}
}