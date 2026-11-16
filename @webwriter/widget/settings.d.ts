import { ModuleCore, type CoreOptions } from "./base.js";
import { type MessagesOption } from "./messages.js";
import { type SettingsMessages } from "./messages/settings/index.js";
import type { LocalizedText, OptionDeclaration } from "./options.js";
export { settingsMessages, type SettingsMessages } from "./messages/settings/index.js";
/** What a setting can hold. A selection of several choices is a list of their values. */
export type SettingValue = string | number | boolean | readonly string[];
/**
 * A text of a setting: fixed, a map by language, or a function that is asked
 * with the widget whenever the text is shown. The function is for a widget
 * that keeps its texts in its own catalog; type the parameter by what is read:
 * `(widget: {msg: MsgFn}) => widget.msg("Speed")`.
 */
export type SettingText = LocalizedText | ((widget: never) => LocalizedText | undefined);
/** One choice of a `select` setting, or a branch of choices. A leaf without a label shows its value. */
export type SettingChoice = {
    readonly value?: string;
    readonly label?: SettingText;
    readonly description?: SettingText;
    readonly children?: readonly SettingChoice[];
};
/** The value types of the editor's option declaration that a setting can hold: all but objects and arrays. */
export type SettingType = Exclude<NonNullable<OptionDeclaration["type"]>, ObjectConstructor | ArrayConstructor | "object" | "array">;
/** The fields of a setting that this module reads. */
export type SettingFields = {
    /** Default `String`. */
    readonly type?: SettingType;
    /** The value while the attribute is absent. Never written to the document. */
    readonly default?: SettingValue;
    readonly label?: SettingText;
    readonly description?: SettingText;
    readonly placeholder?: SettingText;
    readonly group?: string;
    /** Limits of a number. A value outside is moved to the nearest limit. */
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    /** The only values a number may take. Another value is moved to the nearest one. */
    readonly steps?: readonly number[];
    /** The choices of a `select`. With `multiple`, the value is a list of them. */
    readonly options?: readonly SettingChoice[];
    readonly multiple?: boolean;
    /** The editor's control. `"duration"` makes a number a time in seconds, shown as `m:ss`. */
    readonly control?: "checkbox" | "switch" | "select" | "radio" | "segmented" | "input" | "range" | "duration" | "tree";
    readonly unit?: string;
    readonly multiline?: boolean;
    /** Limits of a text. A text that does not fit is refused. */
    readonly pattern?: string;
    readonly minlength?: number;
    readonly maxlength?: number;
    /** Suggested colors of a `color` setting. */
    readonly swatches?: readonly string[];
    /**
     * Default: the name in kebab case, with `no-` in front for a boolean that
     * defaults to true. Such a boolean is always stored by the presence of
     * its attribute meaning false, also under a name given here.
     */
    readonly attribute?: string;
    /**
     * Turns the setting off: return true, or the reason as text. It receives
     * the widget; type the parameter by what is read, `(widget: {population: number}) => …`.
     */
    readonly disabled?: (widget: never) => boolean | LocalizedText | null | undefined;
};
/**
 * One setting. `type`, `default`, `attribute` and `disabled` are read by this
 * module. The other named fields are also used to validate the value and to
 * set up a bound control. Every field except `default` and `disabled`, also
 * one this module does not know, is passed to the editor's option declaration
 * as it is. A text that is a function is passed as its answer for the widget.
 */
export type SettingDeclaration = SettingFields & {
    readonly [passedThrough: string]: unknown;
};
/** The settings of a widget: one declaration per name. */
export type SettingsDeclarations = Readonly<Record<string, SettingDeclaration>>;
type Leaf<C> = C extends {
    children: readonly (infer Child)[];
} ? Leaf<Child> : C extends {
    value: infer Value extends string;
} ? Value : never;
type Choice<D> = D extends {
    options: readonly (infer C)[];
} ? ([Leaf<C>] extends [never] ? string : Leaf<C>) : string;
type Plain<D> = D extends {
    type: BooleanConstructor | "boolean";
} ? boolean : D extends {
    type: NumberConstructor | "number";
} ? D extends {
    steps: readonly (infer Step extends number)[];
} ? Step : number : D extends {
    type: "select";
    multiple: true;
} ? readonly Choice<D>[] : D extends {
    type: "select";
} ? Choice<D> : string;
/**
 * The property types of a settings declaration. A setting without a default
 * may be undefined, except a boolean and a list. Declarations that are passed
 * to the Lit mixin as a literal give choices as unions.
 */
export type SettingValues<S> = {
    -readonly [Name in keyof S]: S[Name] extends {
        default: SettingValue;
    } | {
        type: BooleanConstructor | "boolean";
    } | {
        type: "select";
        multiple: true;
    } ? Plain<S[Name]> : Plain<S[Name]> | undefined;
};
/** How a setting is stored and validated. */
export type SettingKind = "boolean" | "number" | "string" | "list";
/** The kind of a declaration: `list` is a `select` with `multiple`, `string` everything that is not a boolean or a number. */
export declare function settingKind(declaration: SettingDeclaration): SettingKind;
/** The value while the attribute is absent: `default`, or false for a boolean, an empty list for a list and no value otherwise. */
export declare function settingDefault(declaration: SettingDeclaration): SettingValue | undefined;
/** The attribute of a setting: `attribute`, or the name in kebab case, with `no-` in front for a boolean that defaults to true. */
export declare function settingAttribute(name: string, declaration: SettingDeclaration): string;
/** The leaves of the declared choices, in their order, through every branch. */
export declare function settingChoices(declaration: SettingDeclaration): SettingChoice[];
/** Whether two values of a setting are the same. Lists are compared item by item. */
export declare function sameSetting(a: SettingValue | undefined, b: SettingValue | undefined): boolean;
/**
 * The value a setting takes for any input: a number is moved inside `min` and
 * `max` and onto `steps`, and `fallback` is returned for a value of the wrong
 * type, outside the listed choices or against the limits of a text. `null`,
 * `undefined` and `""` reset to the default, as in the editor.
 */
