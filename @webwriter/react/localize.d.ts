import type {LocalizeOptions} from "@webwriter/widget/localize"

export {LOCALE_ALIASES, matchLocale, type LocalePreferences, type LocalizeErrorDetail, type LocalizeOptions} from "@webwriter/widget/localize"

/**
 * React binding of Localize. The widget follows the `lang` of the document
 * around it. The first render is in the source language; the component renders
 * again when the catalog is in.
 */
export function useLocalize(host: HTMLElement, options: LocalizeOptions): {
  /** The locale the widget shows now. */
  readonly locale: string
  /** Settles when the catalog that was asked for last is in, or when its load failed. */
  readonly loaded: Promise<void>
  /** Accepts any language tag. Never rejects. */
  setLocale(tag: string): Promise<void>
  /** A message of the generated catalog by its explicit id; `source` is the fallback, `values` fill the placeholders of a `str` message. */
  msg(id: string, source: string, values?: readonly unknown[]): string
}

/**
 * `msg` for the component of a widget that sits inside the shadow tree of
 * another widget and does not bind Localize itself. It answers in the language
 * of the surrounding widget and renders the component again when that language
 * changes. Outside a widget it returns the source text.
 */
export function useWidgetMsg(host: HTMLElement): (id: string, source: string, values?: readonly unknown[]) => string
