import type { LocalizedText } from "./index";
/** JSON-compatible option value, as shown and edited by the options panel. */
export type WidgetOptionValue = string | number | boolean | null | WidgetOptionValue[] | {
    [key: string]: WidgetOptionValue;
};
export declare const widgetOptionTypes: readonly ["boolean", "string", "number", "date", "datetime-local", "email", "password", "tel", "time", "url", "object", "array", "color", "select", "reference"];
export type WidgetOptionType = typeof widgetOptionTypes[number];
export declare const widgetOptionControls: readonly ["input", "range", "duration", "checkbox", "switch", "select", "radio", "segmented", "tree"];
export type WidgetOptionControl = typeof widgetOptionControls[number];
/** Hierarchy is presentation; only leaf values are stored. */
export type WidgetOptionTreeNode = {
    label: string;
    description?: string;
    value?: string;
    children?: WidgetOptionTreeNode[];
};
export type WidgetFileInput = {
    type: "file";
    accept?: string;
    multiple?: boolean;
};
/** File conversions accept literal extensions and concrete MIME types. */
export declare function isWidgetFileFormat(value: unknown): value is string;
export declare function matchesWidgetFileFormat(file: File, format: string): boolean;
/** Durations use numeric seconds, independent of the displayed time fields. */
export declare function formatWidgetDuration(value: number): string;
export declare function parseWidgetDuration(text: string): number | undefined;
type Availability = {
    hidden?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    disabledReason?: string;
};
export type WidgetOptionGroupState = {
    name: string;
    label: string;
    description?: string;
    collapsible?: boolean;
    collapsed?: boolean;
    advanced?: boolean;
};
declare global {
    interface DocumentEventMap {
        optionschange: Event;
    }
}
/** One option of the selected widget, normalized from a `LitElementWw`
 * `OptionDeclaration`. */
export type WidgetOptionState = Availability & {
    name: string;
    type: WidgetOptionType;
    label: string;
    description?: string;
    placeholder?: string;
    /** Reflected attribute, or null when the option is a property only. */
    attribute: string | null;
    value: WidgetOptionValue;
    inverted?: boolean;
    multiline?: boolean;
    min?: number;
    max?: number;
    step?: number;
    pattern?: string;
    minlength?: number;
    maxlength?: number;
    swatches?: string[];
    multiple?: boolean;
    group?: string;
    control?: WidgetOptionControl;
    unit?: string;
    steps?: number[];
    choices?: {
        value: string;
        label: string;
        description?: string;
    }[];
    tree?: WidgetOptionTreeNode[];
    selector?: string;
    excludeSelf?: boolean;
    referenceMissing?: boolean;
};
export type WidgetActionState = Omit<Availability, "readOnly"> & {
    name: string;
    label: string;
    description?: string;
    group?: string;
    buttonGroup?: string;
    icon?: string;
    intent?: "default" | "danger";
    confirm?: string;
    input?: WidgetFileInput;
    busy?: boolean;
    error?: string;
};
export type UnknownRecord = Record<string, unknown>;
export declare const isRecord: (value: unknown) => value is UnknownRecord;
/** Maps a declared type (a constructor or a type string) to an option type. */
export declare function widgetOptionType(type: unknown): WidgetOptionType;
/** Lit's default attribute name for a property: its lowercased name. */
export declare function widgetOptionAttribute(name: string, declaration: UnknownRecord): string | null;
/** Copies a value into plain JSON data, dropping anything that is not. */
export declare function widgetOptionValue(value: unknown, depth?: number): WidgetOptionValue;
export declare function widgetOptionGroupState(name: string, declaration: unknown, locale: string): WidgetOptionGroupState;
export declare const compatibleControl: (type: WidgetOptionType, control: unknown, multiple: unknown) => control is WidgetOptionControl;
export declare function widgetTreeLeaves(nodes: WidgetOptionTreeNode[]): {
    value: string;
    label: string;
    description?: string;
}[];
/** Normalizes one untrusted option declaration for the options panel. */
export declare function widgetOptionState(name: string, declaration: unknown, value: unknown, locale: string): WidgetOptionState;
export declare function widgetActionState(name: string, declaration: unknown, locale: string): WidgetActionState;
/** The attribute value Lit's default converters read back as `value`, or
 * null to remove the attribute. */
export declare function widgetOptionAttributeValue(type: WidgetOptionType, value: WidgetOptionValue, multiple?: boolean, inverted?: boolean): string | null;
export declare function localizedText(value: LocalizedText | undefined, locale: string): string | undefined;
/**
 * An instance map, including an empty map, takes precedence over its class map.
 * A text or a `hidden`, `disabled` or `readOnly` flag that is a function is asked
 * with the widget, for a widget that does not resolve its declarations itself.
 */
export declare function widgetDeclarations(widget: Element, kind: "options" | "actions" | "permissions" | "optionGroups" | "convertFrom" | "convertTo"): Record<string, unknown>;
export declare function widgetOptionDeclaration(widget: Element, name: string, declaration: unknown): unknown;
export declare function readWidgetOption(widget: Element, name: string, raw: unknown, locale: string): {
    hidden?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    disabledReason?: string;
    name: string;
    type: WidgetOptionType;
    label: string;
    description?: string;
    placeholder?: string;
    /** Reflected attribute, or null when the option is a property only. */
    attribute: string | null;
    inverted?: boolean;
    multiline?: boolean;
    min?: number;
    max?: number;
    step?: number;
    pattern?: string;
    minlength?: number;
    maxlength?: number;
    swatches?: string[];
    multiple?: boolean;
    group?: string;
    control?: WidgetOptionControl;
    unit?: string;
    steps?: number[];
    choices?: {
        value: string;
        label: string;
        description?: string;
    }[];
    tree?: WidgetOptionTreeNode[];
    selector?: string;
    excludeSelf?: boolean;
    referenceMissing?: boolean;
    value: WidgetOptionValue;
};
export declare function validWidgetOptionValue(option: WidgetOptionState, value: WidgetOptionValue, widget: Element): boolean;
/** Project candidates from the current scope without assigning authored IDs. */
export declare function widgetReferenceOption(widget: Element, option: WidgetOptionState, root: ParentNode, isWidget: (element: Element) => boolean, identityRoot?: ParentNode): {
    hidden?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    disabledReason?: string;
    name: string;
    type: WidgetOptionType;
    label: string;
    description?: string;
    placeholder?: string;
    /** Reflected attribute, or null when the option is a property only. */
    attribute: string | null;
    value: WidgetOptionValue;
    inverted?: boolean;
    multiline?: boolean;
    min?: number;
    max?: number;
    step?: number;
    pattern?: string;
    minlength?: number;
    maxlength?: number;
    swatches?: string[];
    multiple?: boolean;
    group?: string;
    control?: WidgetOptionControl;
    unit?: string;
    steps?: number[];
    tree?: WidgetOptionTreeNode[];
    selector?: string;
    excludeSelf?: boolean;
    referenceMissing?: boolean;
    choices: {
        value: string;
        label: string;
    }[];
} | WidgetOptionState;
export declare function widgetActionRows(actions: WidgetActionState[]): WidgetActionState[][];
export declare function widgetConversionMethod(widget: Element, declaration: unknown): Function | undefined;
export {};
