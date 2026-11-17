import { css, html } from "lit";
import { Viewport, type ViewportAdapter } from "@webwriter/lit/viewport";
import { ExampleElement } from "../shared/base";
import { TinyMap } from "./tiny-map";

const PLACES = [
    { x: 40, y: 60, name: "Aachen" },
    { x: 420, y: 30, name: "Berlin" },
    { x: 300, y: 260, name: "München" },
    { x: 120, y: 200, name: "Frankfurt" },
];

/**
 * A viewport that a library owns. The library keeps its engine and its input;
 * it adopts the wheel convention through its own option, and an adapter binds
 * the standard zoom buttons and the keys `+`, `−` and `0` to it.
 */
export class LibraryView extends ExampleElement {
    static properties = { locked: { type: Boolean, reflect: true } };

    static styles = css`
        :host { position: relative; display: block; height: 240px; border: 1px solid #c8c8c8; border-radius: 6px; overflow: hidden; font: 14px system-ui, sans-serif; }
        .map { position: absolute; inset: 0; overflow: hidden; background: #eff6ff; }
        .map:focus-visible { outline: 2px solid Highlight; outline-offset: -2px; }
        .corner { position: absolute; right: 10px; bottom: 10px; }
    `;

    /** No zooming with the buttons or the keys while set. */
    declare locked: boolean;

    /** The library instance, for the checks. */
    map: TinyMap | null = null;
    #adapter: ViewportAdapter | null = null;
    readonly viewport = new Viewport(this, { adapter: () => this.#adapter, can: () => !this.locked });

    constructor() {
        super();
        this.locked = false;
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.hasUpdated) this.#mount();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.map?.destroy();
        this.map = this.#adapter = null;
    }

    firstUpdated() {
        this.#mount();
    }

    /** Creates the library on its container, and the adapter: the library's own names behind the six the module asks for. */
    #mount() {
        const map = (this.map = new TinyMap(this.renderRoot.querySelector<HTMLElement>(".map")!, { places: PLACES, minZoom: 0.5, maxZoom: 3, ctrlWheelZoom: true }));
        this.#adapter = {
            get scale() {
                return map.getZoom();
            },
            min: map.minZoom,
            max: map.maxZoom,
            zoomBy: (factor) => map.setZoom(map.getZoom() * factor),
            fit: () => map.fitAll(),
            subscribe: (changed) => {
                map.on("zoom", changed);
                return () => map.off("zoom", changed);
            },
        };
        // The viewport asks for the adapter after a render.
        this.requestUpdate();
    }

    render() {
        return html`
            <div class="map" data-ww-viewport="external" aria-label="Map"></div>
            <div class="corner" data-ww-viewport-controls></div>
        `;
    }
}
customElements.define("ww-library-view", LibraryView);