export declare function normalizeSetting(declaration: SettingDeclaration, value: unknown, fallback?: SettingValue | undefined): SettingValue | undefined;
/**
 * The value for an attribute as it is in the document. A value that does not
 * fit gives the default, and a list keeps the items that are listed. The
 * attribute itself is never corrected.
 */
export declare function parseSetting(declaration: SettingDeclaration, attribute: string | null): SettingValue | undefined;
/** The attribute value, or null for "no attribute": the default is never written. A list is written as JSON. */
export declare function serializeSetting(declaration: SettingDeclaration, value: unknown): string | null;
/** Picks the text for a language: the exact tag, then the language, then `_`. */
export declare function localized(text: LocalizedText | undefined, locale: string): string | undefined;
/** Seconds as `m:ss` or `h:mm:ss`, with a fraction if there is one: the form the editor's duration control shows. */
export declare function formatDuration(seconds: number): string;
/** The seconds of `90`, `1:30` or `1:00:00`, with or without a fraction. Undefined for anything else. */
export declare function parseDuration(text: string): number | undefined;
/** Options of `SettingsCore`. */
export type SettingsOptions = CoreOptions & {
    /** Default: the host class's `static settings`. */
    declarations?: SettingsDeclarations;
    /** Resolves when the widget has rendered a change. Lit: `() => host.updateComplete`. Keeps the undo step of an entry open until then. */
    rendered?: () => Promise<unknown>;
    /**
     * How long an entry in a bound control may rest before its undo step is
     * closed without a `change` event, in milliseconds. Default 5000.
     */
    entryTimeout?: number;
    /**
     * How a boolean that is stored as a negative attribute is declared to the
     * editor. `"inverted"` (the default) generates the attribute with
     * `inverted: true`: the editor writes the negative attribute itself.
     * `"property"` generates `attribute: false`, so that the editor sets the
     * property and the widget reflects it, for an editor without `inverted`.
     */
    negativeBooleans?: "property" | "inverted";
    messages?: MessagesOption<SettingsMessages>;
};
/** The state of `SettingsCore`. */
export type SettingsSnapshot = {
    readonly values: Readonly<Record<string, SettingValue | undefined>>;
    /** The settings that are turned off, with the reason where one was given. */
    readonly disabled: Readonly<Record<string, LocalizedText | true>>;
};
/** An option declaration of the editor: `OptionDeclaration` of this package. */
export type EditorOption = OptionDeclaration;
/** One option as `editorOptions()` generates it: the declaration, whether it is turned off, and always its attribute. */
export type GeneratedOption = OptionDeclaration & {
    attribute: string | false;
};
/**
 * Settings: each declared setting is one attribute on the host. The core reads
 * and writes that attribute, generates the editor's `options` from the
 * declarations and binds the form controls marked `data-ww-setting="name"` in
 * the shadow root. A binding adds the properties of its library on top; a
 * host without one calls `defineProperties()`.
 *
 * An element marked `data-ww-setting-label="name"` shows the label of the
 * setting in the widget's language while the template leaves it empty, and
 * `data-ww-setting-label="name=value"` the label of one choice.
 */
export declare class SettingsCore extends ModuleCore<SettingsSnapshot> {
    #private;
    constructor(host: HTMLElement, options?: SettingsOptions);
    /** The declarations: the `declarations` option, or the host class's `static settings`. */
    get declarations(): SettingsDeclarations;
    /** The widget's language: the nearest `lang`, through shadow roots. Empty if none is set. */
    get language(): string;
    /** The current value, read from the attribute. */
    get(name: string): SettingValue | undefined;
    /**
     * Writes the attribute, as one undo step. Returns false for a value the
     * setting refuses, which changes nothing. A setting that is turned off by
     * `disabled` still takes a write from code.
     */
    set(name: string, value: unknown): boolean;
    /** True, or the reason, while the setting's `disabled` function turns it off. */
    disabledOf(name: string): LocalizedText | boolean;
    /** The label of a setting, or of one of its choices, in the widget's language. Without a declared label it is the name or the value. */
    labelOf(name: string, choice?: string): string;
    /**
     * The editor's option declarations (`options` on the widget). Each names
     * its attribute. A boolean that defaults to true is stored by its negative
     * attribute and declared with `inverted: true` (see the `negativeBooleans`
     * option for the other form).
     */
    editorOptions(): Record<string, GeneratedOption>;
    /**
     * Defines one accessor per setting on `target`, backed by the attribute.
     * For hosts whose library does not make the properties itself.
     */
    defineProperties(target?: object): void;
    getSnapshot(): SettingsSnapshot;
    protected onConnect(): void;
    protected onRefresh(): void;
}
