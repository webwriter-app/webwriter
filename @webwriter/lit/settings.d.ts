import type { LitElement } from "lit";
import { SettingsCore, type EditorOption, type SettingsDeclarations, type SettingsOptions, type SettingValues } from "@webwriter/widget/settings";
export type { EditorOption, GeneratedOption, SettingDeclaration, SettingsDeclarations, SettingsMessages, SettingText, SettingValue, SettingValues } from "@webwriter/widget/settings";
type Constructor<T = object> = new (...args: any[]) => T;
/** What the mixin adds to a widget, besides one property per setting. */
export type SettingsHost = {
    /** The core: `set(name, value)` writes a setting as one undo step, `labelOf(name)` gives its label in the widget's language. */
    readonly settingsCore: SettingsCore;
    /** The editor's option declarations: the class's `static options` and one per setting. */
    readonly options: Record<string, EditorOption>;
};
/**
 * Options of the mixin: those of the core that a widget chooses. A boolean
 * that defaults to true is declared to the editor with its negative attribute
 * and `inverted: true`; `negativeBooleans: "property"` declares it with
 * `attribute: false` instead, for an editor that does not know `inverted`.
 */
export type SettingsMixinOptions = Pick<SettingsOptions, "entryTimeout" | "negativeBooleans" | "messages">;
/**
 * Settings for a Lit widget. Each declared setting becomes a reflected
 * reactive property, an entry of the editor's `options` and the source of the
 * controls marked `data-ww-setting="name"`. Pass the declarations to the
 * mixin, which also types the properties, choices as unions:
 *
 *     class Sim extends Settings(LitElementWw, {
 *         population: {type: Number, default: 200, min: 10, max: 2000},
 *         showChart: {type: Boolean, default: true},      // stored as no-show-chart, declared with inverted: true
 *     }) {}
 *
 * A label, description or placeholder may be a function of the widget, for a
 * text from the widget's own catalog. The editor reads it again when it changes:
 *
 *     speed: {type: Number, label: (widget: {msg: MsgFn}) => widget.msg("Speed")}
 *
 * `static settings = {…}` on a class that extends `Settings(LitElementWw)`
 * does the same, but TypeScript then needs a `declare` for every property.
 */
export declare function Settings<Base extends Constructor<LitElement>, const S extends SettingsDeclarations = {}>(base: Base, declarations?: S, options?: SettingsMixinOptions): Base & Constructor<SettingsHost & SettingValues<S>> & {
    settings?: SettingsDeclarations;
};
