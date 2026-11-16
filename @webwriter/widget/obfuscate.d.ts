/** A JSON value as text that does not show it. Not encryption: the key is part of the text. */
export declare function obfuscate(value: unknown): string;
/**
 * The value of `obfuscate()`. Plain JSON is accepted too, so that a solution
 * can be written by hand; it is obfuscated the next time the value is written.
 * Undefined for anything else.
 */
export declare function reveal(text: string | null | undefined): unknown;
/** True for text that `obfuscate()` made. False for plain JSON. */
export declare function isObfuscated(text: string | null | undefined): boolean;
/** An attribute converter with the shape Lit expects. */
export type ObfuscatedConverter<T = unknown> = {
    fromAttribute(text: string | null): T | undefined;
    toAttribute(value: T | null | undefined): string | null;
};
/**
 * Keeps a value obfuscated in an attribute. For a reflected Lit property:
 * `solution: {converter: obfuscated, reflect: true}`. Without Lit:
 * `reveal(host.getAttribute("solution"))` and `host.setAttribute("solution", obfuscate(value))`.
 * It is obfuscation, not encryption.
 */
export declare const obfuscated: ObfuscatedConverter;
