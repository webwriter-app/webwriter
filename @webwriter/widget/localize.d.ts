import { ModuleCore } from "./base.js";
import { type LocalePreferences } from "./locale.js";
export { LOCALE_ALIASES, matchLocale, type LocalePreferences } from "./locale.js";
/** A generated catalog module of `@lit/localize`: message id → translated template. */
export type Catalog = {
    templates: Record<string, unknown>;
};
/** Options of `LocalizeCore`. */
export type LocalizeOptions = {
    sourceLocale: string;
    targetLocales: readonly string[];
    /** Imports the catalog of a target locale, for example `(locale) => import(`./generated/${locale}.js`)`. */
    load: (locale: string) => Promise<Catalog>;
    /** The widget's own choices among its locales, tried before the likely script and region: `{pt: "pt-PT"}`. */
    prefer?: LocalePreferences;
    /**
     * Send `optionschange` after a language change, so that the editor reads the
     * widget's declarations again. Needed only when drawer labels are computed
     * with `msg`. Labels written as localized text maps are resolved by the editor.
     */
    drawer?: boolean;
};
/** The state of `LocalizeCore`. */
export type LocalizeSnapshot = {
    /** One of the configured locales. */
    readonly locale: string;
    /** The catalog of `locale`. Undefined for the source locale. */
    readonly templates: Catalog["templates"] | undefined;
};
/** `detail` of the `localizationerror` event: the locale whose catalog could not be loaded. */
export type LocalizeErrorDetail = {
    locale: string;
    error: unknown;
};
/** Dispatched by a component inside a widget to get the widget's localizer. `detail.provide(core)` answers. */
export declare const LOCALIZE_REQUEST = "ww-localizerequest";
/** The event of `LOCALIZE_REQUEST`. */
export type LocalizeRequest = CustomEvent<{
    provide(core: LocalizeCore): void;
}>;
/**
 * The language of one widget instance: the matched locale and its catalog.
 *
 * - `setLocale(tag)` accepts any language tag. Until the catalog is in, the
 *   widget keeps the language it had; the first paint is in the source language.
 * - A catalog is loaded once per widget class. One that arrives after another
 *   language was asked for is dropped.
 * - A failed load is reported with a `localizationerror` event on the host
 *   (`detail: {locale, error}`) and is not cached. It is tried again with the
 *   next `setLocale()`, when the browser comes back online, and the widget
 *   takes the catalog over as soon as another instance of its class loaded it.
 * - With `drawer`, a change is followed by an `optionschange` event.
 */
export declare class LocalizeCore extends ModuleCore<LocalizeSnapshot> {
    #private;
    constructor(host: HTMLElement, options: LocalizeOptions);
    getSnapshot(): LocalizeSnapshot;
    /** The locale the widget shows now. */
    getLocale(): string;
    /**
     * Settles when the catalog that was asked for last is in, or when its load
     * failed. Already settled when nothing is loading. A widget that must not
     * paint in the source language first awaits it before its first render.
     */
    get loaded(): Promise<void>;
    /**
     * Asks for the language of a tag. Resolves when the widget shows it, when
     * its load failed (see `localizationerror`), or when another language was
     * asked for meanwhile. Never rejects.
     */
    setLocale(tag: string): Promise<void>;
    protected onConnect(): void;
}
