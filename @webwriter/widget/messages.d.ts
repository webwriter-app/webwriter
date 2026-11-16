/** One message: a fixed text, or a function of its parameters that returns the text. */
export type Message = string | ((...parameters: never[]) => string);
/** A module's messages: one entry per text. The defaults are English. */
export type MessageTable<T> = {
    readonly [K in keyof T]: Message;
};
/** Translations of a table. An entry that is missing falls back to the English default. */
export type Catalog<T> = {
    readonly [K in keyof T]?: T[K];
};
/** Catalogs of a table by locale: `{de, "pt-BR": …}`. */
export type Catalogs<T> = {
    readonly [locale: string]: Catalog<T>;
};
/** Imports one catalog file: `() => import("./messages/drag/de.js")`. The file default-exports the catalog. */
export type CatalogLoader<T> = () => Promise<{
    readonly default: Catalog<T>;
}>;
/** The generated table of a module's catalog files: one loader per locale. */
export type CatalogLoaders<T> = {
    readonly [locale: string]: CatalogLoader<T>;
};
/** What `defineMessages()` takes per locale: a loader, or a catalog that is there at once. */
export type CatalogSources<T> = {
    readonly [locale: string]: Catalog<T> | CatalogLoader<T>;
};
/** A table with its catalogs, made by `defineMessages()`. */
export type MessageSource<T> = {
    readonly defaults: T;
    /** The locales that have a catalog, loaded or not. */
    readonly locales: readonly string[];
    /** The catalogs that have arrived, by locale. */
    readonly catalogs: Catalogs<T>;
    /**
     * Loads the catalog of one of `locales`, once for everything that uses the
     * table. Resolves to undefined for another locale. A failed load rejects
     * and is tried again by the next call.
     */
    load(locale: string): Promise<Catalog<T> | undefined>;
};
/**
 * The `messages` option of a module: entries that replace the module's own in
 * every language. A function is asked on every read, so that a widget can
 * answer with its own translated strings.
 */
export type MessagesOption<T> = Catalog<T> | (() => Catalog<T>);
/** `detail` of the `localizationerror` event: the locale whose catalog could not be loaded. */
export type MessagesErrorDetail = {
    locale: string;
    error: unknown;
};
/** The locale of the defaults. */
export declare const SOURCE_LOCALE = "en";
/**
 * Declares a module's messages: the English defaults and its catalogs. A
 * module passes the generated loaders of its catalog files, so that a catalog
 * is only loaded for a widget in that language:
 *
 *     import catalogs from "./messages/drag/catalogs.js"
 *     export const dragMessages = defineMessages<DragMessages>({…}, catalogs)
 *
 * A widget that declares a table of its own can also pass catalogs directly:
 * `defineMessages({…}, {de: {…}})`.
 */
export declare function defineMessages<T extends MessageTable<T>>(defaults: T, catalogs?: CatalogSources<T>): MessageSource<T>;
/**
 * The effective language of an element: that of its widget runtime, or the
 * `lang` of its nearest ancestor. Where that lookup ends at a shadow root
 * without an answer, it goes on from the root's host, so that a component
 * inside a widget and a widget inside a component have the language of what
 * is around them. An explicit `lang=""` ends the search. Empty if no language is set.
 */
export declare function languageOf(element: Element): string;
/** The locale of a table that answers for a language tag (`matchLocale`), or `en` for the defaults. */
export declare function messageLocale<T>(source: MessageSource<T>, language: string): string;
/**
 * The table for a language tag as it is now: the override, then the best
 * catalog if it has arrived, then the defaults. `loadMessages()` waits for the catalog.
 */
export declare function resolveMessages<T>(source: MessageSource<T>, language: string, override?: MessagesOption<T>): T;
/** Loads the catalog that answers for a language tag, then resolves to the table as `resolveMessages()` gives it. */
export declare function loadMessages<T>(source: MessageSource<T>, language: string, override?: MessagesOption<T>): Promise<T>;
/**
 * Calls `changed` when the effective language of an element (`languageOf`) may
 * have changed. Returns the function that stops it. A widget runtime reports
 * the language of its widget. A `lang` it does not look at can sit in any
 * shadow tree between the element and the document, and in the document if no
 * runtime watches it.
 */
export declare function followLanguage(element: Element, changed: () => void): () => void;
/**
 * The messages of one module instance, in the language of its widget:
 *
 *     #messages = new Messages(host, dragMessages, options.messages)
 *     onConnect() { this.cleanup(this.#messages.follow(() => this.refresh())) }
 *     … this.#messages.current.dropped(item, target)
 *
 * `current` always answers for the language the widget has at that moment.
 * The catalog of that language is loaded when it is first needed. Until it
 * has arrived the texts are the English defaults; a catalog that arrives
 * after the language changed again is not shown.
 */
export declare class Messages<T> {
    #private;
    constructor(host: Element, source: MessageSource<T>, override?: MessagesOption<T>);
    /** The widget's effective language tag (`languageOf`). Empty if none is set. */
    get language(): string;
    /** The locale that answers: one of the table's catalogs, or `en` for the defaults. */
    get locale(): string;
    /** False while the catalog of `locale` is still on its way, or could not be loaded: the texts are English then. */
    get loaded(): boolean;
    /**
     * The table to read texts from. The same object until the language changes
     * or its catalog arrives, unless the override is a function.
     */
    get current(): T;
    /**
     * Calls `changed` when another catalog answers for the widget's language,
     * and when the catalog of its language arrives. A core passes
     * `() => this.refresh()`, so that names and descriptions it wrote are
     * written again. Starts loading the catalog of the current language, and
     * tries a failed load again when the browser is back online. Returns the
     * function that stops following.
     */
    follow(changed: () => void): () => void;
}
