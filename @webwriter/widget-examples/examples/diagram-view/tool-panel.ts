import { css, html, nothing } from "lit";
import { Help } from "@webwriter/lit/help";
import { ExampleElement } from "../shared/base";

const TOOLS = [
    ["Select", "Select and move states"],
    ["State", "Add a state"],
    ["Arrow", "Add a transition"],
    ["Erase", "Delete the selection"],
    ["Undo", "Undo the last step"],
    ["Redo", "Redo the step"],
    ["Fit", "Show everything"],
];
const SHAPES = ["Circle", "Square", "Diamond", "Note", "Group frame"];

/** A stand-in for a component library's button: the control that is focused and read sits in its own shadow tree. */
class PanelButton extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `<style>button { height: 26px; font: inherit; }</style><button part="base"><slot></slot></button>`;
    }
}
if (!customElements.get("ww-panel-button")) customElements.define("ww-panel-button", PanelButton);

/**
 * The layouts Help has to find by itself: a toolbar as wide as the widget, a
 * column of small tools, two groups in one row, and a control that is a
 * custom element. `layout` picks which of them are rendered.
 */
export class ToolPanel extends ExampleElement {
    // The shadow root of a widget has its own registry of custom elements.
    static scopedElements = { "ww-panel-button": PanelButton };

    static properties = {
        layout: { type: String, reflect: true },
        dark: { type: Boolean, reflect: true },
    };

    static styles = css`
        :host { position: relative; display: grid; grid-template: auto 1fr / auto 1fr; height: 300px; border: 1px solid #c8c8c8; border-radius: 6px; overflow: hidden; background: white; color: #18181b; font: 13px system-ui, sans-serif; }
        :host([dark]) { background: #18181b; color: #fafafa; border-color: #3f3f46; }
        .bar { grid-column: 1 / -1; display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid #c8c8c8; }
        .bar button { flex: 1; min-width: 0; height: 26px; padding: 0; overflow: hidden; font: inherit; }
        .bar.groups button { flex: none; width: 44px; }
        .bar .spacer { flex: 1; }
        .shapes { display: flex; flex-direction: column; gap: 2px; padding: 6px; }
        .shapes button { width: 24px; height: 18px; padding: 0; font: 10px system-ui; }
        .canvas { grid-column: 2; position: relative; min-width: 0; min-height: 0; background: #f4f4f5; }
        .canvas.wide { grid-column: 1 / -1; }
        :host([dark]) .canvas { background: #27272a; }
        .run { position: absolute; right: 8px; bottom: 8px; }
    `;

    /** `row` (a toolbar as wide as the widget), `column`, `both`, or `groups` (two groups in one row). */
    declare layout: "row" | "column" | "both" | "groups";
    declare dark: boolean;

    readonly help = new Help(this);

    constructor() {
        super();
        this.layout = "both";
        this.dark = false;
    }

    render() {
        const { layout } = this;
        const tools = layout === "groups" ? TOOLS.slice(0, 3) : TOOLS;
        const column = layout === "column" || layout === "both";
        return html`
            <div class="bar ${layout === "groups" ? "groups" : ""}" role="toolbar">
                ${layout === "column" ? nothing : tools.map(([name, text]) => html`<button data-ww-help=${text}>${name}</button>`)}
                ${layout === "groups" || layout === "column" ? html`<span class="spacer"></span>` : nothing}
                ${layout === "groups" ? html`<button data-ww-help="Check the automaton">Test</button>` : nothing}
                <button data-ww-help-toggle data-ww-help="Help" aria-label="Help">?</button>
            </div>
            ${column ? html`<div class="shapes">${SHAPES.map((name) => html`<button data-ww-help=${name} aria-label=${name}>${name[0]}</button>`)}</div>` : nothing}
            <div class="canvas ${column ? "" : "wide"}" data-ww-help="Drag to move the states">
                <ww-panel-button class="run" data-ww-help="Run the word">Run</ww-panel-button>
            </div>
        `;
    }
}
customElements.define("ww-tool-panel", ToolPanel);
