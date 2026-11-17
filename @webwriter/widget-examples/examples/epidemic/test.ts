import { addedListeners, assert, check, editorSetOption, equal, events, fakeFrames, frame, key, listeners, listenerTypes, mount, mutations, run, settled, typeInto, until, warnings } from "../../test/harness";
import { html } from "lit";
import type { MsgFn } from "@lit/localize";
import { localizer } from "@webwriter/lit/localize";
import { SettingsCore, type SettingsDeclarations } from "@webwriter/widget/settings";
import { ShortcutsCore, ariaShortcut, formatShortcut, isApple, matchesShortcut } from "@webwriter/widget/shortcuts";
import { Settings } from "@webwriter/lit/settings";
import { ExampleElement } from "../shared/base";
import type { Epidemic } from "./index";
import "./index";

// ── Helpers ───────────────────────────────────────────────────────────────

const control = <E extends HTMLElement = HTMLInputElement>(host: Element, name: string) =>
    host.shadowRoot!.querySelector<E>(`[data-ww-setting="${name}"]`)!;
const visible = (element: Element) => getComputedStyle(element).display !== "none" && !element.closest("[hidden]");
/** The modifier that `Mod` stands for on this machine, and the other one. */
const mod = isApple() ? { metaKey: true } : { ctrlKey: true };
const notMod = isApple() ? { ctrlKey: true } : { metaKey: true };

type Widget = HTMLElement & Record<string, any>;

// ── Settings: property and attribute ──────────────────────────────────────

check("settings: defaults apply without attributes, and connecting writes nothing to the document", async () => {
    const box = await mount("<div></div>");
    const widget = document.createElement("ww-epidemic") as Epidemic;
    const seen = mutations(widget);
    box.append(widget);
    await settled(widget);
    equal([widget.population, widget.infectivity, widget.showChart, widget.movement], [120, 0.3, true, "random"]);
    equal(seen.stop().filter((record) => record.type === "attributes").map((record) => record.attributeName), []);
    equal(widget.infected, 3, "the first update saw the settings as changed and built the world");
});

check("settings: an attribute sets the property, for every type", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic population="50" infectivity="0.55" no-show-chart movement="calm"></ww-epidemic>`);
    equal([widget.population, widget.infectivity, widget.showChart, widget.movement], [50, 0.55, false, "calm"]);
    widget.setAttribute("population", "70");
    widget.removeAttribute("no-show-chart");
    widget.removeAttribute("movement");
    equal([widget.population, widget.showChart, widget.movement], [70, true, "random"], "removing an attribute restores the default");
    widget.toggleAttribute("no-show-chart", true);
    equal(widget.showChart, false);
});

check("settings: a property is reflected, and the default is stored as no attribute", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic></ww-epidemic>`);
    Object.assign(widget, { population: 300, infectivity: 0.5, showChart: false, movement: "still" });
    await settled(widget);
    equal(
        ["population", "infectivity", "no-show-chart", "movement"].map((name) => widget.getAttribute(name)),
        ["300", "0.5", "", "still"],
    );
    Object.assign(widget, { population: 120, infectivity: 0.3, showChart: true, movement: "random" });
    await settled(widget);
    equal(widget.getAttributeNames().filter((name) => name !== "contenteditable"), [], "back at the defaults no attribute is left");
});

check("settings: values are limited and validated wherever they come from", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic population="99999" infectivity="much" movement="teleport"></ww-epidemic>`);
    equal([widget.population, widget.infectivity, widget.movement], [400, 0.3, "random"], "from attributes");
    equal(widget.getAttribute("population"), "99999", "the authored attribute is left as it was");

    widget.population = 5;
    equal(widget.population, 10, "a property below the minimum");
    widget.population = Number.NaN;
    (widget as Widget).population = "many";
    equal(widget.population, 10, "not a number: the value stays");
    (widget as Widget).population = "250";
    equal(widget.population, 250, "a numeric string is converted");
    (widget as Widget).movement = "teleport";
    equal(widget.movement, "random", "a choice that is not listed is rejected");
    (widget as Widget).showChart = "yes";
    equal(widget.showChart, true, "a boolean takes only booleans");
    (widget as Widget).population = null;
    equal(widget.population, 120, "null resets to the default");
    await settled(widget);
    equal(widget.hasAttribute("population"), false);
});

// ── Settings: the editor's options ────────────────────────────────────────

check("settings: the generated options have the shape the editor documents", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic></ww-epidemic>`);
    // Read as plain records: the fields of every type of option at once.
    const options: Record<string, Record<string, any>> = widget.options;
    equal(Object.keys(options), ["population", "infectivity", "showChart", "movement", "recovery", "accent"]);
    const { population, infectivity, showChart, movement } = options;
    assert(population.type === Number && showChart.type === Boolean && movement.type === "select", "the type is passed on as declared");
    equal({ ...population, type: 0 }, { type: 0, min: 10, max: 400, step: 10, label: { _: "Population", de: "Bevölkerung" }, attribute: "population" });
    equal([infectivity.control, infectivity.attribute, infectivity.step], ["range", "infectivity", 0.05]);
    // A boolean that is true by default is stored as the negative attribute. `inverted` tells the editor to write it for false.
    equal({ ...showChart, type: 0 }, { type: 0, label: { _: "Show chart" }, attribute: "no-show-chart", inverted: true });
    equal(movement.options.map((choice: { value: string }) => choice.value), ["random", "calm", "still"]);
    assert(!("default" in population) && !("disabled" in movement), "module fields are not passed on");
});

check("settings: the editor's write reaches every type, also the negative boolean", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic></ww-epidemic>`);
    equal(editorSetOption(widget, "population", 60), true);
    equal(editorSetOption(widget, "infectivity", 0.8), true);
    equal(editorSetOption(widget, "movement", "calm"), true);
    equal(editorSetOption(widget, "showChart", false), true);
    await settled(widget);
    equal([widget.population, widget.infectivity, widget.movement, widget.showChart], [60, 0.8, "calm", false]);
    equal([widget.getAttribute("population"), widget.hasAttribute("no-show-chart")], ["60", true]);
    equal(editorSetOption(widget, "showChart", true), true);
    equal(editorSetOption(widget, "population", null), true, "the editor resets with null");
    await settled(widget);
    equal([widget.showChart, widget.hasAttribute("no-show-chart"), widget.population], [true, false, 120]);
    equal(editorSetOption(widget, "population", 5000), false, "the editor refuses what the limits exclude");
});

check("settings: optionschange when a disabled result or the language changes", async () => {
    const box = await mount(`<div lang="en"><ww-epidemic contenteditable></ww-epidemic></div>`);
    const widget = box.querySelector<Epidemic>("ww-epidemic")!;
    await settled(widget);
    const log = events("optionschange");
    widget.infectivity = 0.6;
    await settled(widget);
    equal(log.log, [], "no event for an ordinary change");

    widget.population = 10;
    await settled(widget);
    equal(log.log.length, 1);
    equal([widget.options.movement.disabled, widget.options.movement.disabledReason], [true, { _: "Needs at least 20 people" }]);
    equal(control(widget, "movement").disabled, true, "the bound control is off too");
    equal(editorSetOption(widget, "movement", "calm"), false, "and the editor refuses the write");

    widget.population = 30;
    await settled(widget);
    equal([log.log.length, "disabled" in widget.options.movement, control(widget, "movement").disabled], [2, false, false]);

    box.lang = "de";
    await settled(widget);
    equal(log.stop().length, 3, "the language changed");
    equal(control(widget, "infectivity").getAttribute("aria-label"), "Ansteckung");
    equal(control<HTMLSelectElement>(widget, "movement").options[0].textContent, "Zufällig");
});

// ── Settings: bound controls ──────────────────────────────────────────────

check("settings: a bound control shows value, limits and label", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic contenteditable lang="en" population="50" no-show-chart movement="calm"></ww-epidemic>`);
    const population = control(widget, "population");
    equal([population.value, population.min, population.max, population.step], ["50", "10", "400", "10"]);
    const infectivity = control(widget, "infectivity");
    equal([infectivity.value, infectivity.min, infectivity.max, infectivity.step], ["0.3", "0", "1", "0.05"]);
    equal(infectivity.getAttribute("aria-label"), "Infectivity", "a control without a label gets the declared one");
    equal(population.hasAttribute("aria-label"), false, "a control inside a <label> keeps that");
    equal(control(widget, "showChart").checked, false);
    const movement = control<HTMLSelectElement>(widget, "movement");
    equal([[...movement.options].map((option) => `${option.value}=${option.textContent}`), movement.value], [["random=Random", "calm=Calm", "still=still"], "calm"]);

    Object.assign(widget, { population: 300, showChart: true, movement: "still", infectivity: 0.75 });
    await settled(widget);
    equal([population.value, control(widget, "showChart").checked, movement.value, infectivity.value], ["300", true, "still", "0.75"]);
    widget.setAttribute("population", "80");
    await settled(widget);
    equal(population.value, "80", "a change from outside arrives in the control");
});

