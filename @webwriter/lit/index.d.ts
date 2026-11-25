import { LitElement, type PropertyDeclaration } from "lit";
import type * as WidgetOptions from "@webwriter/widget";
import { WidgetRuntime, type WidgetDataContext, type Declared, type LocalizedText, type ActionDeclaration, type OptionGroupDeclaration, type PermissionDeclaration, type ConvertFromDeclarations, type ConvertToDeclarations } from "@webwriter/widget";
export { isDataBlockType, requestMedia, resolveDeclarations, type Declared, type DeclaredFlag, type DeclaredText, type WidgetDataContext, type WidgetDataMode, type LocalizedText, type OptionAvailability, type OptionGroupDeclaration, type PermissionDeclaration, type SelectOptionChoice, type ActionDeclaration, type MediaOptionKind, type RequestMediaDetail, type ConvertFromDeclarations, type ConvertToDeclarations, type FileExtensionKey, type MediaTypeKey, type FileFormatKey, type ElementImportHandler, type FileImportHandler, type FileImportResult, type ElementExportHandler, type FileExportHandler } from "@webwriter/widget";
export * from "@lit-labs/signals";
export { isNumber, isString, isBoolean, isSeries, isTable, hasShape, effectAccepts, type Table, type Series, type SignalShape, type SignalShapes, type SignalValue, type SignalDeclaration, type EffectDeclaration, type ReadableSignal } from "@webwriter/widget";
export { WidgetDrawer, type WidgetStorageDestination } from "./widget-drawer";
export { renderWidgetOptionField, renderWidgetOptions } from "./widget-option-controls";
export { widgetOptionControlStyles } from "./widget-option-controls.styles";
export * from "./widget-options";
export { BrowserWidgetResultStorage, HttpWidgetResultStorage, WidgetResultConflict, widgetResultEndpoint } from "./widget-result-storage";
export type { WidgetResult, WidgetResultStorage, WidgetResultType, StoredWidgetResult } from "./widget-result-storage";
/** Lit options also accept Lit reactive property configuration. */
type LitOption<T extends {
    type?: unknown;
}> = T & Omit<PropertyDeclaration<NonNullable<T["type"]>>, "type" | "attribute">;
export interface BooleanOptionDeclaration extends LitOption<WidgetOptions.BooleanOptionDeclaration> {
}
export interface StringOptionDeclaration extends LitOption<WidgetOptions.StringOptionDeclaration> {
}
export interface NumberOptionDeclaration extends LitOption<WidgetOptions.NumberOptionDeclaration> {
}
export interface DateOptionDeclaration extends LitOption<WidgetOptions.DateOptionDeclaration> {
}
export interface DatetimeLocalOptionDeclaration extends LitOption<WidgetOptions.DatetimeLocalOptionDeclaration> {
}
export interface EmailOptionDeclaration extends LitOption<WidgetOptions.EmailOptionDeclaration> {
}
export interface PasswordOptionDeclaration extends LitOption<WidgetOptions.PasswordOptionDeclaration> {
}
export interface TelOptionDeclaration extends LitOption<WidgetOptions.TelOptionDeclaration> {
}
export interface TimeOptionDeclaration extends LitOption<WidgetOptions.TimeOptionDeclaration> {
}
export interface UrlOptionDeclaration extends LitOption<WidgetOptions.UrlOptionDeclaration> {
}
export interface ObjectOptionDeclaration extends LitOption<WidgetOptions.ObjectOptionDeclaration> {
}
export interface ColorOptionDeclaration extends LitOption<WidgetOptions.ColorOptionDeclaration> {
}
export interface MediaOptionDeclaration extends LitOption<WidgetOptions.MediaOptionDeclaration> {
}
export interface ReferenceOptionDeclaration extends LitOption<WidgetOptions.ReferenceOptionDeclaration> {
}
export interface SelectOptionDeclaration extends LitOption<WidgetOptions.SelectOptionDeclaration> {
}
export type OptionDeclaration = BooleanOptionDeclaration | StringOptionDeclaration | NumberOptionDeclaration | DateOptionDeclaration | DatetimeLocalOptionDeclaration | EmailOptionDeclaration | PasswordOptionDeclaration | TelOptionDeclaration | TimeOptionDeclaration | UrlOptionDeclaration | ObjectOptionDeclaration | ColorOptionDeclaration | MediaOptionDeclaration | SelectOptionDeclaration | ReferenceOptionDeclaration;
export interface LitElementWw {
    get options(): Record<string, OptionDeclaration> | undefined;
    get actions(): Record<string, ActionDeclaration> | undefined;
    /** Per-instance editor declarations, including empty maps, override static maps. */
    get permissions(): Record<string, PermissionDeclaration> | undefined;
    /** The signals this widget publishes by name. Publish read-only `computed` signals and keep each instance stable. */
    get signals(): Record<string, WidgetOptions.ReadableSignal<any>> | undefined;
    /** Per-instance effect declarations override the static map. */
    get effects(): Record<string, WidgetOptions.EffectDeclaration> | undefined;
    get optionGroups(): Record<string, OptionGroupDeclaration> | undefined;
    /** Per-instance conversions into the widget. They take precedence over the static map. */
    get convertFrom(): ConvertFromDeclarations<this> | undefined;
    /** Per-instance conversions out of the widget. They take precedence over the static map. */
    get convertTo(): ConvertToDeclarations<this> | undefined;
}
declare const LitElementWw_base: typeof LitElement & (new (...args: any[]) => import("@lit-labs/signals").SignalWatcherApi);
/** Optional WebWriter conveniences for Lit widgets. The authored DOM remains
 * authoritative; only registry, readiness, and notification state are retained. */
