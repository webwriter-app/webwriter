import { html } from "lit";
import { Playback } from "@webwriter/lit/playback";
import { Shortcuts } from "@webwriter/lit/shortcuts";
import { ExampleElement } from "../shared/base";
import { bar, styles } from "./bar";

/**
 * A discrete run: every authored child is one step, and only the current one
 * is shown. Nothing is written to the children; the slot is assigned by hand.
 * In WebWriter the steps are editable content (`content: "p+"` in the package's
 * editing configuration).
 */
export class Stepper extends ExampleElement {
    static shadowRootOptions: ShadowRootInit = { ...ExampleElement.shadowRootOptions, slotAssignment: "manual" };
    static properties = { interval: { type: Number, reflect: true } };
    // The navigation keys need no button in the drawer: a hidden action keeps its key.
    static actions = {
        toggle: { label: { _: "Play or pause" }, shortcut: "Space" },
        next: { label: { _: "Next step" }, shortcut: ["ArrowRight", "PageDown"], hidden: true },
        previous: { label: { _: "Previous step" }, shortcut: ["ArrowLeft", "PageUp"], hidden: true },
        first: { label: { _: "First step" }, shortcut: "Home", hidden: true },
    };
    static styles = styles;

    /** Seconds per step. */
    declare interval: number;

    readonly shortcuts = new Shortcuts(this);
    readonly playback = new Playback(this, {
        steps: () => this.#steps.length,
        show: (index) => this.#show(index),
        interval: () => this.interval ?? 0.8,
    });

    /**
     * The steps are authored content, which an author changes in the editor. A step that is
     * added with the caret in it (a new paragraph) is shown at once, so the author sees what
     * is typed; after any other change the run is read again.
     */
    readonly #authored = new MutationObserver((records) => {
        const added = new Set(records.flatMap((record) => [...record.addedNodes]));
        const caret = this.ownerDocument.getSelection()?.anchorNode ?? null;
        const index = this.#steps.findIndex((step) => added.has(step) && step.contains(caret));
        if (index >= 0) this.playback.run("seek", index);
        this.requestUpdate();
    });

    get #steps(): Element[] {
        return [...this.children].filter((child) => child.localName !== "script");
    }

    connectedCallback() {
        super.connectedCallback();
        this.#authored.observe(this, { childList: true });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.#authored.disconnect();
    }

    #show(index: number) {
        const step = this.#steps[index];
        this.renderRoot.querySelector("slot")?.assign(...(step ? [step] : []));
    }

    toggle() {
        this.playback.run("toggle");
    }
    next() {
        this.playback.run("step");
    }
    previous() {
        this.playback.run("back");
    }
    first() {
        this.playback.run("seek", 0);
    }

    protected updated() {
        this.#show(this.playback.currentStep);
    }

    render() {
        const keys = (action: string) => this.shortcuts.labelsOf(action).join(" / ");
        return html`
            <div class="stage" tabindex="0"><slot></slot></div>
            ${bar}
            <p class="keys">${keys("previous")} · ${keys("toggle")} · ${keys("next")}</p>
        `;
    }
}
customElements.define("ww-stepper", Stepper);