check("settings: a bound control writes back at once, and an entry from first input to change is one undo step", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic contenteditable></ww-epidemic>`);
    const log = events("ww-transactionstart", "ww-transactionend");
    const infectivity = control(widget, "infectivity");
    typeInto(infectivity, "0.45");
    equal([widget.infectivity, widget.getAttribute("infectivity")], [0.45, "0.45"], "the attribute is written with the input event");
    typeInto(infectivity, "0.55");
    typeInto(infectivity, "0.65");
    await frame();
    equal([widget.getAttribute("infectivity"), log.log], ["0.65", ["ww-transactionstart"]], "a slider drag stays one open transaction");
    typeInto(infectivity, "0.65", "change");
    await until(() => log.log.length === 2, "the transaction did not end with the change event");

    const chart = control(widget, "showChart");
    chart.checked = false;
    chart.dispatchEvent(new Event("input", { bubbles: true }));
    chart.dispatchEvent(new Event("change", { bubbles: true }));
    equal([widget.showChart, widget.hasAttribute("no-show-chart")], [false, true]);
    await until(() => log.log.length === 4, "the checkbox's transaction did not end");
    typeInto(control<HTMLSelectElement>(widget, "movement"), "calm", "change");
    equal([widget.movement, widget.getAttribute("movement")], ["calm", "calm"]);
    await until(() => log.log.length === 6, "one transaction per control");
    equal(log.stop().filter((type) => type === "ww-transactionstart").length, 3);

    // An entry that is never committed ends with the widget. The widget has left the document by then,
    // so the event no longer reaches the document: it is only seen on the widget itself.
    const open: string[] = [];
    for (const name of ["ww-transactionstart", "ww-transactionend"]) widget.addEventListener(name, () => open.push(name));
    typeInto(infectivity, "0.2");
    widget.remove();
    await until(() => open.length === 2, "the open transaction did not end on disconnect");
});

check("settings: a field is not rewritten while the author types, and shows the stored value afterwards", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic contenteditable></ww-epidemic>`);
    const population = control(widget, "population");
    population.focus();
    typeInto(population, "5");
    await settled(widget);
    equal([widget.population, population.value], [10, "5"], "the setting is limited, the field keeps the typing");
    typeInto(population, "55");
    await settled(widget);
    equal([widget.population, population.value], [55, "55"]);
    typeInto(population, "");
    equal(widget.population, 55, "an empty number field changes nothing");
    typeInto(population, "5000", "change");
    equal([widget.population, population.value], [400, "400"], "on commit the field shows what was stored");
});

