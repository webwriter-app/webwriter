// Checks of signals without Lit, shared value shapes, and the test helper that connects an effect:
// a widget that is not a Lit element publishes a signal, a Lit receiver follows it, and both use one
// Signals implementation (the build fails when a bundle holds two copies of the polyfill).
import { assert, check, equal, mount, settled, wait } from "../../test/harness";
import { html } from "lit";
import { LitElementWw } from "@webwriter/lit";
import { effectAccepts, hasShape, isSeries, isTable, computed, signal, watchSignal, type SignalDeclaration, type EffectDeclaration, type ReadableSignal } from "@webwriter/widget/signals";
import { computed as litComputed, isTable as litIsTable } from "@webwriter/lit";
// The helper is a file of the checkout's build tool. It has no source target, so it is imported by its place.
// @ts-expect-error The file is plain JavaScript with JSDoc.
import { connectEffect } from "../../../build/test.js";

type Connect = (widget: HTMLElement, attribute: string, source: ReadableSignal, options?: { shape?: string }) => { lifetime: AbortSignal; disconnect(): void };
const connect = connectEffect as Connect;

check("signals: the standard shapes have guards that reject near misses", () => {
    equal([hasShape("number", 3), hasShape("number", NaN), hasShape("number", "3")], [true, false, false]);
    equal([hasShape("string", ""), hasShape("boolean", false), hasShape("boolean", 0)], [true, true, false]);
    equal([isSeries([]), isSeries([1, 2.5]), isSeries([1, "2"]), isSeries({ length: 0 })], [true, true, false, false]);
    const table = { columns: ["a", "b"], rows: [[1, "x"], [null, 2]] };
    equal([isTable(table), isTable({ columns: ["a"], rows: [[true]] }), isTable({ columns: [1], rows: [] }), isTable(null), isTable([])], [true, false, false, false, false]);
    equal([hasShape("table", table), hasShape("vector", table), hasShape("constructor", table)], [true, false, false], "a shape of the package's own has no guard here");
    equal([litIsTable(table), litIsTable({})], [true, false], "@webwriter/lit re-exports the guards");
});

check("signals: an effect without `accepts` takes any signal, one with `accepts` only a declared shape", () => {
    equal([effectAccepts({}, undefined), effectAccepts({ accepts: [] }, "table")], [true, true]);
    equal([effectAccepts({ accepts: ["table"] }, "table"), effectAccepts({ accepts: ["table"] }, "series"), effectAccepts({ accepts: ["table"] }, undefined)], [true, false, false]);
});

check("signals: watchSignal calls back now and once per batch of changes, and stops on abort", async () => {
    const state = signal(1);
    const double = computed(() => state.get() * 2);
    const seen: number[] = [];
    const lifetime = new AbortController();
    watchSignal(double, (value) => seen.push(value), lifetime.signal);
    equal(seen, [2], "reads the value at once");
    state.set(2);
    state.set(3);
    await wait(0);
    equal(seen, [2, 6], "one call for a batch");
    lifetime.abort();
    state.set(4);
    await wait(0);
    equal(seen, [2, 6], "no call after the lifetime ended");
    const late: number[] = [];
    watchSignal(double, (value) => late.push(value), AbortSignal.abort());
    equal(late, [], "an aborted lifetime never starts");
    const plain: number[] = [];
    watchSignal({ get: () => 7 }, (value) => plain.push(value));
    equal(plain, [7], "a source that is not a signal is read once");
});

class Meter extends HTMLElement {
    static signals: Record<string, SignalDeclaration> = { history: { shape: "series", description: "Readings since the page loaded." } };
    #history = signal<number[]>([1]);
    signals = { history: computed(() => this.#history.get()) };
    push(value: number) {
        this.#history.set([...this.#history.get(), value]);
    }
}
customElements.define("ww-signals-meter", Meter);

class Chart extends LitElementWw {
    #source = signal<ReadableSignal<number[]> | null>(null);
    static effects: Record<string, EffectDeclaration> = {
        "series-from": {
            accepts: ["series"],
            connect(this: Chart, source, lifetime) {
                this.#source.set(source);
                lifetime.addEventListener("abort", () => this.#source.set(null), { once: true });
            },
        },
    };
    render() {
        return html`<output>${this.#source.get()?.get().join(",") ?? "none"}</output>`;
    }
}
customElements.define("ww-signals-chart", Chart);

check("signals: a widget that is not a Lit element publishes, and a Lit receiver follows it through the test helper", async () => {
    const meter = await mount<Meter>(`<ww-signals-meter></ww-signals-meter>`);
    const chart = await mount<Chart>(`<ww-signals-chart></ww-signals-chart>`);
    const text = () => chart.shadowRoot!.querySelector("output")!.textContent;
    equal(text(), "none");
    const link = connect(chart, "series-from", meter.signals.history, { shape: (meter.constructor as typeof Meter).signals.history.shape });
    await settled(chart);
    equal(text(), "1");
    meter.push(5);
    await settled(chart);
    equal(text(), "1,5", "the receiver renders again when the source changes");
    link.disconnect();
    link.disconnect();
    equal(link.lifetime.aborted, true);
    await settled(chart);
    equal(text(), "none", "the effect cleared its source when the lifetime ended");
});

check("signals: the test helper refuses what the editor would leave unconnected", async () => {
    const chart = await mount<Chart>(`<ww-signals-chart></ww-signals-chart>`);
    const source = litComputed(() => 1);
    let message = "";
    try { connect(chart, "series-from", source, { shape: "number" }); } catch (error) { message = (error as Error).message; }
    assert(/accepts series, not number/.test(message), `a shape the effect does not accept: ${message}`);
    message = "";
    try { connect(chart, "other-from", source); } catch (error) { message = (error as Error).message; }
    assert(/declares no effect "other-from"/.test(message), `an effect the widget does not declare: ${message}`);
    equal(chart.shadowRoot!.querySelector("output")!.textContent, "none", "nothing was connected");
    // Lit's `computed` and the one of @webwriter/widget are the same implementation, so either feeds either.
    const link = connect(chart, "series-from", litComputed(() => [2, 3]));
    await settled(chart);
    equal(chart.shadowRoot!.querySelector("output")!.textContent, "2,3");
    link.disconnect();
});
