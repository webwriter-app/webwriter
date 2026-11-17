import { css, html, nothing } from "lit";
import { Scene, sceneElements, webglAvailable, type MoveDetail, type SceneErrorDetail, type SelectDetail, type SpriteItem } from "@webwriter/widget/scene";
import { PixiScene } from "@webwriter/widget/scene/pixi"; // the only import that pulls in pixi.js
import { transaction } from "@webwriter/widget/transaction";
import { SceneController } from "@webwriter/lit/scene";
import { Viewport } from "@webwriter/lit/viewport";
import { ExampleElement } from "../shared/base";

type Creature = SpriteItem & { vx: number; vy: number };
type Nest = { id: string; x: number; y: number };

const WIDTH = 600;
const HEIGHT = 300;
const MARGIN = 10;

/** A white arrowhead. Each sprite tints it. */
function arrow(): HTMLCanvasElement {
    const canvas = Object.assign(document.createElement("canvas"), { width: 12, height: 12 });
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.beginPath();
    context.moveTo(12, 6);
    context.lineTo(0, 1);
    context.lineTo(3, 6);
    context.lineTo(0, 11);
    context.fill();
    return canvas;
}

/**
 * A small simulation on the Pixi renderer: one sprite batch drawn from an array
 * that is changed in place, a background shape styled with CSS, and HTML nodes
 * above the canvas: a label, and three nests that can be selected and moved.
 * With `zoomable` the scene is the window of a Viewport, which zooms and pans it.
 */
export class Swarm extends ExampleElement {
    // Where the browser has no WebGL the same template is drawn with SVG, without the sprites.
    static scopedElements: Record<string, CustomElementConstructor> = { ...sceneElements, "ww-scene": webglAvailable() ? PixiScene : Scene };

    static properties = {
        count: { type: Number, reflect: true },
        running: { type: Boolean, reflect: true },
        // Authored like the two above. The editor expects a property that reads an attribute to reflect to it.
        zoomable: { type: Boolean, reflect: true },
        fit: { reflect: true },
        tick: { state: true },
        nests: { state: true },
        selection: { state: true },
        failure: { state: true },
    };

    static styles = css`
        :host { display: block; font: 13px system-ui, sans-serif; --habitat: #e8f3ea; }
        ww-scene { width: ${WIDTH + 2 * MARGIN}px; height: ${HEIGHT + 2 * MARGIN}px; }
        ww-shape.habitat { fill: var(--habitat); stroke: #5b8a68; stroke-width: 2px; }
        ww-shape.habitat:state(hover) { stroke-width: 4px; }
        ww-node.label { padding: 2px 8px; background: #ffffffd0; border-radius: 4px; }
        ww-node.nest { padding: 2px 8px; background: #fff; border: 1px solid #8a5a2b; border-radius: 10px; }
        .notice { color: #a11; }
    `;

    declare count: number;
    declare running: boolean;
    /** Make the scene the window of a viewport: the wheel, the keys and the buttons zoom and pan it. */
    declare zoomable: boolean;
    /** `data-ww-viewport-fit` of that viewport. Unset means "none"; no default is written to the document. */
    declare fit: string | undefined;
    declare tick: number;
    declare nests: Nest[];
    declare selection: readonly string[];
    /** What the scene reported if it could not draw. */
    declare failure: string;

    /** The model. It is changed in place, as simulations do. */
    readonly creatures: Creature[] = [];
    readonly #texture = arrow();
    // The habitat is what the viewport fits and what limits panning. While a marquee is drawn the view stays still.
    readonly #viewport: Viewport = new Viewport(this, { bounds: () => this.#scene.extent(), can: () => !this.#scene.marquee });
    readonly #scene: SceneController = new SceneController(this, { viewport: this.#viewport.core });
    #frame: number | null = null;

    constructor() {
        super();
        this.count = 500;
        this.running = false;
        this.zoomable = false;
        this.tick = 0;
        this.nests = [
            { id: "nest1", x: 140, y: 270 },
            { id: "nest2", x: 290, y: 270 },
            { id: "nest3", x: 440, y: 270 },
        ];
        this.selection = [];
        this.failure = "";
    }

