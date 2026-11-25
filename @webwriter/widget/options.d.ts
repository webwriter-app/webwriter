export type LocalizedText = string | Record<string, string>;
export interface OptionAvailability {
    hidden?: boolean;
    disabled?: boolean;
    disabledReason?: LocalizedText;
}
export interface OptionGroupDeclaration {
    label?: LocalizedText;
    description?: LocalizedText;
    collapsible?: boolean;
    collapsed?: boolean;
    advanced?: boolean;
}
interface BaseOptionDeclaration<TypeHint = any> extends OptionAvailability {
    attribute?: boolean | string;
    group?: string;
    readOnly?: boolean;
    unit?: string;
    type?: TypeHint;
    label?: LocalizedText;
    placeholder?: LocalizedText;
    description?: LocalizedText;
}
export interface BooleanOptionDeclaration extends BaseOptionDeclaration<BooleanConstructor | "boolean"> {
    control?: "checkbox" | "switch";
    /** An attribute-backed option is true when its negative attribute is absent. */
    inverted?: boolean;
}
/** A boolean widget capability shown under Edit in element distribution permissions. */
export interface PermissionDeclaration extends Pick<BooleanOptionDeclaration, "label" | "description" | "hidden" | "disabled" | "disabledReason" | "readOnly"> {
    attribute?: string;
}
interface InputOptionDeclaration<TypeHint = any> extends BaseOptionDeclaration<TypeHint> {
    pattern?: string;
    minlength?: number;
    maxlength?: number;
    autocapitalize?: "none" | "characters" | "words" | "sentences";
    spellcheck?: "true" | "false";
    autocomplete?: HTMLInputElement["autocomplete"];
    inputmode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
}
export interface StringOptionDeclaration extends InputOptionDeclaration<StringConstructor | "string"> {
    /** Show a language picker for a BCP 47 tag. */
    control?: "language";
    multiline?: boolean;
}
export interface NumberOptionDeclaration extends InputOptionDeclaration<NumberConstructor | "number"> {
    control?: "input" | "range" | "duration";
    steps?: number[];
    min?: number;
    max?: number;
    step?: number;
}
export interface DateOptionDeclaration extends InputOptionDeclaration<"date"> {
    min?: number;
    max?: number;
    step?: number;
}
export interface DatetimeLocalOptionDeclaration extends InputOptionDeclaration<"datetime-local"> {
    min?: number;
    max?: number;
    step?: number;
}
export interface EmailOptionDeclaration extends InputOptionDeclaration<"email"> {
}
export interface PasswordOptionDeclaration extends InputOptionDeclaration<"password"> {
}
export interface TelOptionDeclaration extends InputOptionDeclaration<"tel"> {
}
export interface TimeOptionDeclaration extends InputOptionDeclaration<"time"> {
}
export interface UrlOptionDeclaration extends InputOptionDeclaration<"url"> {
}
export interface ObjectOptionDeclaration extends BaseOptionDeclaration<ObjectConstructor | "object" | ArrayConstructor | "array"> {
}
export type MediaOptionKind = "image" | "audio" | "video";
export interface MediaOptionDeclaration extends BaseOptionDeclaration<"media"> {
    media?: MediaOptionKind;
    accept?: string;
}
export type RequestMediaDetail = {
    media?: MediaOptionKind;
    accept?: string;
    resolve: (value: string | null) => void;
};
/** Asks an enclosing WebWriter editor to pick or supply a media URL for a widget. */
export declare function requestMedia(host: Element, options?: {
    media?: MediaOptionKind;
    accept?: string;
}): Promise<string | null>;
export interface ColorOptionDeclaration extends BaseOptionDeclaration<"color"> {
    swatches?: string[];
}
export type SelectOptionChoice = {
    value: string;
    label?: LocalizedText;
    description?: LocalizedText;
    children?: never;
} | {
    label?: LocalizedText;
    children: SelectOptionChoice[];
    value?: never;
};
export interface ReferenceOptionDeclaration extends BaseOptionDeclaration<"reference"> {
    selector?: string;
    excludeSelf?: boolean;
}
export interface SelectOptionDeclaration extends BaseOptionDeclaration<"select"> {
    control?: "select" | "radio" | "segmented" | "tree";
    multiple?: boolean;
    options?: SelectOptionChoice[];
}
export type OptionDeclaration = BooleanOptionDeclaration | StringOptionDeclaration | NumberOptionDeclaration | DateOptionDeclaration | DatetimeLocalOptionDeclaration | EmailOptionDeclaration | PasswordOptionDeclaration | TelOptionDeclaration | TimeOptionDeclaration | UrlOptionDeclaration | ObjectOptionDeclaration | ColorOptionDeclaration | MediaOptionDeclaration | SelectOptionDeclaration | ReferenceOptionDeclaration;
export interface ActionDeclaration extends OptionAvailability {
    /** Native chooser input; the action method receives transient File[]. */
    input?: {
        type: "file";
        accept?: string;
        multiple?: boolean;
    };
    group?: string;
    /** Joins adjacent visible actions with the same ID within an option group. */
    buttonGroup?: string;
    icon?: string;
    intent?: "default" | "danger";
    confirm?: LocalizedText;
    label?: LocalizedText;
    placeholder?: LocalizedText;
    description?: LocalizedText;
}
/** A key of a conversion map that names a file format: an extension such as `.json`. */
export type FileExtensionKey = `.${string}`;
/** A key of a conversion map that names a file format: a concrete media type such as `image/png`. */
export type MediaTypeKey = `${string}/${string}`;
/** A key of a conversion map that names a file format. Every other key is the lowercase tag of an HTML element. */
export type FileFormatKey = FileExtensionKey | MediaTypeKey;
/** What a file import prepares: a function that applies the result, or `null`/`false` to decline. */
export type FileImportResult = (() => void) | null | false;
/** `convertFrom`, tag key: receives a detached fragment with a copy of the source element and sets the widget's content. Returns nothing or `true`, or `false` to decline. */
export type ElementImportHandler<Widget = any> = (this: Widget, fragment: DocumentFragment) => void | boolean;
/** `convertFrom`, file key: receives one file. Throws or rejects with a localized `Error` for a bad file. */
export type FileImportHandler<Widget = any> = (this: Widget, file: File) => FileImportResult | Promise<FileImportResult>;
/** `convertTo`, tag key: returns a detached element, or a detached fragment of sibling elements of that tag, or `null` to decline. */
export type ElementExportHandler<Widget = any> = (this: Widget) => Element | DocumentFragment | null;
/** `convertTo`, file key: returns a file with the declared extension or media type, or `null`/`false` to decline. */
export type FileExportHandler<Widget = any> = (this: Widget) => File | null | false | Promise<File | null | false>;
/** A handler, or the name of a method of the widget. */
type Handler<Function> = Function | string;
/**
 * What a widget accepts. A key that is a file extension (`.json`) or a media type (`image/png`) names a file
 * format; every other key is the lowercase tag of a native HTML element (`ul`).
 */
export interface ConvertFromDeclarations<Widget = any> {
    [format: FileExtensionKey]: Handler<FileImportHandler<Widget>>;
    [format: MediaTypeKey]: Handler<FileImportHandler<Widget>>;
    [tag: string]: Handler<ElementImportHandler<Widget>> | Handler<FileImportHandler<Widget>>;
}
/**
 * What a widget produces. A key that is a file extension (`.json`) or a media type (`text/plain`) names a file
 * format; every other key is the lowercase tag of a native HTML element (`ul`).
 */
export interface ConvertToDeclarations<Widget = any> {
    [format: FileExtensionKey]: Handler<FileExportHandler<Widget>>;
    [format: MediaTypeKey]: Handler<FileExportHandler<Widget>>;
    [tag: string]: Handler<ElementExportHandler<Widget>> | Handler<FileExportHandler<Widget>>;
}
export {};