export declare class LitElementWw extends LitElementWw_base {
    #private;
    static scopedElements: Record<string, new (...parameters: any[]) => Element>;
    static readonly options: Record<string, Declared<OptionDeclaration>>;
    static readonly actions: Record<string, Declared<ActionDeclaration>>;
    static readonly permissions?: Record<string, Declared<PermissionDeclaration>>;
    /** What the widget says about each published signal, by name: its value shape, label and description. */
    static readonly signals?: Record<string, WidgetOptions.SignalDeclaration>;
    /** The effect attributes the widget can receive, each with the shapes it accepts. */
    static readonly effects?: Record<string, WidgetOptions.EffectDeclaration>;
    static readonly optionGroups: Record<string, Declared<OptionGroupDeclaration>>;
    /** What the widget accepts: a file extension or media type for a file, any other key is an HTML tag. */
    static readonly convertFrom?: ConvertFromDeclarations;
    /** What the widget produces: a file extension or media type for a file, any other key is an HTML tag. */
    static readonly convertTo?: ConvertToDeclarations;
    static readonly dataType: string | undefined;
    protected localize?: {
        getLocale: () => string;
        setLocale: (locale: string) => Promise<void>;
    };
    constructor();
    /** One native registry per concrete widget class, shared by its instances. */
    get registry(): CustomElementRegistry;
    protected createRenderRoot(): ShadowRoot;
    get editable(): boolean;
    /** Empty opts into local storage. A URL supplies the initial remote destination. */
    get standalone(): string | null;
    set standalone(value: string | null);
    /** An explicit lang="" stops inheritance. Inherited values stay off the DOM. */
    get lang(): string;
    set lang(value: string | null);
    static get observedAttributes(): string[];
    attributeChangedCallback(name: string, oldValue: string | null, value: string | null): void;
    get widgetRuntime(): WidgetRuntime;
    languageChanged(): void;
    get data(): string | null;
    set data(value: string | null);
    get dataType(): string | undefined;
    get dataReady(): boolean;
    /** Update the widget's presentation when the data scope changes. */
    protected dataPending(context: WidgetDataContext): void;
    protected dataChanged(value: string | null, context: WidgetDataContext): void;
    protected dataError(error: Error, context: WidgetDataContext): void;
    /** Updates a data block in place, preserving its identity and attributes. */
    setData(type: string, value: string, attrs?: LocalizedText): void;
    connectedCallback(): void;
    disconnectedCallback(): void;
}
