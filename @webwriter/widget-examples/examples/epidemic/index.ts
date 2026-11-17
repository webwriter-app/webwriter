import { css, html, type PropertyValues } from "lit";
import { Permissions } from "@webwriter/lit/permissions";
import { Playback } from "@webwriter/lit/playback";
import { Settings } from "@webwriter/lit/settings";
import { Shortcuts } from "@webwriter/lit/shortcuts";
import { ExampleElement } from "../shared/base";

type Dot = { x: number; y: number; vx: number; vy: number; state: "healthy" | "infected" | "recovered"; since: number };

const WIDTH = 320;
const HEIGHT = 200;
const SPEED = { random: 40, calm: 12, still: 0 };
const COLOR = { healthy: "#3b82f6", recovered: "#9ca3af" };

/**
 * A small epidemic: dots move in a box and infect the dots they come close to.
 * Settings declares the six settings once. They are passed to the mixin, which
 * also gives the properties their types: `movement` is the union of its choices.
 * Playback runs the loop, Shortcuts gives the actions their keys, and
 * Permissions opens one control to readers.
 */
export class Epidemic extends Settings(ExampleElement, {
    population: { type: Number, default: 120, min: 10, max: 400, step: 10, label: { _: "Population", de: "Bevölkerung" } },
    infectivity: { type: Number, default: 0.3, min: 0, max: 1, step: 0.05, control: "range", label: { _: "Infectivity", de: "Ansteckung" } },
    showChart: { type: Boolean, default: true, label: { _: "Show chart" } }, // stored as no-show-chart
    movement: {
        type: "select",
        default: "random",
        label: { _: "Movement" },
        options: [{ value: "random", label: { _: "Random", de: "Zufällig" } }, { value: "calm", label: { _: "Calm" } }, { value: "still" }],
        // Typed by shape: naming the widget class here would make its type depend on itself.
        disabled: (widget: { population: number }) => widget.population < 20 && { _: "Needs at least 20 people" },
    },
    recovery: { type: Number, control: "duration", default: 6, min: 1, max: 120, label: { _: "Recovery time", de: "Genesungszeit" } },
    accent: { type: "color", default: "#dc2626", swatches: ["#dc2626", "#d97706", "#7c3aed"], label: { _: "Color of the infected", de: "Farbe der Infizierten" } },
}) {
    static permissions = {
        allowInfectivity: { label: { _: "Learners may change infectivity in this widget" } },
    };

    static actions = {
        toggle: { label: { _: "Play or pause" }, shortcut: "Space" },
        restart: { label: { _: "Restart" }, shortcut: "R" },
        raiseInfectivity: { label: { _: "Raise infectivity" }, shortcut: "Mod+ArrowUp", can: "allowInfectivity" },
    };

    static styles = css`
        :host { display: block; }
        .stage { display: block; border: 1px solid #d1d5db; border-radius: 4px; }
        .stage:focus-visible { outline: 2px solid Highlight; }
        canvas { display: block; width: 100%; height: auto; }
        .bar, .settings { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.5rem; }
        button { min-width: 2rem; min-height: 2rem; }
        .keys { margin: 0.5rem 0 0; font-size: 0.8em; color: #6b7280; }
    `;

    // Hides the controls marked `data-ww-can` from readers who may not use them.
    readonly access = new Permissions(this);
    readonly shortcuts = new Shortcuts(this);
    readonly playback = new Playback(this, {
        step: (dt) => this.#advance(dt),
        interval: 1 / 60,
        reset: () => this.#populate(),
        draw: () => this.#draw(),
    });

    #dots: Dot[] = [];
    #clock = 0;
    #history: number[] = [];

    /** How many dots are infected now. */
    get infected(): number {
        return this.#dots.filter((dot) => dot.state === "infected").length;
    }

    // ── Actions: the drawer, the keys and the buttons call the same methods ──

    toggle() {
        this.playback.run("toggle");
    }

    restart() {
        this.playback.run("reset");
    }

    raiseInfectivity() {
        this.infectivity = Math.round((this.infectivity + 0.05) * 100) / 100;
    }

    // ── Simulation ──────────────────────────────────────────────────────────

    #populate() {
        const speed = SPEED[this.movement];
        this.#dots = Array.from({ length: this.population }, (_, index) => {
            const angle = Math.random() * Math.PI * 2;
            return {
                x: Math.random() * WIDTH,
                y: Math.random() * HEIGHT,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                state: index < 3 ? "infected" : "healthy",
                since: 0,
            };
        });
        this.#clock = 0;
        this.#history = [];
    }

    #advance(dt: number) {
        this.#clock += dt;
        const infected = this.#dots.filter((dot) => dot.state === "infected");
        for (const dot of this.#dots) {
            dot.x += dot.vx * dt;
            dot.y += dot.vy * dt;
            if (dot.x < 0 || dot.x > WIDTH) dot.vx = -dot.vx;
            if (dot.y < 0 || dot.y > HEIGHT) dot.vy = -dot.vy;
            if (dot.state === "infected" && this.#clock - dot.since > this.recovery) dot.state = "recovered";
            if (dot.state !== "healthy") continue;
            const near = infected.some((other) => (other.x - dot.x) ** 2 + (other.y - dot.y) ** 2 < 100);
            if (near && Math.random() < this.infectivity * dt * 6) Object.assign(dot, { state: "infected", since: this.#clock });
        }
        if (this.#history.length < this.#clock * 4) this.#history.push(this.infected);
    }

    #draw() {
        const context = this.renderRoot.querySelector("canvas")?.getContext("2d");
        if (!context) return;
        context.clearRect(0, 0, WIDTH, HEIGHT);
        for (const dot of this.#dots) {
            context.fillStyle = dot.state === "infected" ? this.accent : COLOR[dot.state];
            context.fillRect(dot.x - 2, dot.y - 2, 4, 4);
        }
        if (!this.showChart) return;
        context.strokeStyle = this.accent;
        context.beginPath();
        this.#history.slice(-WIDTH).forEach((count, index) => context.lineTo(index, HEIGHT - (count / this.population) * 60));
        context.stroke();
    }

    // ── Lit ─────────────────────────────────────────────────────────────────

    protected willUpdate(changed: PropertyValues<this>) {
        // The settings are ordinary reactive properties.
        if (changed.has("population") || changed.has("movement")) this.playback.reset();
    }

    protected updated() {
        this.#draw();
    }

    render() {
        return html`
            <div class="stage" tabindex="0"><canvas width=${WIDTH} height=${HEIGHT} role="img" aria-label="Simulation"></canvas></div>
            <div class="bar">
                <button data-ww-playback="toggle" data-ww-shortcut="toggle"></button>
                <button data-ww-playback="step"></button>
                <button data-ww-playback="rate"></button>
                <button data-ww-playback="reset" data-ww-shortcut="restart"></button>
                <output data-ww-playback="time"></output>
            </div>
            <div class="settings">
                <input type="range" data-ww-setting="infectivity" data-ww-can="allowInfectivity" />
                <label data-ww-can="edit">Population <input type="number" data-ww-setting="population" /></label>
                <label data-ww-can="edit"><input type="checkbox" data-ww-setting="showChart" /> Chart</label>
                <label data-ww-can="edit">Movement <select data-ww-setting="movement"></select></label>
                <!-- An empty label element shows the declared label in the widget's language. -->
                <label data-ww-can="edit"><span data-ww-setting-label="recovery"></span> <input type="text" size="5" data-ww-setting="recovery" /></label>
                <label data-ww-can="edit"><span data-ww-setting-label="accent"></span> <input type="color" data-ww-setting="accent" /></label>
            </div>
            <p class="keys" data-ww-can="allowInfectivity">${this.shortcuts.labelsOf("raiseInfectivity").join(", ")}: ${this.settingsCore.labelOf("infectivity")} +</p>
        `;
    }
}
customElements.define("ww-epidemic", Epidemic);
