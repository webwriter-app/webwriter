import type {Signal} from "@angular/core"
import type {LocalizeCore, LocalizeOptions} from "@webwriter/widget/localize"
import type {ModuleRef} from "./base.js"

export {LOCALE_ALIASES, matchLocale, type LocalePreferences, type LocalizeErrorDetail, type LocalizeOptions} from "@webwriter/widget/localize"

export type LocalizeBinding = {
  readonly core: LocalizeCore
  readonly snapshot: ModuleRef<LocalizeCore>
  /** The locale the widget shows now. */
  readonly locale: Signal<string>
  setLocale(tag: string): Promise<void>
  getLocale(): string
  /** Settles when the catalog that was asked for last is in, or when its load failed. */
  readonly loaded: Promise<void>
  /**
   * The message of the loaded catalog by its id, or `fallback` (the source
   * text). Reactive: it re-renders the component when the language changes.
   * `values` fill the expressions of a catalog entry in the `@lit/localize` string form.
   */
  msg(id: string, fallback: string, ...values: unknown[]): string
}

/** Binds Localization: follows the widget's language. */
export function injectLocalize(options: LocalizeOptions): LocalizeBinding

/** `msg` for a child component of a widget: it answers in the widget's language and re-renders the component when it changes. Call it in an injection context. */
export function injectWidgetMsg(): (id: string, fallback: string, ...values: unknown[]) => string