    /** The widget's viewport, for the page around it. */
    get view(): Viewport {
        return this.#viewport;
    }

    connectedCallback() {
        super.connectedCallback();
        this.#loop();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.#frame !== null) cancelAnimationFrame(this.#frame);
        this.#frame = null;
    }

    #loop() {
        this.#frame = requestAnimationFrame(() => {
            if (this.running) this.step();
            this.#loop();
        });
    }

    /** Advances the simulation and asks for a render. The scene draws the batch again after it. */
    step(dt = 1) {
        for (const creature of this.creatures) {
            creature.x += creature.vx * dt;
            creature.y += creature.vy * dt;
            if (creature.x < MARGIN || creature.x > MARGIN + WIDTH) creature.vx *= -1;
            if (creature.y < MARGIN || creature.y > MARGIN + HEIGHT) creature.vy *= -1;
            creature.rotation = Math.atan2(creature.vy, creature.vx);
        }
        this.tick++;
    }

    willUpdate() {
        const creatures = this.creatures;
        creatures.length = Math.min(creatures.length, Math.max(0, this.count));
        while (creatures.length < this.count) {
            const angle = Math.random() * 2 * Math.PI;
            creatures.push({
                x: MARGIN + Math.random() * WIDTH,
                y: MARGIN + Math.random() * HEIGHT,
                vx: Math.cos(angle) * 1.5,
                vy: Math.sin(angle) * 1.5,
                rotation: angle,
                tint: [0x2f6f4f, 0x8a5a2b, 0x35608f][creatures.length % 3],
            });
        }
    }

    /**
     * Changes what the document keeps (`count`, `running`) as one undo step. The step lasts
     * until the render: Lit writes the attribute only then.
     */
    #write(change: () => void) {
        transaction(this, async () => {
            change();
            await this.updateComplete;
        });
    }

    #move(event: CustomEvent<MoveDetail>) {
        const moved = new Map(event.detail.items.map((item) => [item.key, item]));
        this.nests = this.nests.map((nest) => (moved.has(nest.id) ? { ...nest, x: moved.get(nest.id)!.x, y: moved.get(nest.id)!.y } : nest));
    }

    /**
     * The scene could not draw something. Without WebGL the nodes are still there,
     * so the widget says so and stays usable. On the SVG renderer the sprites are
     * refused, which is what this widget expects there.
     */
    #failed(event: CustomEvent<SceneErrorDetail>) {
        event.preventDefault(); // handled here, so nothing is logged
        if (event.detail.code === "webgl") this.failure = "This browser cannot draw the swarm. The nests can still be arranged.";
        else if (event.detail.code === "load") this.failure = event.detail.message;
    }

    render() {
        return html`
            <ww-scene select="multiple" data-ww-viewport=${this.zoomable ? "canvas" : nothing} data-ww-viewport-fit=${this.fit ?? "none"} aria-label="Habitat"
                @ww-select=${(event: CustomEvent<SelectDetail>) => (this.selection = event.detail.keys)} @ww-move=${this.#move} @ww-sceneerror=${this.#failed}>
                <ww-shape kind="rect" class="habitat" x=${MARGIN} y=${MARGIN} width=${WIDTH} height=${HEIGHT} @click=${() => this.#write(() => (this.count += 100))}></ww-shape>
                <ww-sprites .items=${this.creatures} .texture=${this.#texture}></ww-sprites>
                <ww-node class="label" x="20" y="20">${this.count} creatures · tick ${this.tick}</ww-node>
                ${this.nests.map((nest) => html`
                    <ww-node class="nest" data-ww-key=${nest.id} x=${nest.x} y=${nest.y} selectable movable ?selected=${this.selection.includes(nest.id)}>${nest.id}</ww-node>`)}
            </ww-scene>
            ${this.failure ? html`<p class="notice" role="status">${this.failure}</p>` : nothing}
            <p>
                <button id="run" @click=${() => this.#write(() => (this.running = !this.running))}>${this.running ? "Pause" : "Run"}</button>
                ${this.zoomable ? html`<span data-ww-viewport-controls></span>` : nothing}
                <small>A click on the habitat adds 100 creatures.</small>
            </p>
        `;
    }
}
customElements.define("ww-swarm", Swarm);
