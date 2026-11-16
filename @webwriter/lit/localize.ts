import type {ReactiveControllerHost} from "lit"
import type {MsgFn, MsgOptions, TemplateLike, TemplateMap} from "@lit/localize"
// The one import of @lit/localize that is not public interface: rendering a message from a given catalog.
import {runtimeMsg} from "@lit/localize/internal/runtime-msg.js"
import {LOCALIZE_REQUEST, LocalizeCore, type LocalizeOptions, type LocalizeRequest} from "@webwriter/widget/localize"
import {CoreController, type CoreHost} from "./base.js"

export {LOCALE_ALIASES, matchLocale, type LocalePreferences, type LocalizeErrorDetail, type LocalizeOptions} from "@webwriter/widget/localize"

/** What `localizer()` returns: the object `LitElementWw` expects in `this.localize`, with `msg`. */
export type Localizer = {
  /** The locale the widget shows now. */
  getLocale(): string
  /** Accepts any language tag. Resolves when the widget shows that language or its catalog could not be loaded; never rejects. */
  setLocale(tag: string): Promise<void>
  /** `msg()` of `@lit/localize`, answering in this widget's language. */
  msg: MsgFn
  /** Settles when the catalog that was asked for last is in, or when its load failed. */
  readonly loaded: Promise<void>
}

/**
 * Localization for one widget instance, for `this.localize` of `LitElementWw`,
 * which calls `setLocale()` with the widget's effective language:
 *
 *     localize = localizer(this, {sourceLocale, targetLocales, load: (locale) => import(`./generated/${locale}.js`)})
 *     msg = this.localize.msg
 *
 * The widget re-renders when its language changes. Keep `msg` typed as it is:
 * the `lit-localize` extraction finds a message by the type of the function
 * that is called.
 *
 * The first paint is in the source language, and the widget renders again when
 * its catalog is in. A widget that must not show the source language first
 * waits in Lit's own hook, because a controller cannot hold an update back:
 *
 *     protected async scheduleUpdate() {
 *         if(!this.hasUpdated) await this.localize.loaded
 *         return super.scheduleUpdate()
 *     }
 */
export function localizer(host: CoreHost, options: LocalizeOptions): Localizer {
  const {core} = new CoreController(host, () => new LocalizeCore(host, options))
  return {
    getLocale: () => core.getLocale(),
    setLocale: tag => core.setLocale(tag),
    msg: msgOf(() => core),
    get loaded() {
      return core.loaded
    },
  }
}

/** `msg()` that looks the message up in the catalog a core holds at the time of the call. */
function msgOf(core: () => LocalizeCore | undefined): MsgFn {
  return ((template: TemplateLike, options?: MsgOptions) => runtimeMsg(core()?.getSnapshot().templates as TemplateMap | undefined, template, options)) as MsgFn
}

/**
 * `msg` for a component inside a widget's shadow tree: `msg = widgetMsg(this)`.
 * It answers in the language of the surrounding widget and re-renders the
 * component when that language changes. Outside a widget it returns the source text.
 */
export function widgetMsg(host: ReactiveControllerHost & HTMLElement): MsgFn {
  let core: LocalizeCore | undefined
  let unsubscribe: (() => void) | undefined
  host.addController({
    hostConnected() {
      const detail: LocalizeRequest["detail"] = {provide: provided => (core = provided)}
      host.dispatchEvent(new CustomEvent(LOCALIZE_REQUEST, {detail, bubbles: true, composed: true}))
      unsubscribe = core?.subscribe(() => host.requestUpdate())
    },
    hostDisconnected() {
      unsubscribe?.()
      unsubscribe = core = undefined
    },
  })
  return msgOf(() => core)
}
