import { LitElement, nothing } from "lit";
import { type WidgetActionState, type WidgetOptionGroupState, type WidgetOptionState, type WidgetOptionValue } from "./widget-options.js";
export { LanguagePicker, defineLanguagePicker } from "./language-picker.js";
export type WidgetOptionChangeDetail = {
    name: string;
    value: WidgetOptionValue;
};
export type WidgetOptionActionDetail = {
    name: string;
};
/** Renders one normalized option. Apply `widget-option-change` to the owning widget and supply its updated state. */
export declare class WidgetOptionField extends LitElement {
    static properties: {
        option: {
            attribute: boolean;
        };
    };
    static styles: import("lit").CSSResult[];
    option: WidgetOptionState | undefined;
    protected render(): typeof nothing | import("lit-html").TemplateResult<1>;
}
/** Renders options, actions and their groups for any host. The host handles the emitted changes and action requests. */
export declare class WidgetOptions extends LitElement {
    #private;
    static properties: {
        options: {
            attribute: boolean;
        };
        actions: {
            attribute: boolean;
        };
        groups: {
            attribute: boolean;
        };
    };
    static styles: import("lit").CSSResult[];
    options: WidgetOptionState[];
    actions: WidgetActionState[];
    groups: readonly WidgetOptionGroupState[];
    constructor();
    protected render(): typeof nothing | import("lit-html").TemplateResult<1>;
}
/**
 * Registers `<ww-option-field>`, `<ww-widget-options>`, and `<ww-language-picker>`.
 * The field takes an `option` property. The renderer takes `options`, `actions`
 * and `groups` properties. Listen for `widget-option-change` and
 * `widget-option-action` to apply changes and run actions on the owning widget.
 */
export declare function defineWidgetOptionElements(): void;
declare global {
    interface HTMLElementTagNameMap {
        "ww-option-field": WidgetOptionField;
        "ww-widget-options": WidgetOptions;
    }
    interface HTMLElementEventMap {
        "widget-option-change": CustomEvent<WidgetOptionChangeDetail>;
        "widget-option-action": CustomEvent<WidgetOptionActionDetail>;
    }
}
