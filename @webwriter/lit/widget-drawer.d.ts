import { LitElement, nothing, type PropertyValues } from "lit";
import { type WidgetResultStorage } from "./widget-result-storage";
export type WidgetStorageDestination = {
    kind: "browser";
} | {
    kind: "http";
    url: string;
};
/** Opt-in settings, actions, conversions, and result storage for a widget.
 * Register this component in the widget's scoped registry and pass the widget. */
export declare class WidgetDrawer extends LitElement {
    static properties: {
        widget: {
            attribute: boolean;
        };
        storageFor: {
            attribute: boolean;
        };
    };
    static styles: import("lit").CSSResult[];
    widget?: HTMLElement;
    /** Override storage construction, for example to supply an authenticated fetch. */
    storageFor?: (destination: WidgetStorageDestination, key: string) => WidgetResultStorage;
    private target?;
    private observer?;
    private setting?;
    private identity?;
    private key?;
    private destination?;
    private draftKind;
    private draftUrl;
    private binding?;
    private defaults?;
    private status?;
    private running?;
    private actionError?;
    private fileSelection?;
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected willUpdate(changes: PropertyValues): void;
    private optionsChanged;
    private detach;
    private reset;
    private active;
    private get preferenceKey();
    private browserStorage;
    private endpoint;
    private sync;
    private bind;
    private chooseStorage;
    private applyStorage;
    private switchStorage;
    private message;
    private confirm;
    private locale;
    private option;
    private setOption;
    private action;
    private run;
    private invoke;
    private pick;
    private filePicked;
    private formats;
    private convert;
    private renderActions;
    private renderConversions;
    private renderStorage;
    protected render(): typeof nothing | import("lit-html").TemplateResult<1>;
}