check("settings and permissions: a reader gets only the control the author opened; an author gets all", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic></ww-epidemic>`);
    const infectivity = control(widget, "infectivity");
    const all = ["infectivity", "population", "showChart", "movement"];
    equal(all.map((name) => visible(control(widget, name))), [false, false, false, false], "a reader without the permission");
    typeInto(infectivity, "0.9");
    equal(widget.infectivity, 0.3, "and input from a hidden control is refused");

    widget.toggleAttribute("allowinfectivity", true);
    await settled(widget);
    equal(all.map((name) => visible(control(widget, name))), [true, false, false, false], "the permission opens one control");
    typeInto(infectivity, "0.9");
    equal(widget.infectivity, 0.9);
    typeInto(control(widget, "population"), "200");
    equal(widget.population, 120, "the author's control stays closed");

    widget.removeAttribute("allowinfectivity");
    widget.toggleAttribute("contenteditable", true);
    await settled(widget);
    equal(all.map((name) => visible(control(widget, name))), [true, true, true, true], "edit mode");
    typeInto(control(widget, "population"), "200");
    typeInto(infectivity, "0.1");
    equal([widget.population, widget.infectivity], [200, 0.1]);
});

// ── Settings: the specification's form, and the core alone ───────────────

/** As written in the specification: `static settings` on the class. TypeScript needs `declare` for each property. */
class SpecForm extends Settings(ExampleElement) {
    static options = { title: { type: String, label: { _: "Title" } } };
    static settings = {
        speed: { type: Number, default: 2, min: 1, max: 8 },
        loop: { type: Boolean },
        accent: { type: "color", default: "#ff0000", attribute: "accent-color" },
        gridLines: { type: Boolean, default: true },
        caption: {},
    } satisfies SettingsDeclarations;
    declare speed: number;
    declare loop: boolean;
    declare accent: string;
    declare gridLines: boolean;
    declare caption: string | undefined;
    changes: string[][] = [];
    willUpdate(changed: Map<string, unknown>) {
        this.changes.push([...changed.keys()].sort());
    }
    render() {
        return html`<input type="number" data-ww-setting="speed" />`;
    }
}
customElements.define("ww-settings-spec-form", SpecForm);

class SpecFormChild extends SpecForm {
    static settings = { ...SpecForm.settings, extra: { type: Number, default: 1 } } satisfies SettingsDeclarations;
    declare extra: number;
}
customElements.define("ww-settings-spec-child", SpecFormChild);

check("settings: `static settings` on the class gives the same properties, next to the class's own options", async () => {
    const widget = await mount<SpecForm>(`<ww-settings-spec-form speed="20" loop accent-color="#00ff00" no-grid-lines caption="Hi"></ww-settings-spec-form>`);
    equal([widget.speed, widget.loop, widget.accent, widget.gridLines, widget.caption], [8, true, "#00ff00", false, "Hi"]);
    const first = widget.changes[0].filter((name) => name in SpecForm.settings);
    equal(first, ["accent", "caption", "gridLines", "loop", "speed"], "the first update sees every setting with a value");
    equal(Object.keys(widget.options), ["title", "speed", "loop", "accent", "gridLines", "caption"], "static options are kept");
    equal([widget.options.accent.attribute, widget.options.gridLines.attribute, widget.options.loop.attribute], ["accent-color", "no-grid-lines", "loop"]);
    equal(["inverted" in widget.options.accent, (widget.options.gridLines as { inverted?: boolean }).inverted, "inverted" in widget.options.loop], [false, true, false], "only the boolean that is true by default is inverted");
    widget.loop = false;
    widget.caption = undefined;
    widget.gridLines = true;
    await settled(widget);
    equal(widget.getAttributeNames().sort(), ["accent-color", "speed"]);
    equal(widget.caption, undefined, "a setting without a default has no value");
    equal(widget.shadowRoot!.querySelector("input")!.value, "8");

    const child = await mount<SpecFormChild>(`<ww-settings-spec-child extra="5" speed="3"></ww-settings-spec-child>`);
    equal([child.extra, child.speed, Object.keys(child.options).length], [5, 3, 7], "a subclass adds to the inherited settings");
});

const probeSettings = {
    size: { type: Number, default: 3, min: 1, max: 9, label: { _: "Size", fr: "Taille" } },
    wrap: { type: Boolean, default: true },
    mode: { type: "select", default: "a", options: [{ value: "a" }, { label: { _: "More" }, children: [{ value: "b" }, { value: "c" }] }], disabled: (host: HTMLElement) => host.hasAttribute("locked") },
} satisfies SettingsDeclarations;

/** A plain custom element on the core alone: no Lit anywhere. */
class SettingsProbe extends HTMLElement {
    static settings = probeSettings;
    core = new SettingsCore(this);
    declare size: number;
    declare wrap: boolean;
    declare mode: string;
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `
            <input type="range" data-ww-setting="size"><input type="checkbox" data-ww-setting="wrap">
            <input type="radio" name="mode" value="a" data-ww-setting="mode"><input type="radio" name="mode" value="c" data-ww-setting="mode">`;
        this.core.defineProperties(this);
    }
    get options() {
        return this.core.editorOptions();
    }
    connectedCallback() {
        this.core.connect();
    }
    disconnectedCallback() {
        this.core.disconnect();
    }
}
customElements.define("ww-settings-probe", SettingsProbe);

check("settings core: a plain element gets properties, options and bound controls without Lit", async () => {
    const probe = await mount<SettingsProbe>(`<ww-settings-probe contenteditable lang="fr" size="12"></ww-settings-probe>`);
    const [size, wrap, a, c] = probe.shadowRoot!.querySelectorAll("input");
    equal([probe.size, probe.wrap, probe.mode], [9, true, "a"]);
    equal([size.value, size.max, size.getAttribute("aria-label"), wrap.checked, a.checked, c.checked], ["9", "9", "Taille", true, true, false]);
    equal(probe.core.getSnapshot(), { values: { size: 9, wrap: true, mode: "a" }, disabled: {} });

    let notified = 0;
    const unsubscribe = probe.core.subscribe(() => notified++);
    probe.size = 4;
    probe.wrap = false;
    probe.mode = "c";
    equal([probe.getAttribute("size"), probe.hasAttribute("no-wrap"), probe.getAttribute("mode")], ["4", true, "c"], "a property writes its attribute");
    await frame();
    equal([size.value, wrap.checked, c.checked, notified > 0], ["4", false, true, true]);
    (probe as Widget).mode = "zzz";
    equal(probe.mode, "c", "only listed choices, also those inside a group");

    a.checked = true;
    a.dispatchEvent(new Event("input", { bubbles: true }));
    equal([probe.mode, probe.hasAttribute("mode")], ["a", false], "a radio button writes its value; the default removes the attribute");
    equal(editorSetOption(probe, "wrap", true), true);
    equal([probe.wrap, probe.hasAttribute("no-wrap")], [true, false], "the editor removes the inverted attribute for true");
    equal([editorSetOption(probe, "wrap", false), probe.wrap, probe.hasAttribute("no-wrap")], [true, false, true], "and writes it for false");
    equal(editorSetOption(probe, "wrap", true), true);

    const log = events("optionschange");
    probe.toggleAttribute("locked", true);
    probe.core.refresh();
    equal([log.stop().length, probe.options.mode.disabled, a.disabled, c.disabled, size.disabled], [1, true, true, true, false]);
    c.checked = true;
    c.dispatchEvent(new Event("input", { bubbles: true }));
    equal(probe.mode, "a", "a setting that is turned off takes no input");

    unsubscribe();
    const root = probe.shadowRoot!;
    assert(listeners(root) > 0, "the core listens on the shadow root");
    probe.remove();
    equal(listeners(root, probe), 0, "and on nothing after disconnect");
    probe.setAttribute("size", "2");
    await frame();
    equal(size.value, "4", "a disconnected core no longer follows the attributes");
});

// ── Settings: the typed form, more types and the undo step in Lit ─────────

check("settings: the declarations passed to the mixin type every property, choices as a union", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic></ww-epidemic>`);
    const movement: "random" | "calm" | "still" = widget.movement;
    const numbers: number[] = [widget.population, widget.infectivity, widget.recovery];
    const chart: boolean = widget.showChart;
    const accent: string = widget.accent;
    // @ts-expect-error not one of the declared choices
    widget.movement = "teleport";
    // @ts-expect-error not a number
    widget.population = "many";
    // @ts-expect-error not a boolean
    widget.showChart = "yes";
    equal([movement, numbers, chart, accent], ["random", [120, 0.3, 6], true, "#dc2626"]);
    equal([widget.movement, widget.population, widget.showChart], ["random", 120, true], "what the compiler refuses is refused at run time too");
});

check("settings: a duration and a color in a Lit template, with captions that survive a render and follow the language", async () => {
    const box = await mount(`<div lang="en"><ww-epidemic contenteditable></ww-epidemic></div>`);
    const widget = box.querySelector<Epidemic>("ww-epidemic")!;
    await settled(widget);
    const root = widget.shadowRoot!;
    const recovery = control(widget, "recovery");
    const accent = control(widget, "accent");
    const caption = (name: string) => root.querySelector(`[data-ww-setting-label="${name}"]`)!.textContent;
    const swatches = () => [...root.querySelectorAll<HTMLOptionElement>(`#${accent.getAttribute("list")} option`)].map((option) => option.value);
    equal([recovery.value, accent.value, caption("recovery"), caption("accent")], ["0:06", "#dc2626", "Recovery time", "Color of the infected"]);
    equal(swatches(), ["#dc2626", "#d97706", "#7c3aed"]);
    typeInto(recovery, "1:30", "input", "change");
    typeInto(accent, "#7c3aed", "input", "change");
    await settled(widget);
    equal([widget.recovery, widget.getAttribute("recovery"), recovery.value, widget.accent, widget.getAttribute("accent")], [90, "90", "1:30", "#7c3aed", "#7c3aed"]);
    equal([editorSetOption(widget, "recovery", 12), editorSetOption(widget, "recovery", 500), (widget.options.recovery as { control?: string }).control], [true, false, "duration"]);
    await settled(widget);
    equal([widget.recovery, recovery.value], [12, "0:12"]);

    box.lang = "de";
    await settled(widget);
    equal([caption("recovery"), caption("accent")], ["Genesungszeit", "Farbe der Infizierten"]);
    widget.requestUpdate();
    await settled(widget);
    equal([caption("recovery"), swatches().length, recovery.value], ["Genesungszeit", 3, "0:12"], "what the module added is still there after a render");
});

