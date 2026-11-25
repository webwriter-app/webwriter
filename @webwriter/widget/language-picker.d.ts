declare const HTMLElementBase: typeof HTMLElement;
/** A language selector. An empty value represents an inherited language. */
export declare class LanguagePicker extends HTMLElementBase {
    #private;
    static observedAttributes: string[];
    constructor();
    get label(): string;
    set label(value: string);
    get value(): string;
    set value(value: string);
    get placeholder(): string;
    set placeholder(value: string | undefined);
    get disabled(): boolean;
    set disabled(value: boolean);
    connectedCallback(): void;
    attributeChangedCallback(name: string, before: string | null, after: string | null): void;
}
/**
 * Registers `<ww-language-picker>` for use from HTML or a framework.
 * Use `label`, `value`, `placeholder` and `disabled` and listen for `change`.
 */
export declare function defineLanguagePicker(): void;
declare global {
    interface HTMLElementTagNameMap {
        "ww-language-picker": LanguagePicker;
    }
}
export {};
