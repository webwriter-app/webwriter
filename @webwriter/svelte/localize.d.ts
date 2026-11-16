import type {LocalizeCore, LocalizeOptions} from "@webwriter/widget/localize"
import type {CoreStore} from "./base.js"

export {LOCALE_ALIASES, matchLocale, type LocalePreferences, type LocalizeErrorDetail, type LocalizeOptions, type LocalizeSnapshot} from "@webwriter/widget/localize"
export {widgetLanguage} from "@webwriter/widget"

/** The state is `{locale, templates}`. */
export type LocalizeStore = CoreStore<LocalizeCore> & Pick<LocalizeCore, "getLocale" | "setLocale"> & {
  /** Settles when the catalog that was asked for last is in, or when its load failed. */
  readonly loaded: Promise<void>
}

export function localizeStore(host: HTMLElement, options: LocalizeOptions): LocalizeStore