check("settings: a setting that is turned off describes its control with the reason, and code still writes it", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic contenteditable lang="en" population="10"></ww-epidemic>`);
    const movement = control<HTMLSelectElement>(widget, "movement");
    equal([movement.disabled, movement.getAttribute("aria-description"), movement.title], [true, "Needs at least 20 people", "Needs at least 20 people"]);
    typeInto(movement, "calm", "input", "change");
    equal([widget.movement, movement.value], ["random", "random"], "the control takes no input");
    widget.movement = "calm";
    widget.population = 50;
    await settled(widget);
    equal([widget.movement, movement.value, movement.disabled, movement.hasAttribute("aria-description"), movement.hasAttribute("title")], ["calm", "calm", false, false, false]);
});

/** A widget that derives one setting from another in its update, and has a list. */
class Dependent extends Settings(
    ExampleElement,
    {
        size: { type: Number, default: 1, min: 1, max: 9 },
        big: { type: Boolean },
        tags: { type: "select", multiple: true, options: [{ value: "a" }, { value: "b" }, { value: "c" }] },
    },
    { entryTimeout: 80 },
) {
    updates = 0;
    protected willUpdate(changed: Map<PropertyKey, unknown>) {
        this.updates++;
        if (changed.has("size")) this.big = this.size > 5;
    }
    render() {
        return html`<input type="range" data-ww-setting="size" /><select multiple data-ww-setting="tags"></select>`;
    }
}
customElements.define("ww-settings-dependent", Dependent);

check("settings: the undo step of an entry spans the render that follows from it, and ends by itself when the control rests", async () => {
    const widget = await mount<Dependent>(`<ww-settings-dependent contenteditable></ww-settings-dependent>`);
    const range = control(widget, "size");
    const log = events("ww-transactionstart", "ww-transactionend");
    const atEnd = { big: null as boolean | null };
    const watch = () => widget.addEventListener("ww-transactionend", () => (atEnd.big = widget.hasAttribute("big")), { once: true });
    watch();
    typeInto(range, "7", "input", "change");
    equal([widget.getAttribute("size"), widget.hasAttribute("big")], ["7", false], "the setting is written at once; what the widget derives from it follows with its render");
    await until(() => log.log.length === 2, "the transaction did not end");
    equal(atEnd.big, true, "the derived attribute was written before the end");

    watch();
    typeInto(range, "2");
    equal(log.log.length, 3, "no change event: the entry is open");
    await until(() => log.log.length === 4, "an entry at rest did not end by itself", 5000);
    equal(atEnd.big, false);

    watch();
    equal([widget.settingsCore.set("size", 8), log.log.length], [true, 5]);
    await until(() => log.log.length === 6, "the transaction of a write through the core did not end");
    equal([atEnd.big, log.stop().filter((type) => type === "ww-transactionstart").length], [true, 3], "a write through the core is one step with its render too");
});

check("settings: a list is a Lit property with one identity per selection, reflected as JSON", async () => {
    const widget = await mount<Dependent>(`<ww-settings-dependent contenteditable tags='["c","a","x"]'></ww-settings-dependent>`);
    const select = control<HTMLSelectElement>(widget, "tags");
    equal([widget.tags, widget.getAttribute("tags"), [...select.selectedOptions].map((option) => option.value)], [["a", "c"], `["c","a","x"]`, ["a", "c"]], "the authored attribute stays as it was");
    const first = widget.tags;
    const updates = widget.updates;
    widget.tags = ["c", "a"];
    await settled(widget);
    assert(widget.tags === first && widget.updates === updates, "the same selection is no change");
    widget.tags = ["b"];
    await settled(widget);
    equal([widget.getAttribute("tags"), [...select.selectedOptions].map((option) => option.value)], [`["b"]`, ["b"]]);
    select.options[2].selected = true;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settled(widget);
    equal([widget.tags, widget.getAttribute("tags")], [["b", "c"], `["b","c"]`]);
    widget.tags = [];
    await settled(widget);
    equal(widget.hasAttribute("tags"), false, "the empty default is not written");
    // @ts-expect-error not a declared choice
    widget.tags = ["z"];
    equal(widget.tags, []);
});

// ── Shortcuts ─────────────────────────────────────────────────────────────

check("shortcuts: Space toggles the run while focus is inside the widget, and not from outside", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic></ww-epidemic>`);
    const stage = widget.shadowRoot!.querySelector<HTMLElement>(".stage")!;
    equal(key(" ", document.body), true, "a key outside the widget is not consumed");
    equal(widget.playback.paused, true);
    stage.focus();
    equal(key(" "), false, "inside, the declared key is consumed");
    equal(widget.playback.paused, false);
    key(" ");
    equal(widget.playback.paused, true);
});

check("shortcuts: undeclared keys pass through, declared ones stop at the widget", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic></ww-epidemic>`);
    const stage = widget.shadowRoot!.querySelector<HTMLElement>(".stage")!;
    const reached: string[] = [];
    const abort = new AbortController();
    document.addEventListener("keydown", (event) => reached.push(event.key), { signal: abort.signal });
    let restarts = 0;
    widget.restart = () => void restarts++;
    stage.focus();
    equal([key("x"), key("ArrowUp"), key("r", stage, { shiftKey: true }), key("r", stage, { altKey: true })], [true, true, true, true]);
    equal([reached, restarts], [["x", "ArrowUp", "r", "r"], 0], "other keys and other modifiers reach the page");
    equal([key("r"), key("R")], [false, false]);
    equal([reached.length, restarts], [4, 2], "the declared key does not reach the page");
    abort.abort();
});

check("shortcuts: ignored in a text field, and a button keeps its own Space", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic contenteditable></ww-epidemic>`);
    let restarts = 0;
    widget.restart = () => void restarts++;
    control(widget, "population").focus();
    equal([key("r"), key(" "), restarts, widget.playback.paused], [true, true, 0, true], "typing in a number field");
    control<HTMLSelectElement>(widget, "movement").focus();
    equal([key("r"), restarts], [true, 0], "a select uses letters to choose");
    control(widget, "showChart").focus();
    equal([key(" "), widget.playback.paused], [true, true], "Space belongs to the checkbox");
    equal([key("r"), restarts], [false, 1], "a letter on a checkbox is a shortcut");
    const toggle = widget.shadowRoot!.querySelector<HTMLElement>('[data-ww-playback="toggle"]')!;
    toggle.focus();
    equal([key(" "), key("Enter"), widget.playback.paused], [true, true, true], "Space and Enter belong to the button");
});

