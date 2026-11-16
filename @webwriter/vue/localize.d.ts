import type {LocalizeCore, LocalizeOptions} from "@webwriter/widget/localize"

export {LOCALE_ALIASES, matchLocale, type LocalePreferences, type LocalizeErrorDetail, type LocalizeOptions} from "@webwriter/widget/localize"

export type MsgOptions = {
  /** The key in the catalog. Default: the source text. */
  id?: string
  /** The values a template with placeholders takes. */
  args?: readonly unknown[]
}

export type UseLocalize = {
  readonly core: LocalizeCore
  /** The locale the widget shows now. */
  readonly locale: string
  /** Settles when the catalog that was asked for last is in, or when its load failed. */
  readonly loaded: Promise<void>
  /** Accepts any language tag. Never rejects. */
  setLocale(tag: string): Promise<void>
  /** The translation of a message in the widget's language, or `source`. Call it in the render function. */
  msg(source: string, options?: MsgOptions): string
}

/** Localization for one widget instance. It follows the widget's language by itself. */
export function useLocalize(options: LocalizeOptions & {host?: HTMLElement}): UseLocalize
