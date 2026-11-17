// A stand-in for a library that owns its viewport, such as vis-network,
// Cytoscape or Leaflet. It knows nothing about the modules: it builds its own
// elements, keeps its own transform, handles its own input and has its own
// names for everything. Only `index.ts` knows both sides.

/** A place on the map, in the library's own coordinates. */
export type Place = { x: number; y: number; name: string };

/** Options of `TinyMap`. */
export type TinyMapOptions = {
    places: Place[];
    minZoom?: number;
    maxZoom?: number;
    /** Zoom on Ctrl or ⌘ plus wheel and pan on a plain wheel, instead of zooming on every wheel event. */
    ctrlWheelZoom?: boolean;
};

/** A pannable, zoomable map of dots. */
export class TinyMap {
    readonly minZoom: number;
    readonly maxZoom: number;
    #container: HTMLElement;
    #layer: HTMLElement;
    #places: Place[];
    #zoom = 1;
    #offset = { x: 0, y: 0 };
    #handlers = new Set<() => void>();
    #abort = new AbortController();

    constructor(container: HTMLElement, options: TinyMapOptions) {
        this.#container = container;
        this.#places = options.places;
        this.minZoom = options.minZoom ?? 0.5;
        this.maxZoom = options.maxZoom ?? 3;
        this.#layer = container.appendChild(document.createElement("div"));
        this.#layer.style.cssText = "position: absolute; left: 0; top: 0; transform-origin: 0 0;";
        for (const place of this.#places) {
            const dot = this.#layer.appendChild(document.createElement("span"));
            dot.textContent = place.name;
            dot.style.cssText = `position: absolute; left: ${place.x}px; top: ${place.y}px; padding: 2px 6px; border-radius: 10px; background: #1d4ed8; color: white; font: 12px system-ui; white-space: nowrap;`;
        }
        const signal = this.#abort.signal;
        container.addEventListener(
            "wheel",
            (event) => {
                event.preventDefault();
                if (!options.ctrlWheelZoom || event.ctrlKey || event.metaKey) this.setZoom(this.#zoom * Math.exp(-event.deltaY * 0.002));
                else this.#move(this.#offset.x - event.deltaX, this.#offset.y - event.deltaY);
            },
            { signal, passive: false },
        );
        this.fitAll();
    }

    /** The number of `zoom` handlers, for the checks. */
    get handlerCount(): number {
        return this.#handlers.size;
    }

    getZoom(): number {
        return this.#zoom;
    }

    /** Sets the zoom about the centre of the container, within the limits. */
    setZoom(zoom: number): void {
        const next = Math.min(Math.max(zoom, this.minZoom), this.maxZoom);
        if (next === this.#zoom) return;
        const centre = { x: this.#container.clientWidth / 2, y: this.#container.clientHeight / 2 };
        const world = { x: (centre.x - this.#offset.x) / this.#zoom, y: (centre.y - this.#offset.y) / this.#zoom };
        this.#zoom = next;
        this.#move(centre.x - world.x * next, centre.y - world.y * next);
        for (const handler of [...this.#handlers]) handler();
    }

    /** Shows every place. */
    fitAll(): void {
        const xs = this.#places.map((place) => place.x);
        const ys = this.#places.map((place) => place.y);
        const box = { left: Math.min(...xs) - 20, top: Math.min(...ys) - 20, right: Math.max(...xs) + 80, bottom: Math.max(...ys) + 40 };
        const { clientWidth: width, clientHeight: height } = this.#container;
        const zoom = Math.min(Math.max(Math.min(width / (box.right - box.left), height / (box.bottom - box.top)), this.minZoom), this.maxZoom);
        const changed = zoom !== this.#zoom;
        this.#zoom = zoom;
        this.#move((width - (box.right + box.left) * zoom) / 2, (height - (box.bottom + box.top) * zoom) / 2);
        if (changed) for (const handler of [...this.#handlers]) handler();
    }

    on(type: "zoom", handler: () => void): void {
        if (type === "zoom") this.#handlers.add(handler);
    }

    off(type: "zoom", handler: () => void): void {
        if (type === "zoom") this.#handlers.delete(handler);
    }

    destroy(): void {
        this.#abort.abort();
        this.#handlers.clear();
        this.#layer.remove();
    }

    #move(x: number, y: number) {
        this.#offset = { x, y };
        this.#layer.style.transform = `translate(${x}px, ${y}px) scale(${this.#zoom})`;
    }
}