check("shortcuts: a Mod combination needs its permission and is one undo step that spans the render", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic></ww-epidemic>`);
    const stage = widget.shadowRoot!.querySelector<HTMLElement>(".stage")!;
    stage.focus();
    const log = events("ww-transactionstart", "ww-transactionend");
    equal(key("ArrowUp", stage, mod), true, "without the permission the key is not consumed");
    await settled(widget);
    equal([widget.infectivity, log.log], [0.3, []]);

    widget.toggleAttribute("allowinfectivity", true);
    let attributeAtEnd: string | null = "not seen";
    widget.addEventListener("ww-transactionend", () => (attributeAtEnd = widget.getAttribute("infectivity")), { once: true });
    equal([key("ArrowUp", stage, notMod), key("ArrowUp", stage, { ...mod, shiftKey: true })], [true, true], "another modifier is another key");
    equal(key("ArrowUp", stage, mod), false);
    equal([widget.infectivity.toFixed(2), log.log], ["0.35", ["ww-transactionstart"]], "the method ran inside an open transaction");
    await until(() => log.log.length === 2, "the transaction did not end");
    equal([log.stop(), attributeAtEnd], [["ww-transactionstart", "ww-transactionend"], "0.35"], "the reflected attribute was written before the end");
});

class KeysProbe extends HTMLElement {
    static permissions = { allowDeleting: {} };
    static actions = {
        save: { shortcut: "Mod+S" },
        slow: { shortcut: "S" },
        erase: { shortcut: ["Delete", "Backspace"], can: "allowDeleting" },
        rename: { shortcut: "F2", can: "edit" },
        wipe: { shortcut: "W", confirm: { _: "Really?" } },
        load: { shortcut: "L", input: { type: "file" } },
        off: { shortcut: "O", disabled: true },
        help: { shortcut: "?" },
        zoomIn: { shortcut: "Mod++" },
        missing: { shortcut: "M" },
    };
    core = new ShortcutsCore(this, { apple: false });
    log: string[] = [];
    finish: (() => void) | null = null;
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `<div tabindex="0" class="stage"><slot></slot></div><div contenteditable class="note">note</div><input class="field">`;
        for (const name of ["save", "erase", "rename", "wipe", "load", "off", "help", "zoomIn"]) (this as Widget)[name] = () => void this.log.push(name);
    }
    slow() {
        this.log.push("slow");
        return new Promise<void>((done) => (this.finish = done));
    }
    connectedCallback() {
        this.core.connect();
    }
    disconnectedCallback() {
        this.core.disconnect();
    }
}
customElements.define("ww-keys-probe", KeysProbe);

check("shortcuts core: which declarations a key runs", async () => {
    const probe = await mount<KeysProbe>(`<ww-keys-probe></ww-keys-probe>`);
    const stage = probe.shadowRoot!.querySelector<HTMLElement>(".stage")!;
    const press = (name: string, init: KeyboardEventInit = {}) => key(name, stage, init);
    equal([press("s", { ctrlKey: true }), probe.log], [true, []], "save, undo and redo stay with the editor");
    equal([press("w"), press("l"), press("o"), press("m"), probe.log], [true, true, true, true, []], "confirm, file input, disabled, no method");
    equal([press("?", { shiftKey: true }), press("+", { ctrlKey: true, shiftKey: true }), press("+", { ctrlKey: true })], [false, false, false]);
    equal(probe.log, ["help", "zoomIn", "zoomIn"], "Shift is not compared for a symbol");
    equal([press("Delete"), press("F2"), probe.log.length], [true, true, 3], "a reader without the permissions");
    probe.toggleAttribute("allowdeleting", true);
    equal([press("Delete"), press("Backspace"), press("Delete", { shiftKey: true }), press("F2")], [false, false, true, true]);
    probe.toggleAttribute("contenteditable", true);
    equal([press("F2"), probe.log.slice(3)], [false, ["erase", "erase", "rename"]], "can: 'edit' is for authors");
    equal(probe.core.keysOf("erase"), ["Delete", "Backspace"]);
    assert(matchesShortcut("Mod+D", new KeyboardEvent("keydown", { key: "d", metaKey: true }), true), "Mod is ⌘ on Apple devices");
    assert(!matchesShortcut("Mod+D", new KeyboardEvent("keydown", { key: "d", ctrlKey: true }), true), "and not Ctrl there");
});

check("shortcuts core: a promise keeps the undo step open, and the action does not run twice meanwhile", async () => {
    const probe = await mount<KeysProbe>(`<ww-keys-probe></ww-keys-probe>`);
    const stage = probe.shadowRoot!.querySelector<HTMLElement>(".stage")!;
    const log = events("ww-transactionstart", "ww-transactionend");
    let notified = 0;
    probe.core.subscribe(() => notified++);
    equal(key("s", stage), false);
    equal([probe.log, probe.core.getSnapshot().running, log.log], [["slow"], ["slow"], ["ww-transactionstart"]]);
    equal(key("s", stage), false, "the key is still consumed");
    equal(probe.log, ["slow"], "but the action is not started again");
    await frame(2);
    equal(log.log, ["ww-transactionstart"], "still open");
    probe.finish!();
    await until(() => log.log.length === 2, "the transaction did not end");
    equal([log.stop(), probe.core.getSnapshot().running, notified], [["ww-transactionstart", "ww-transactionend"], [], 2]);
    key("s", stage);
    equal(probe.log, ["slow", "slow"], "afterwards it runs again");
    probe.finish!();
});

check("shortcuts core: the author's typing in authored text and in the widget's own editable region is left alone", async () => {
    const probe = await mount<KeysProbe>(`<ww-keys-probe contenteditable><p>Authored text</p></ww-keys-probe>`);
    const text = probe.querySelector("p")!.firstChild!;
    getSelection()!.collapse(text, 3);
    equal([key("Delete", probe), key("?", probe, { shiftKey: true }), probe.log], [true, true, []], "the caret is in the authored text");
    getSelection()!.removeAllRanges();
    equal([key("Delete", probe), probe.log], [false, ["erase"]], "without a caret there, the focused widget takes the key");

    const note = probe.shadowRoot!.querySelector<HTMLElement>(".note")!;
    note.focus();
    equal([key("Delete"), key("?", note, { shiftKey: true })], [true, true], "an editable region of the widget");
    probe.shadowRoot!.querySelector<HTMLElement>(".field")!.focus();
    equal([key("Backspace"), probe.log.length], [true, 1], "a text field");
});

class RunProbe extends HTMLElement {
    static actions = {
        run: { shortcut: [{ key: "Mod+Enter", inText: true }, "R"] },
        stop: { shortcut: { key: "Escape", inText: true } },
        greedy: { shortcut: { key: "G", inText: true } },
        plain: { shortcut: "Mod+K" },
    };
    core = new ShortcutsCore(this, { apple: false });
    log: string[] = [];
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `<div tabindex="0" class="stage"></div><textarea class="code"></textarea><input class="field"><div contenteditable class="note">note</div><div role="textbox" tabindex="0" class="box"></div>`;
        for (const name of Object.keys(RunProbe.actions)) (this as Widget)[name] = () => void this.log.push(name);
    }
    connectedCallback() {
        this.core.connect();
    }
    disconnectedCallback() {
        this.core.disconnect();
    }
}
customElements.define("ww-run-probe", RunProbe);

check("shortcuts core: a key with inText also runs in text entry, any other key stays the field's", async () => {
    const reported = warnings();
    const probe = await mount<RunProbe>(`<ww-run-probe></ww-run-probe>`);
    const at = (name: string) => probe.shadowRoot!.querySelector<HTMLElement>(`.${name}`)!;
    const press = (name: string, target: string, init: KeyboardEventInit = {}) => key(name, at(target), init);
    equal(probe.core.keysOf("run"), ["Mod+Enter", "R"], "an object is a key, and keysOf names the keys");
    for (const target of ["code", "field", "note", "box"]) {
        at(target).focus();
        probe.log.length = 0;
        equal([press("Enter", target, { ctrlKey: true }), press("Escape", target), probe.log], [false, false, ["run", "stop"]], `${target}: a key that opted in runs`);
        equal([press("r", target), press("k", target, { ctrlKey: true }), probe.log.length], [true, true, 2], `${target}: the others are left to the field`);
    }
    equal([press("Enter", "stage", { ctrlKey: true }), press("r", "stage"), press("k", "stage", { ctrlKey: true })], [false, false, false], "outside text entry every key runs");
    probe.core.disconnect();
    equal(press("Enter", "code", { ctrlKey: true }), true, "after disconnect nothing runs");
    probe.core.connect();
    equal(press("Enter", "code", { ctrlKey: true, isComposing: true }), true, "a key of an input method is no shortcut");
    const messages = reported.stop();
    const typing = messages.filter((message) => message.includes("types text"));
    equal([typing.length, typing[0]?.includes('shortcut "G"')], [1, true], "a plain letter with inText warns once, for that key only: not for a combination or Escape");
});

check("shortcuts core: while the widget is fullscreen, keys are read from the document, and only then", async () => {
    const probe = await mount<KeysProbe>(`<ww-keys-probe></ww-keys-probe>`);
    const before = listeners(document);
    equal([key("?", document.body, { shiftKey: true }), probe.log], [true, []]);
    // Real fullscreen needs a user gesture, so the state is put in place of the document's own.
    Object.defineProperty(document, "fullscreenElement", { value: probe, configurable: true });
    try {
        probe.dispatchEvent(new Event("fullscreenchange", { bubbles: true, composed: true }));
        equal(listeners(document), before + 1);
        equal([key("?", document.body, { shiftKey: true }), probe.log], [false, ["help"]]);
        equal([key("?", probe.shadowRoot!.querySelector(".stage")!, { shiftKey: true }), probe.log.length], [false, 2], "a key inside is handled once");
    } finally {
        delete (document as { fullscreenElement?: Element }).fullscreenElement;
    }
    probe.dispatchEvent(new Event("fullscreenchange", { bubbles: true, composed: true }));
    equal([listeners(document), key("?", document.body, { shiftKey: true }), probe.log.length], [before, true, 2]);
});

check("shortcuts: nothing listens after disconnect, also when removed while fullscreen", async () => {
    const before = listeners(document, window);
    const outside = listenerTypes(document, window);
    const probe = await mount<KeysProbe>(`<ww-keys-probe></ww-keys-probe>`);
    const stage = probe.shadowRoot!.querySelector<HTMLElement>(".stage")!;
    equal(addedListeners(outside, document, window), ["online"], "no key listener is attached to the window or the document: only the module text listens for the browser coming back online, to ask again for a catalog that could not be loaded");
    Object.defineProperty(document, "fullscreenElement", { value: probe, configurable: true });
    try {
        probe.dispatchEvent(new Event("fullscreenchange", { bubbles: true, composed: true }));
        probe.remove();
    } finally {
        delete (document as { fullscreenElement?: Element }).fullscreenElement;
    }
    equal([listeners(document, window), listeners(probe)], [before, 0]);
    equal([key("?", stage, { shiftKey: true }), probe.log], [true, []], "a key in the removed widget does nothing");

    const widget = await mount<Epidemic>(`<ww-epidemic></ww-epidemic>`);
    const root = widget.shadowRoot!;
    await widget.playback.play();
    widget.remove();
    await frame(2);
    equal([listeners(document, window), listeners(widget)], [before, 0], "the Lit widget with all four modules");
    assert(listeners(root) <= 1, "only Lit's own slotchange listener may remain on the shadow root");
});

// ── Shortcuts: key syntax, layouts, shown keys and other keymaps ──────────

/** A component that keeps its shadow root closed, with a text field inside. */
class ClosedField extends HTMLElement {
    static html = `<input>`;
    #inner: HTMLElement;
    constructor() {
        super();
        const root = this.attachShadow({ mode: "closed" });
        root.innerHTML = (this.constructor as typeof ClosedField).html;
        this.#inner = root.firstElementChild as HTMLElement;
    }
    /** Focuses the element inside and presses a key on it. */
    press(name: string, init: KeyboardEventInit = {}) {
        this.#inner.focus();
        return key(name, this.#inner, init);
    }
}
customElements.define("ww-closed-field", ClosedField);

/** The same with something focusable that takes no text. */
class ClosedPad extends ClosedField {
    static html = `<div tabindex="0">pad</div>`;
}
customElements.define("ww-closed-pad", ClosedPad);

class KeymapProbe extends HTMLElement {
    static actions = {
        duplicate: { shortcut: "Mod+D" },
        all: { shortcut: "Mod+A" },
        quit: { shortcut: "Mod+Q" },
        group: { shortcut: "Alt+G" },
        mute: { shortcut: "M" },
        dive: { shortcut: "V" },
        one: { shortcut: "1" },
        altOne: { shortcut: "Alt+1" },
        upper: { shortcut: "Shift+A" },
        next: { shortcut: ["ArrowRight", "pagedown"], hidden: true },
        play: { shortcut: "Space" },
        more: { shortcut: "Plus" },
        erase: { shortcut: ["Delete", "Backspace"] },
        off: { shortcut: "O", disabled: true },
    };
    core = new ShortcutsCore(this, { apple: false });
    log: string[] = [];
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `
            <div tabindex="0" class="stage"></div>
            <button data-ww-shortcut="erase" class="erase"></button><button data-ww-shortcut="off" class="off"></button>
            <button data-ww-shortcut="duplicate" class="duplicate"></button><button data-ww-shortcut="nothing" class="nothing" aria-keyshortcuts="X"></button>
            <div role="slider" tabindex="0" class="slider"></div><a href="#x" class="link">link</a>
            <details><summary class="summary">more</summary></details><ul role="listbox" tabindex="0" class="listbox"></ul>
            <div data-ww-shortcuts="off"><div tabindex="0" class="editor"></div></div>
            <ww-closed-field class="field"></ww-closed-field>
            <ww-closed-pad class="pad" data-ww-shortcuts="on"></ww-closed-pad>
            <ww-closed-pad class="focused-pad" tabindex="0"></ww-closed-pad>`;
        for (const name of Object.keys(KeymapProbe.actions)) (this as Widget)[name] = () => void this.log.push(name);
    }
    inner<E extends HTMLElement = HTMLElement>(name: string): E {
        return this.shadowRoot!.querySelector<E>(`.${name}`)!;
    }
    connectedCallback() {
        this.core.connect();
    }
    disconnectedCallback() {
        this.core.disconnect();
    }
}
customElements.define("ww-keymap-probe", KeymapProbe);

check("shortcuts core: key names ignore case, Space and Plus are aliases, Shift counts for a letter, and composed text is left alone", async () => {
    const probe = await mount<KeymapProbe>(`<ww-keymap-probe></ww-keymap-probe>`);
    const press = (name: string, init: KeyboardEventInit = {}) => key(name, probe.inner("stage"), init);
    equal([press("PageDown"), press("ArrowRight"), press(" "), press("+"), press("+", { shiftKey: true })], [false, false, false, false, false]);
    equal(probe.log, ["next", "next", "play", "more", "more"], "a hidden action keeps its key");
    equal([press("a"), press("A", { shiftKey: true }), press("a", { shiftKey: true })], [true, false, false], "Shift+A needs Shift, whatever case the key reports");
    equal([press("o"), probe.log.slice(5)], [true, ["upper", "upper"]], "a disabled action has no key");
    equal([press("d", { ctrlKey: true, isComposing: true }), press("Process", { ctrlKey: true }), press(" ", { isComposing: true })], [true, true, true], "keys of an input method");
    equal(
        [press("d"), press("d", { ctrlKey: true, altKey: true }), press("d", { ctrlKey: true, metaKey: true }), press("d", { ctrlKey: true, shiftKey: true }), press("d", { metaKey: true })],
        [true, true, true, true, true],
        "modifiers must match exactly",
    );
    equal([press("D", { ctrlKey: true }), probe.log.length], [false, 8]);
});

check("shortcuts core: undo, redo and save stay with the editor whatever is declared, and the declaration is reported", async () => {
    class Greedy extends HTMLElement {
        static actions = { undoIt: { shortcut: "Mod+Z" }, redoIt: { shortcut: ["Mod+Shift+Z", "Ctrl+Y"] }, save: { shortcut: "Meta+S" }, saveAs: { shortcut: "Mod+Shift+S" } };
        core = new ShortcutsCore(this, { apple: false });
        log: string[] = [];
        constructor() {
            super();
            this.attachShadow({ mode: "open" }).innerHTML = `<div tabindex="0"></div>`;
            for (const name of Object.keys(Greedy.actions)) (this as Widget)[name] = () => void this.log.push(name);
        }
        connectedCallback() {
            this.core.connect();
        }
        disconnectedCallback() {
            this.core.disconnect();
        }
    }
    customElements.define("ww-keys-greedy", Greedy);
    const reported = warnings();
    const probe = await mount<Greedy>(`<ww-keys-greedy></ww-keys-greedy>`);
    await mount(`<ww-keys-greedy></ww-keys-greedy>`);
    const stage = probe.shadowRoot!.querySelector("div")!;
    const reached: string[] = [];
    const abort = new AbortController();
    document.addEventListener("keydown", (event) => reached.push(event.key), { signal: abort.signal });
    const pressed = [
        key("z", stage, { ctrlKey: true }),
        key("z", stage, { ctrlKey: true, shiftKey: true }),
        key("y", stage, { ctrlKey: true }),
        key("s", stage, { metaKey: true }),
        key("я", stage, { ctrlKey: true, code: "KeyZ" }),
    ];
    abort.abort();
    equal([pressed, probe.log, reached], [[true, true, true, true, true], [], ["z", "z", "y", "s", "я"]], "the keys reach the page and the editor");
    equal([key("S", stage, { ctrlKey: true, shiftKey: true }), probe.log], [false, ["saveAs"]], "a combination next to a reserved one is the widget's");
    equal([probe.core.keysOf("undoIt"), probe.core.keysOf("redoIt"), probe.core.keysOf("saveAs"), probe.core.labelsOf("save")], [[], [], ["Mod+Shift+S"], []]);
    const messages = reported.stop();
    equal([messages.length, messages.every((message) => message.includes("is reserved for undo, redo and save"))], [4, true], "once per reserved key of the class");
});

check("shortcuts core: the character decides, and the position of the key only where the layout has no Latin character for it", async () => {
    const probe = await mount<KeymapProbe>(`<ww-keymap-probe></ww-keymap-probe>`);
    const press = (name: string, code: string, init: KeyboardEventInit = {}) => key(name, probe.inner("stage"), { code, ...init });
    // A Cyrillic and a Greek layout: the key where a Latin keyboard has the letter.
    equal([press("в", "KeyD", { ctrlKey: true }), press("δ", "KeyD", { ctrlKey: true }), press("м", "KeyV")], [false, false, false]);
    equal(probe.log.splice(0), ["duplicate", "duplicate", "dive"]);
    equal([press("ю", "Period"), press("В", "KeyD", { ctrlKey: true, shiftKey: true }), press("в", "KeyD")], [true, true, true], "no such position, another Shift, another modifier");
    // AZERTY has A where QWERTY has Q: the letter wins over the position.
    equal([press("a", "KeyQ", { ctrlKey: true }), press("q", "KeyA", { ctrlKey: true })], [false, false]);
    equal(probe.log.splice(0), ["all", "quit"]);
    // AZERTY has the comma where QWERTY has M: a symbol is not sent to the position.
    equal([press(",", "KeyM"), press("m", "Semicolon"), probe.log.splice(0)], [true, false, ["mute"]]);
    // A Mac makes a symbol or a dead key of Alt with a letter or a digit.
    equal([press("©", "KeyG", { altKey: true }), press("Dead", "KeyG", { altKey: true }), press("¡", "Digit1", { altKey: true })], [false, false, false]);
    equal(probe.log.splice(0), ["group", "group", "altOne"]);
    equal(press("@", "KeyG", { altKey: true, modifierAltGraph: true }), true, "AltGr writes text");
    // Shift+1 on a US keyboard is "!", not the shortcut 1. Where the digit itself needs Shift (AZERTY), it is the shortcut.
    equal([press("!", "Digit1", { shiftKey: true }), press("1", "Digit1"), press("1", "Digit1", { shiftKey: true }), probe.log.splice(0)], [true, false, false, ["one", "one"]]);
    assert(matchesShortcut("Alt+D", new KeyboardEvent("keydown", { key: "∂", code: "KeyD", altKey: true }), true), "matchesShortcut() applies the same rule");
    assert(!matchesShortcut("D", new KeyboardEvent("keydown", { key: "∂", code: "KeyD" }), true), "without Alt a symbol is a symbol");
});

check("shortcuts: keys are shown per platform and language, and a marked button announces them", async () => {
    equal(
        ["Mod+Shift+D", "Alt+ArrowUp", "Ctrl+Alt+Delete", "Backspace", "Enter", "Escape", "Space", "pagedown", "F2", "?", "Mod++"].map((shortcut) => formatShortcut(shortcut, { apple: true })),
        ["⇧⌘D", "⌥↑", "⌃⌥⌦", "⌫", "↩", "⎋", "Space", "⇟", "F2", "?", "⌘+"],
    );
    equal(
        ["Mod+Shift+D", "Alt+ArrowUp", "Ctrl+Alt+Delete", "Escape", "Space", "pagedown", "Mod++"].map((shortcut) => formatShortcut(shortcut, { apple: false })),
        ["Ctrl+Shift+D", "Alt+↑", "Ctrl+Alt+Delete", "Esc", "Space", "Page Down", "Ctrl++"],
    );
    equal(
        [ariaShortcut("Mod+D", false), ariaShortcut("Mod+D", true), ariaShortcut("Space", false), ariaShortcut("Mod++", false), ariaShortcut("Alt+Shift+ArrowUp", false), ariaShortcut("?", false)],
        ["Control+D", "Meta+D", "Space", "Control+Plus", "Alt+Shift+ArrowUp", "?"],
    );

    const box = await mount(`<div lang="de"><ww-keymap-probe></ww-keymap-probe></div>`);
    const probe = box.querySelector<KeymapProbe>("ww-keymap-probe")!;
    const { core } = probe;
    equal(
        [core.labelsOf("erase"), core.labelsOf("duplicate"), core.labelsOf("play"), core.labelsOf("next"), core.labelsOf("upper"), core.labelsOf("off"), core.labelsOf("unknown")],
        [["Entf", "Rücktaste"], ["Strg+D"], ["Leertaste"], ["→", "Bild ab"], ["Umschalt+A"], [], []],
        "German key names where they differ",
    );
    box.lang = "en";
    equal([core.labelsOf("erase"), core.keysOf("erase"), core.keysOf("off")], [["Delete", "Backspace"], ["Delete", "Backspace"], []]);
    equal(new ShortcutsCore(probe, { apple: false, messages: { control: "Control" } }).labelsOf("duplicate"), ["Control+D"], "the names can be replaced");

    const announced = (name: string) => probe.inner(name).getAttribute("aria-keyshortcuts");
    equal([announced("erase"), announced("duplicate"), announced("off"), announced("nothing")], ["Delete Backspace", "Control+D", null, null]);
    (probe as Widget).actions = { ...KeymapProbe.actions, erase: { shortcut: "Delete", disabled: true }, duplicate: { shortcut: ["Mod+D", "Mod+Shift+D"] } };
    core.refresh();
    equal([announced("erase"), announced("duplicate")], [null, "Control+D Control+Shift+D"], "after a render the buttons follow the declaration");

    const widget = await mount<Epidemic>(`<ww-epidemic lang="en" allowinfectivity></ww-epidemic>`);
    const button = (action: string) => widget.shadowRoot!.querySelector(`[data-ww-shortcut="${action}"]`)!.getAttribute("aria-keyshortcuts");
    equal([button("toggle"), button("restart"), widget.shortcuts.keysOf("raiseInfectivity")], ["Space", "R", ["Mod+ArrowUp"]]);
    equal(widget.shadowRoot!.querySelector(".keys")!.textContent, `${isApple() ? "⌘↑" : "Ctrl+↑"}: Infectivity +`, "the example's hint, in a Lit template");
});

check("shortcuts core: a widget whose keys can never arrive is reported", async () => {
    const define = (tag: string, template: string, actions: Record<string, { shortcut: string }>) => {
        class Stage extends HTMLElement {
            static actions = actions;
            core = new ShortcutsCore(this);
            constructor() {
                super();
                this.attachShadow({ mode: "open" }).innerHTML = template;
            }
            go() {}
            connectedCallback() {
                this.core.connect();
            }
            disconnectedCallback() {
                this.core.disconnect();
            }
        }
        customElements.define(tag, Stage);
    };
    define("ww-keys-unreachable", `<canvas></canvas><p>Text</p>`, { go: { shortcut: "G" } });
    define("ww-keys-reachable", `<canvas tabindex="0"></canvas>`, { go: { shortcut: "G" } });
    define("ww-keys-none", `<canvas></canvas>`, {});
    const reported = warnings();
    await mount(`<ww-keys-unreachable></ww-keys-unreachable>`);
    await mount(`<ww-keys-unreachable></ww-keys-unreachable>`);
    await mount(`<ww-keys-reachable></ww-keys-reachable>`);
    await mount(`<ww-keys-none></ww-keys-none>`);
    await mount(`<ww-keys-unreachable tabindex="0"></ww-keys-unreachable>`);
    const messages = reported.stop();
    equal([messages.length, messages[0]?.includes("<ww-keys-unreachable>: shortcuts are declared, but nothing in the widget can take the focus")], [1, true]);
});

check("shortcuts core: a component with a closed shadow root keeps its keys unless it says otherwise, and a marked region keeps its own", async () => {
    const probe = await mount<KeymapProbe>(`<ww-keymap-probe></ww-keymap-probe>`);
    const field = probe.inner<ClosedField>("field");
    equal([field.press("m"), field.press("Delete"), field.press("d", { ctrlKey: true }), probe.log], [true, true, true, []], "what has the focus inside cannot be seen: it may be a text field");
    equal([probe.inner<ClosedPad>("pad").press("m"), probe.log.splice(0)], [false, ["mute"]], `data-ww-shortcuts="on" says that the component takes no text`);
    probe.inner("focused-pad").focus();
    equal([key("m"), probe.log.splice(0)], [false, ["mute"]], "a component that is focused itself is not in question");
    const editor = probe.inner("editor");
    editor.focus();
    equal([key("m"), key("Delete"), key("d", editor, { ctrlKey: true }), probe.log], [true, true, true, []], `data-ww-shortcuts="off": an editor with its own keymap`);
});

check("shortcuts core: a control keeps the keys it uses itself, also by its role", async () => {
    const probe = await mount<KeymapProbe>(`<ww-keymap-probe></ww-keymap-probe>`);
    const on = (name: string, pressed: string) => key(pressed, probe.inner(name));
    equal([on("slider", "ArrowRight"), on("slider", "PageDown"), on("listbox", "ArrowRight"), on("link", "Enter"), on("summary", " "), on("erase", " "), probe.log], [true, true, true, true, true, true, []]);
    equal([on("slider", "Delete"), on("slider", " "), on("erase", "ArrowRight"), on("link", "m"), probe.log], [false, false, false, false, ["erase", "play", "next", "mute"]], "every other key there is a shortcut");
});

check("shortcuts core: a widget that connects while it is fullscreen reads the document's keys at once, and one without a shadow root has its keys too", async () => {
    const box = await mount("<div></div>");
    const probe = document.createElement("ww-keymap-probe") as KeymapProbe;
    const before = listeners(document);
    Object.defineProperty(document, "fullscreenElement", { value: probe, configurable: true });
    try {
        box.append(probe);
        equal([listeners(document), key("m", document.body), probe.log], [before + 1, false, ["mute"]]);
    } finally {
        delete (document as { fullscreenElement?: Element }).fullscreenElement;
    }
    probe.remove();
    equal(listeners(document), before);

    class Bare extends HTMLElement {
        static actions = { go: { shortcut: "G" } };
        core = new ShortcutsCore(this);
        went = 0;
        go() {
            this.went++;
        }
        connectedCallback() {
            this.core.connect();
            this.core.refresh();
        }
        disconnectedCallback() {
            this.core.disconnect();
        }
    }
    customElements.define("ww-keys-bare", Bare);
    const bare = await mount<Bare>(`<ww-keys-bare tabindex="0"></ww-keys-bare>`);
    equal([key("g", bare), bare.went], [false, 1]);
});

// ── Playback inside a Lit widget ──────────────────────────────────────────

check("playback: frames move the time output without an event and without a render of the widget", async () => {
    const widget = await mount<Epidemic>(`<ww-epidemic></ww-epidemic>`);
    const time = widget.shadowRoot!.querySelector('[data-ww-playback="time"]')!;
    const frames = fakeFrames();
    await widget.playback.play();
    await until(() => frames.pending > 0, "the loop did not ask for a frame");
    await settled(widget);
    const changes = events("ww-playbackchange");
    let renders = 0;
    (widget as Widget).updated = () => void renders++;
    const start = performance.now();
    for (let index = 0; index <= 25; index++) frames.fire(start + index * 100);
    await settled(widget);
    equal([time.textContent, changes.log, renders], ["0:02", [], 0], "2.5 simulated seconds");
    widget.requestUpdate();
    await settled(widget);
    equal([changes.log, renders], [[], 1], "a render of the widget while it plays is no change of state either");
    widget.playback.pause();
    equal([changes.stop().length, frames.pending], [1, 0]);
});

// ── Texts from the widget's own catalog, and a key that is declined ───────

const CHECK = "s42cbd8dca939a9c7"; // the generated id of the message "Check"
type Texts = { msg: MsgFn };

/** A widget whose drawer texts come from its own catalog. */
class Translated extends Settings(ExampleElement, {
    speed: { type: Number, default: 1, label: (widget: Texts) => widget.msg("Check"), description: (widget: Texts) => ({ _: `${widget.msg("Check")}!` }) },
    mode: { type: "select", default: "a", options: [{ value: "a", label: (widget: Texts) => widget.msg("Check") }, { value: "b", label: "B" }] },
    plain: { type: Boolean, label: { _: "Plain", de: "Einfach" } },
}) {
    localize = localizer(this, { sourceLocale: "en", targetLocales: ["de"], load: async () => ({ templates: { [CHECK]: "Prüfen" } }) });
    msg = this.localize.msg;
    render() {
        return html`<input type="number" data-ww-setting="speed" /><span data-ww-setting-label="speed"></span><select data-ww-setting="mode"></select>`;
    }
}
customElements.define("ww-settings-translated", Translated);

check("settings: a text that is a function is asked with the widget, and the editor is told when its answer changes", async () => {
    const widget = await mount<Translated>(`<ww-settings-translated lang="en"></ww-settings-translated>`);
    const options = () => widget.options as Record<string, any>;
    const texts = () => [
        options().speed.label,
        options().speed.description,
        options().mode.options.map((choice: { label: string }) => choice.label),
        control(widget, "speed").getAttribute("aria-label"),
        widget.shadowRoot!.querySelector("[data-ww-setting-label]")!.textContent,
        [...control<HTMLSelectElement>(widget, "mode").options].map((option) => option.textContent),
        widget.settingsCore.labelOf("mode", "a"),
    ];
    equal(texts(), ["Check", { _: "Check!" }, ["Check", "B"], "Check", "Check", ["Check", "B"], "Check"]);
    equal(options().plain.label, { _: "Plain", de: "Einfach" }, "a text that is no function is passed as it is");
    assert(options().speed.type === Number && options().speed.attribute === "speed", "the other fields are passed as before");

    const heard: string[] = [];
    widget.addEventListener("optionschange", () => heard.push(options().speed.label));
    widget.lang = "de";
    await until(() => heard.at(-1) === "Prüfen", "the editor was not told when the catalog arrived");
    await settled(widget);
    equal(texts(), ["Prüfen", { _: "Prüfen!" }, ["Prüfen", "B"], "Prüfen", "Prüfen", ["Prüfen", "B"], "Prüfen"]);
    const told = heard.length;
    widget.speed = 3;
    await settled(widget);
    equal(heard.length, told, "a render that changes no text sends nothing");
});

check("shortcuts core: an action that returns false leaves the key to the next action, and then to the page", async () => {
    class Decliner extends HTMLElement {
        static actions = { cancel: { shortcut: "Escape" }, close: { shortcut: "Escape" }, later: { shortcut: "Enter" } };
        core = new ShortcutsCore(this, { apple: false });
        log: string[] = [];
        busy = true;
        open = true;
        constructor() {
            super();
            this.attachShadow({ mode: "open" }).innerHTML = `<div tabindex="0"></div>`;
        }
        cancel() {
            if (!this.busy) return false;
            this.busy = false;
            this.log.push("cancel");
        }
        close() {
            if (!this.open) return false;
            this.open = false;
            this.log.push("close");
        }
        later() {
            this.log.push("later");
            return Promise.resolve(false);
        }
        connectedCallback() {
            this.core.connect();
        }
        disconnectedCallback() {
            this.core.disconnect();
        }
    }
    customElements.define("ww-keys-decliner", Decliner);
    const probe = await mount<Decliner>("<ww-keys-decliner></ww-keys-decliner>");
    const stage = probe.shadowRoot!.querySelector("div")!;
    const reached: string[] = [];
    const page = new AbortController();
    document.addEventListener("keydown", (event) => reached.push(event.key), { signal: page.signal });
    const steps = events("ww-transactionstart", "ww-transactionend");
    equal([key("Escape", stage), probe.log, reached], [false, ["cancel"], []], "the first action takes the key");
    equal([key("Escape", stage), probe.log, reached], [false, ["cancel", "close"], []], "it declines, and the next action with the key takes it");
    equal([key("Escape", stage), probe.log, reached], [true, ["cancel", "close"], ["Escape"]], "both decline: the key is not consumed and reaches the page");
    equal(steps.log.length % 2, 0, "every undo step that was opened is closed");
    equal([key("Enter", stage), reached], [false, ["Escape"]], "a promise takes the key, whatever it resolves to");
    await until(() => probe.core.getSnapshot().running.length === 0);
    steps.stop();
    page.abort();
});

run();
