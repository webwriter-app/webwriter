// The poll itself: a plain custom element on the shared runtime of
// @webwriter/widget, using only the core of the data-block helper.
import { withWidgetRuntime } from "@webwriter/widget";
import { JsonDataCore, type DataBlockKind } from "@webwriter/widget/data";
import { adoptStyles } from "@webwriter/widget/styles";

/** What the block holds: the reader's vote. */
export type Vote = { vote: string | null };

/**
 * A poll. The author writes the choices as `<data value="id">Text</data>`
 * children; a reader's vote is kept in the data block.
 */
export class Poll extends withWidgetRuntime(HTMLElement) {
    /** A vote belongs to a reader. A subclass that keeps one vote in the document says `"document"`. */
    static block: DataBlockKind = "participant";
    /** Collects a burst of votes into one write, if set (ms). */
    static debounce: number | undefined = undefined;

    /** Every value a snapshot from outside brought, for the checks. */
    readonly changes: Vote[] = [];
    readonly store = new JsonDataCore<Vote>(this, {
        defaults: { vote: null },
        validate: ({ vote }) => vote === null || typeof vote === "string",
        block: (this.constructor as typeof Poll).block,
        save: { debounce: (this.constructor as typeof Poll).debounce },
        changed: (value) => void this.changes.push(value),
    });
    #stop: (() => void) | undefined;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.addEventListener("click", (event) => this.#clicked(event));
        adoptStyles(root, `button[aria-pressed="true"] { font-weight: 700; border-color: Highlight; }`);
    }

    connectedCallback() {
        super.connectedCallback();
        this.store.connect();
        // The value, the mode and the authored choices can all change: render for each.
        const stops = [this.store.subscribe(() => this.#render()), this.widgetRuntime.subscribe(() => this.#render())];
        this.#stop = () => stops.forEach((stop) => stop());
        this.#render();
    }

    disconnectedCallback() {
        this.#stop?.();
        this.store.disconnect();
        super.disconnectedCallback();
    }

    #clicked(event: Event) {
        const button = (event.target as Element).closest("button");
        if (!button) return;
        // A block the widget could not read is only replaced when the reader says so.
        if (button.id === "discard") this.store.set({ vote: null }, { force: true });
        else this.store.set({ vote: button.value === this.store.get().vote ? null : button.value });
    }

    #render() {
        const { value, invalid } = this.store.getSnapshot();
        const choices = Array.from(this.querySelectorAll<HTMLDataElement>(":scope > data"), (choice) => {
            const button = document.createElement("button");
            button.value = choice.value;
            button.textContent = choice.textContent;
            button.setAttribute("aria-pressed", String(choice.value === value.vote));
            return button;
        });
        const notice = document.createElement("p");
        notice.hidden = !invalid;
        notice.append("The stored vote could not be read. ", Object.assign(document.createElement("button"), { id: "discard", textContent: "Discard it" }));
        this.shadowRoot!.replaceChildren(...choices, notice);
        this.store.refresh();
    }
}
