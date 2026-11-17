import { addedListeners, assert, check, editorSetOption, equal, events, frame, listeners, listenerTypes, mount, mutations, run, typeInto, until, warnings } from "../../test/harness";
import { formatDuration, parseDuration, SettingsCore, type SettingsDeclarations } from "@webwriter/widget/settings";
import type { SettingsPlain } from "./index";
import "./index";

// ── Helpers ───────────────────────────────────────────────────────────────

type Field = HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
/** The bound controls of a setting, in template order. */
const controls = (host: Element, name: string) => [...host.shadowRoot!.querySelectorAll<Field>(`[data-ww-setting="${name}"]`)];
const control = (host: Element, name: string, index = 0) => controls(host, name)[index];
const caption = (host: Element, name: string) => host.shadowRoot!.querySelector(`[data-ww-setting-label="${name}"]`)!.textContent;
const attributes = (host: Element) => Object.fromEntries(host.getAttributeNames().filter((name) => name !== "contenteditable" && name !== "lang").map((name) => [name, host.getAttribute(name)]));
const visible = (element: Element) => getComputedStyle(element).display !== "none" && !element.closest("[hidden]");
/** A property write as untyped code makes it. */
const assign = (host: object, values: Record<string, unknown>) => Object.assign(host, values);

const card = (written = "contenteditable") => mount<SettingsPlain>(`<ww-settings-plain ${written}></ww-settings-plain>`);

// ── The core alone ────────────────────────────────────────────────────────

check("plain: the widget's bundle holds no framework", async () => {
    const bundle = await (await fetch("../../dist/settings-plain/index.js")).text();
    assert(bundle.includes("SettingsCore"), "the bundle is the widget's");
    for (const name of ["lit-html", "LitElement", "ReactiveElement", "@webwriter/lit"]) assert(!bundle.includes(name), `the bundle mentions ${name}`);
});

check("plain: defaults apply without attributes, and connecting writes nothing to the document", async () => {
    const box = await mount("<div></div>");
    const widget = document.createElement("ww-settings-plain") as SettingsPlain;
    const seen = mutations(widget);
    box.append(widget);
    await frame(2);
    equal(seen.stop().length, 0, "the widget itself is untouched");
    equal(
        [widget.heading, widget.note, widget.length, widget.start, widget.days, widget.size, widget.volume, widget.rounds, widget.sound, widget.loop],
        ["Break", undefined, 300, undefined, [], 24, 0.5, 1, true, false],
    );
    equal([widget.theme, widget.shape, widget.shows, widget.accent, widget.code, widget.contact, widget.target], ["auto", "ring", ["minutes", "seconds"], "#2563eb", undefined, undefined, undefined]);
    assert(widget.days === widget.days && widget.shows === widget.shows, "a list is the same object between reads");
    equal(Object.keys(widget.settingsCore.getSnapshot().values).length, 22, "the snapshot holds every setting");
});

check("types: an attribute is read for every type, limited or replaced where it does not fit, and never rewritten", async () => {
    const written = `heading="Pause" note="two&#10;lines" length="90" start="09:30" day="2026-11-15" until="2026-11-15T10:00" days='["fri","mon","sun"]'
        size="30" volume="7" rounds="4" no-sound loop theme="dark" shape="bar-wide" shows='["hours"]' accent="#FF0000" code="ABC-12"
        contact="a@example.org" link="https://example.org/" phone="+49 30 1" pin="1234" target="first"`;
    const widget = await card(written);
    const before = attributes(widget);
    equal([widget.heading, widget.note, widget.length, widget.start, widget.day, widget.until], ["Pause", "two\nlines", 90, "09:30", "2026-11-15", "2026-11-15T10:00"]);
    equal([widget.days, widget.size, widget.volume, widget.rounds], [["mon", "fri"], 24, 1, 4], "a list keeps what is listed, in declared order; a number moves to the nearest step and inside the limits");
    equal([widget.sound, widget.loop, widget.theme, widget.shape, widget.shows, widget.accent], [false, true, "dark", "bar-wide", ["hours"], "#ff0000"]);
    equal([widget.code, widget.contact, widget.link, widget.phone, widget.pin, widget.target], ["ABC-12", "a@example.org", "https://example.org/", "+49 30 1", "1234", "first"]);
    equal(attributes(widget), before, "no authored attribute was corrected");

    const wrong = await card(`heading="${"x".repeat(30)}" length="soon" start="9 o'clock" day="2026-13-40" until="yesterday" days="not json" size="big" volume="-3"
        theme="pink" shape="Bars" shows='"hours"' accent="red" code="abc" pin="12"`);
    const kept = attributes(wrong);
    equal([wrong.heading, wrong.length, wrong.start, wrong.day, wrong.until, wrong.days, wrong.size, wrong.volume], ["Break", 300, undefined, undefined, undefined, [], 24, 0]);
    equal([wrong.theme, wrong.shape, wrong.shows, wrong.accent, wrong.code, wrong.pin], ["auto", "ring", ["minutes", "seconds"], "#2563eb", undefined, undefined], "the default replaces a value that does not fit");
    equal(attributes(wrong), kept);
    wrong.setAttribute("length", "2");
    wrong.setAttribute("days", `["wed"]`);
    equal([wrong.length, wrong.days], [5, ["wed"]], "a change of the attribute from outside is read at once");
});

check("types: a property writes its attribute, the default removes it, and a value that does not fit is refused", async () => {
    const widget = await card();
    const core = widget.settingsCore;
    assign(widget, { heading: "Pause", note: "a\nb", length: 90, start: "10:15", day: "2026-12-24", until: "2026-12-24T18:00", days: ["fri", "mon"], size: 50, volume: 0.8, rounds: 3 });
    assign(widget, { sound: false, loop: true, theme: "light", shape: "bar-thin", shows: [], accent: "#16A34A", code: "XYZ-99", contact: "a@example.org", link: "https://example.org/", phone: "1", pin: "0000", target: "first" });
    equal(attributes(widget), {
        heading: "Pause", note: "a\nb", length: "90", start: "10:15", day: "2026-12-24", until: "2026-12-24T18:00", days: `["mon","fri"]`, size: "40", volume: "0.8", rounds: "3",
        "no-sound": "", loop: "", theme: "light", shape: "bar-thin", shows: "[]", accent: "#16a34a", code: "XYZ-99", contact: "a@example.org", link: "https://example.org/", phone: "1", pin: "0000", target: "first",
    } as Record<string, string | null>);
    equal(widget.shows, [], "an empty list is a value of its own when the default is not empty");

    const before = attributes(widget);
    assign(widget, { heading: "x".repeat(25), length: "soon", start: "25:00", day: "tomorrow", days: ["mon", "sun"], rounds: Number.NaN, sound: "no", theme: "pink", shows: "hours", accent: "red", code: "abc", pin: "1" });
    assign(widget, { days: "mon", size: {}, loop: 1 });
    equal(attributes(widget), before, "nothing was written for a refused value");
    equal([core.set("theme", "pink"), core.set("code", "abc"), core.set("days", ["sun"]), core.set("nothing", 1)], [false, false, false, false], "set() says that it refused");
    equal([core.set("theme", "dark"), core.set("theme", "dark"), core.set("rounds", "7"), widget.rounds], [true, true, true, 7], "and that it took a value, also one that changes nothing");
    assign(widget, { rounds: 50, volume: -1, size: 1000, length: 1 });
    equal([widget.rounds, widget.volume, widget.size, widget.length], [9, 0, 64, 5], "numbers are limited");

    assign(widget, { heading: "Break", note: null, length: 300, start: "", day: undefined, until: "", days: [], size: 24, volume: 0.5, rounds: 1, sound: true, loop: false });
    assign(widget, { theme: "auto", shape: "ring", shows: ["seconds", "minutes"], accent: "#2563EB", code: "", contact: null, link: null, phone: null, pin: null, target: null });
    equal(attributes(widget), {}, "back at the defaults no attribute is left");
    equal(widget.shows, ["minutes", "seconds"], "a list has one order however it was given");
});

check("types: durations are read and written as the editor's control does", () => {
    equal([0, 5, 65, 3600, 3725, 90.5, 86400].map(formatDuration), ["0:00", "0:05", "1:05", "1:00:00", "1:02:05", "1:30.5", "24:00:00"]);
    equal(["90", "1:30", "1:00:00", "0:01.5", " 2:05 ", "1:60", "1:2:3:4", "abc", "", "-5", "1:-5"].map((text) => parseDuration(text) ?? null), [90, 90, 3600, 1.5, 125, null, null, null, null, null, null]);
    equal([formatDuration(-1), formatDuration(Number.NaN)], ["", ""]);
});

// ── The editor's options ──────────────────────────────────────────────────

check("options: one per setting next to the class's own, each with its attribute and the editor's fields unchanged", async () => {
    const widget = await card();
    // Read as plain records: the fields of every type of option at once.
    const options: Record<string, Record<string, any>> = widget.options;
    equal(Object.keys(options), ["caption", ...Object.keys(widget.settingsCore.declarations)], "static options are kept in front");
    for (const [name, option] of Object.entries(options).slice(1)) {
        assert(typeof option.attribute === "string" || option.attribute === false, `${name} names its attribute`);
        assert(!("default" in option) && typeof option.disabled !== "function", `${name} passes no module field on`);
    }
    equal([options.sound.attribute, options.loop.attribute, options.heading.attribute, options.days.attribute], ["no-sound", "loop", "heading", "days"], "a boolean that is true by default has the negative attribute");
    equal([options.sound.inverted, "inverted" in options.loop, "inverted" in options.heading], [true, false, false], "and says that it is inverted");
    assert(options.length.type === Number && options.heading.type === String && options.sound.type === Boolean, "constructors are passed on as they are");
    equal(
        [options.length.control, options.length.min, options.length.max, options.length.group, options.size.steps, options.size.unit, options.volume.step, options.loop.control, options.theme.control],
        ["duration", 5, 7200, "time", [16, 24, 40, 64], "px", 0.1, "switch", "segmented"],
    );
    equal([options.days.type, options.days.multiple, options.shows.control, options.shape.options![1].children!.length], ["select", true, "tree", 2]);
    equal([options.accent.type, options.accent.swatches, options.code.pattern, options.code.minlength, options.code.maxlength], ["color", ["#2563eb", "#16a34a", "#dc2626"], "[A-Z]{3}-\\d{2}", 6, 6]);
    equal([options.note.multiline, options.heading.placeholder, options.target.type, options.target.selector], [true, { _: "What the time is for" }, "reference", "ww-settings-plain"]);
    equal(["start", "day", "until", "contact", "link", "phone", "pin"].map((name) => options[name].type), ["time", "date", "datetime-local", "email", "url", "tel", "password"]);
});

check("options: the editor's writes arrive for every kind, also the inverted boolean through its negative attribute", async () => {
    const widget = await card();
    equal([editorSetOption(widget, "length", 120), editorSetOption(widget, "theme", "dark"), editorSetOption(widget, "loop", true), editorSetOption(widget, "sound", false)], [true, true, true, true]);
    equal([widget.length, widget.theme, widget.loop, widget.sound, widget.hasAttribute("no-sound")], [120, "dark", true, false, true]);
    equal([editorSetOption(widget, "sound", true), widget.hasAttribute("no-sound"), editorSetOption(widget, "length", null), widget.length], [true, false, true, 300]);
    equal([editorSetOption(widget, "length", 2), editorSetOption(widget, "theme", "pink")], [false, false], "the editor refuses what the generated option excludes");
    // A multiple selection is written by the editor as JSON, with ids it may not know.
    widget.setAttribute("days", JSON.stringify(["fri", "holiday"]));
    equal(widget.days, ["fri"]);
});

check("options: by default the editor writes the negative attribute of an inverted boolean itself", async () => {
    const host = await mount(`<div><template shadowrootmode="open"><input type="checkbox" data-ww-setting="chart"></template></div>`);
    const declarations = { chart: { type: Boolean, default: true }, plain: { type: Boolean } } satisfies SettingsDeclarations;
    const core = new SettingsCore(host, { declarations });
    core.connect();
    const { chart, plain }: Record<string, Record<string, any>> = core.editorOptions();
    equal([chart.attribute, chart.inverted, plain.attribute, "inverted" in plain], ["no-chart", true, "plain", false]);
    // The editor's rule for an inverted boolean: false writes the attribute, true removes it.
    host.toggleAttribute(chart.attribute as string, true);
    await frame();
    equal([core.get("chart"), host.shadowRoot!.querySelector("input")!.checked], [false, false]);
    host.removeAttribute("no-chart");
    equal(core.get("chart"), true);
    core.disconnect();
});

check("options: negativeBooleans names the form: 'inverted' is the default, and 'property' declares attribute: false for an editor that sets the property", async () => {
    const declarations = { chart: { type: Boolean, default: true }, plain: { type: Boolean } } satisfies SettingsDeclarations;
    const markup = `<div><template shadowrootmode="open"><input type="checkbox" data-ww-setting="chart"></template></div>`;
    const named = new SettingsCore(await mount(markup), { declarations, negativeBooleans: "inverted" });
    equal([named.editorOptions().chart.attribute, (named.editorOptions().chart as { inverted?: boolean }).inverted], ["no-chart", true]);

    const host = await mount<HTMLElement & { chart: boolean; options: unknown }>(markup);
    const core = new SettingsCore(host, { declarations, negativeBooleans: "property" });
    core.defineProperties();
    core.connect();
    host.options = core.editorOptions(); // where the editor reads the declaration
    const { chart, plain } = core.editorOptions();
    equal([chart.attribute, "inverted" in chart, plain.attribute, "inverted" in plain], [false, false, "plain", false]);
    // What the editor does for `attribute: false`: it sets the property, and the widget reflects it.
    equal([editorSetOption(host, "chart", false), host.chart, host.hasAttribute("no-chart")], [true, false, true]);
    await frame();
    equal(host.shadowRoot!.querySelector("input")!.checked, false);
    equal([editorSetOption(host, "chart", true), host.chart, host.hasAttribute("no-chart")], [true, true, false]);
    core.disconnect();
});

// ── Bound controls ────────────────────────────────────────────────────────

check("controls: each native control shows its setting, its limits and its choices", async () => {
    const widget = await card(`contenteditable lang="en"`);
    equal([control(widget, "heading").value, control(widget, "heading").maxLength, control(widget, "note").localName, control(widget, "note").value], ["Break", 24, "textarea", ""]);
    equal([control(widget, "length").value, control(widget, "start").value, control(widget, "day").value], ["5:00", "", ""], "a duration is shown as m:ss");

    const days = control(widget, "days");
    equal([[...days.options].map((option) => `${option.value}=${option.textContent}`), [...days.selectedOptions].length], [["mon=Monday", "wed=Wednesday", "fri=Friday"], 0], "an empty select is filled");
    const [slider, list] = controls(widget, "size");
    equal([slider.min, slider.max, slider.step, slider.value, slider.getAttribute("aria-valuetext")], ["0", "3", "1", "1", "24 px"], "a slider over steps moves through their positions");
    equal([[...list.options].map((option) => `${option.value}=${option.textContent}`), list.value], [["16=16 px", "24=24 px", "40=40 px", "64=64 px"], "24"], "and a select lists them");
    const volume = control(widget, "volume");
    equal([volume.min, volume.max, volume.step, volume.value], ["0", "1", "0.1", "0.5"]);
    const rounds = control(widget, "rounds");
    equal([rounds.min, rounds.max, rounds.step, rounds.value], ["1", "9", "1", "1"]);
    equal([control(widget, "sound").checked, control(widget, "loop").checked], [true, false]);

    equal(controls(widget, "theme").map((radio) => radio.checked), [true, false, false]);
    const shape = control(widget, "shape");
    const group = shape.querySelector("optgroup")!;
    equal([shape.children.length, group.label, [...group.children].map((option) => option.textContent), shape.value], [2, "Bars", ["Thin", "Wide"], "ring"], "a branch of choices is an optgroup");
    equal(controls(widget, "shows").map((box) => box.checked), [false, true, true], "one checkbox per choice of a list");

    const accent = control(widget, "accent");
    const swatches = widget.shadowRoot!.getElementById(accent.getAttribute("list")!) as HTMLDataListElement;
    equal([accent.value, [...swatches.options].map((option) => option.value)], ["#2563eb", ["#2563eb", "#16a34a", "#dc2626"]], "the swatches are the suggestions of the color field");
    const code = control(widget, "code");
    equal([code.pattern, code.minLength, code.maxLength, control(widget, "pin").minLength], ["[A-Z]{3}-\\d{2}", 6, 6, 4]);

    assign(widget, { heading: "Pause", length: 3725, days: ["wed", "fri"], size: 64, sound: false, theme: "dark", shape: "bar-wide", shows: ["hours"], accent: "#dc2626", start: "08:00", day: "2026-01-02" });
    await frame();
    equal([control(widget, "heading").value, control(widget, "length").value, [...days.selectedOptions].map((option) => option.value), slider.value, list.value], ["Pause", "1:02:05", ["wed", "fri"], "3", "64"]);
    equal([control(widget, "sound").checked, controls(widget, "theme").map((radio) => radio.checked), shape.value, controls(widget, "shows").map((box) => box.checked)], [false, [false, false, true], "bar-wide", [true, false, false]]);
    equal([accent.value, control(widget, "start").value, control(widget, "day").value, slider.getAttribute("aria-valuetext")], ["#dc2626", "08:00", "2026-01-02", "64 px"]);
    widget.setAttribute("rounds", "8");
    await frame();
    equal(rounds.value, "8", "a change from outside arrives in the control");
});

check("controls: labels come from the declaration in the widget's language, and follow it", async () => {
    const box = await mount(`<section lang="en"><ww-settings-plain contenteditable></ww-settings-plain></section>`);
    const widget = box.querySelector<SettingsPlain>("ww-settings-plain")!;
    await frame();
    equal([caption(widget, "heading"), caption(widget, "theme"), caption(widget, "theme=light"), caption(widget, "shows"), caption(widget, "pin")], ["Heading", "Theme", "Light", "Shows", "PIN"]);
    equal([caption(widget, "theme=dark"), caption(widget, "shows=seconds")], ["Dark", "seconds"], "a choice without a declared label shows its value");
    equal([...controls(widget, "theme"), control(widget, "heading"), control(widget, "days")].map((field) => field.hasAttribute("aria-label")), [false, false, false, false, false], "a control with a label needs no other name");
    equal([widget.settingsCore.labelOf("volume"), widget.settingsCore.labelOf("theme", "light"), widget.settingsCore.labelOf("nothing")], ["Volume", "Light", "nothing"]);

    box.lang = "de-AT";
    await until(() => caption(widget, "heading") === "Überschrift", "the labels did not follow the language");
    equal([caption(widget, "theme=light"), caption(widget, "theme=dark"), caption(widget, "pin"), widget.settingsCore.language], ["Hell", "Dunkel", "PIN", "de-AT"]);
    equal([control(widget, "days").options[0].textContent, control(widget, "shape").querySelector("optgroup")!.label], ["Montag", "Balken"], "filled choices are written again");
    widget.days = ["wed"];
    box.lang = "en";
    await until(() => control(widget, "days").options[1].textContent === "Wednesday", "the choices did not follow the language");
    equal([...control(widget, "days").selectedOptions].map((option) => option.value), ["wed"], "the selection survives the rewrite");
});

check("controls: each native control writes its setting", async () => {
    const widget = await card();
    const enter = (name: string, value: string | boolean, index = 0) => typeInto(control(widget, name, index), value, "input", "change");
    enter("heading", "Reading");
    enter("note", "first\nsecond");
    enter("length", "1:30");
    enter("start", "10:15");
    enter("day", "2026-12-24");
    enter("until", "2026-12-24T18:00");
    enter("size", "3");
    enter("volume", "0.8");
    enter("rounds", "4");
    enter("sound", false);
    enter("loop", true);
    enter("theme", true, 1);
    enter("shape", "bar-thin");
    enter("accent", "#16a34a");
    enter("code", "ABC-12");
    enter("contact", "a@example.org");
    enter("link", "https://example.org/");
    enter("phone", "030 1");
    enter("pin", "1234");
    enter("target", "first");
    const days = control(widget, "days");
    days.options[0].selected = days.options[2].selected = true;
    days.dispatchEvent(new Event("input", { bubbles: true }));
    enter("shows", true, 0);
    enter("shows", false, 1);
    equal(attributes(widget), {
        heading: "Reading", note: "first\nsecond", length: "90", start: "10:15", day: "2026-12-24", until: "2026-12-24T18:00", size: "64", volume: "0.8", rounds: "4", "no-sound": "", loop: "",
        theme: "light", shape: "bar-thin", accent: "#16a34a", code: "ABC-12", contact: "a@example.org", link: "https://example.org/", phone: "030 1", pin: "1234", target: "first",
        days: `["mon","fri"]`, shows: `["hours","seconds"]`,
    } as Record<string, string | null>);

    typeInto(controls(widget, "size")[1], "16", "input", "change");
    await frame();
    equal([widget.size, control(widget, "size").value], [16, "0"], "two controls of one setting follow each other");
    enter("rounds", "99");
    equal([widget.rounds, control(widget, "rounds").value], [9, "9"], "after the entry the field shows what was stored");
    enter("heading", "");
    equal([widget.heading, widget.hasAttribute("heading"), control(widget, "heading").value], ["Break", false, "Break"], "an empty text resets the setting");
    typeInto(control(widget, "rounds"), "");
    equal(widget.rounds, 9, "a number field that is empty for a moment changes nothing");
    typeInto(control(widget, "rounds"), "", "change");
    equal([widget.rounds, widget.hasAttribute("rounds"), control(widget, "rounds").value], [1, false, "1"], "left empty, it resets");
});

check("controls: an entry that does not fit is refused, reported on the control and taken back", async () => {
    const box = await mount(`<section lang="en"><ww-settings-plain contenteditable code="ABC-12"></ww-settings-plain></section>`);
    const widget = box.querySelector<SettingsPlain>("ww-settings-plain")!;
    await frame();
    const code = control(widget, "code");
    code.focus();
    typeInto(code, "abc");
    equal([widget.code, code.value, code.validationMessage], ["ABC-12", "abc", "This value is not allowed here."], "the field keeps the typing and says why it is not taken");
    typeInto(code, "XYZ-34");
    equal([widget.code, code.validationMessage], ["XYZ-34", ""]);
    typeInto(code, "nope", "input", "change");
    equal([widget.code, code.value, code.validationMessage], ["XYZ-34", "XYZ-34", ""], "on commit the field shows what is stored");

    const length = control(widget, "length");
    length.focus();
    typeInto(length, "1:99");
    equal([widget.length, length.validationMessage], [300, "Enter a duration, for example 1:30 or 90."]);
    box.lang = "de";
    typeInto(length, "soon");
    equal(length.validationMessage, "Bitte eine Dauer eingeben, zum Beispiel 1:30 oder 90.", "in the widget's language");
    typeInto(length, "2:00:00", "input", "change");
    equal([widget.length, length.value, length.validationMessage], [7200, "2:00:00", ""]);
    typeInto(length, "9:00:00", "input", "change");
    equal([widget.length, length.value], [7200, "2:00:00"], "a duration is limited like any number");

    const days = control(widget, "days");
    const extra = days.appendChild(new Option("Sunday", "sun"));
    extra.setAttribute("data-ww-choice", "");
    extra.selected = true;
    days.dispatchEvent(new Event("input", { bubbles: true }));
    equal([widget.days, widget.hasAttribute("days")], [[], false], "a choice that is not declared is not stored");
});

check("disabled: the control is off with the reason as its description, the option says so, and code still writes", async () => {
    const box = await mount(`<section lang="en"><ww-settings-plain contenteditable></ww-settings-plain></section>`);
    const widget = box.querySelector<SettingsPlain>("ww-settings-plain")!;
    await frame();
    const volume = control(widget, "volume");
    const log = events("optionschange");
    equal([volume.disabled, volume.hasAttribute("aria-description"), "disabled" in widget.options.volume], [false, false, false]);
    widget.rounds = 2;
    await frame();
    equal(log.log, [], "no event for an ordinary change");

    widget.sound = false;
    await until(() => log.log.length === 1, "optionschange was not dispatched when the result changed");
    equal([volume.disabled, volume.getAttribute("aria-description"), volume.title], [true, "The sound is off", "The sound is off"]);
    equal([widget.options.volume.disabled, widget.options.volume.disabledReason], [true, { _: "The sound is off", de: "Der Ton ist aus" }]);
    equal(widget.settingsCore.getSnapshot().disabled, { volume: { _: "The sound is off", de: "Der Ton ist aus" } });
    equal(editorSetOption(widget, "volume", 0.2), false, "the editor refuses the write");
    typeInto(volume, "0.9", "input", "change");
    equal([widget.volume, volume.value], [0.5, "0.5"], "the control takes no input and shows the stored value again");
    widget.volume = 0.9;
    equal([widget.volume, widget.getAttribute("volume")], [0.9, "0.9"], "a write from code is not blocked");

    box.lang = "de";
    await until(() => volume.getAttribute("aria-description") === "Der Ton ist aus", "the reason did not follow the language");
    widget.removeAttribute("no-sound");
    await until(() => !volume.disabled, "the control was not turned on again by a change of the attribute");
    equal([volume.hasAttribute("aria-description"), volume.hasAttribute("title"), "disabled" in widget.options.volume, log.stop().filter((type) => type === "optionschange").length >= 2], [false, false, false, true]);
});

check("access: a bound control works in both modes, and data-ww-can on its label keeps it to those who may", async () => {
    const reader = await card("");
    const label = control(reader, "volume").closest("label")!;
    typeInto(control(reader, "heading"), "By a reader", "input", "change");
    equal(reader.heading, "By a reader", "an unmarked control is usable by a reader");
    equal([visible(label), visible(control(reader, "heading"))], [false, true], "the mark on the label hides the label with its control");
    typeInto(control(reader, "volume"), "0.9", "input", "change");
    equal([reader.volume, control(reader, "volume").value], [0.5, "0.5"], "and its input is refused");

    reader.toggleAttribute("allow-volume", true);
    await until(() => visible(label), "the permission did not show the control");
    typeInto(control(reader, "volume"), "0.9", "input", "change");
    equal(reader.volume, 0.9);
    reader.removeAttribute("allow-volume");
    reader.toggleAttribute("contenteditable", true);
    await until(() => visible(label), "edit mode did not show the control");
    typeInto(control(reader, "volume"), "0.1", "input", "change");
    equal(reader.volume, 0.1);
});

// ── Undo ──────────────────────────────────────────────────────────────────

check("undo: an entry is one transaction from its first input to its change, and ends without one on blur, at rest and on disconnect", async () => {
    const widget = await card();
    const log = events("ww-transactionstart", "ww-transactionend");
    const steps = () => log.log.map((type) => (type === "ww-transactionstart" ? "start" : "end")).join(" ");
    const volume = control(widget, "volume");
    for (const value of ["0.6", "0.7", "0.8"]) typeInto(volume, value);
    equal([widget.getAttribute("volume"), steps()], ["0.8", "start"], "the attribute is written with every input, inside one open transaction");
    typeInto(volume, "0.8", "change");
    await until(() => steps() === "start end", "the change event did not end the transaction");

    const rounds = control(widget, "rounds");
    rounds.focus();
    typeInto(rounds, "5");
    typeInto(rounds, "");
    equal(steps(), "start end start");
    rounds.blur();
    // Seen at once, before the rest time could have ended the entry: the field shows the stored value again.
    equal([widget.rounds, rounds.value], [5, "5"], "leaving the field did not end the entry");
    await until(() => steps() === "start end start end", "leaving the field did not end the transaction");

    // A slider that is held still: no change event arrives. The widget sets a short rest time for this check.
    typeInto(volume, "0.2");
    equal(steps(), "start end start end start");
    await until(() => steps() === "start end start end start end", "an entry at rest did not end by itself", 5000);
    equal(widget.volume, 0.2);

    // The widget has left the document by the time its transaction ends, so the event is seen on the widget itself.
    const own: string[] = [];
    for (const type of ["ww-transactionstart", "ww-transactionend"]) widget.addEventListener(type, () => own.push(type));
    typeInto(volume, "0.3");
    widget.remove();
    await until(() => own.length === 2, "the open transaction did not end on disconnect");
    log.stop();
});

// ── What the template says wins ───────────────────────────────────────────

class OwnTemplate extends HTMLElement {
    static settings = {
        speed: { type: Number, default: 2, min: 1, max: 8, label: { _: "Speed" }, disabled: (host: HTMLElement) => host.hasAttribute("locked") && { _: "Locked" } },
        mode: { type: "select", default: "a", options: [{ value: "a" }, { value: "b", label: { _: "Second mode", de: "Zweiter Modus" } }], label: { _: "Mode", de: "Modus" } },
        tint: { type: "color", default: "#000000", swatches: ["#ff0000"] },
    } satisfies SettingsDeclarations;
    core = new SettingsCore(this);
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `
            <label>Tempo <input type="number" step="0.5" data-ww-setting="speed"></label>
            <input type="range" aria-label="Pace" title="Drag me" data-ww-setting="speed">
            <span data-ww-setting-label="speed">How fast</span>
            <select data-ww-setting="mode"><option value="b">Second</option><option value="a">First</option></select>
            <input type="radio" name="mode" value="a" data-ww-setting="mode"><input type="radio" name="mode" value="b" data-ww-setting="mode">
            <input type="text" class="bare" data-ww-setting="mode">
            <input type="color" list="mine" data-ww-setting="tint"><datalist id="mine"><option value="#00ff00"></datalist>`;
    }
    connectedCallback() {
        this.core.connect();
    }
    disconnectedCallback() {
        this.core.disconnect();
    }
}
customElements.define("ww-settings-own-template", OwnTemplate);

check("template: a label, a name, a caption, choices, a step and a list that the template wrote are left alone", async () => {
    const host = await mount<OwnTemplate>(`<ww-settings-own-template lang="en"></ww-settings-own-template>`);
    const root = host.shadowRoot!;
    const [number, range] = root.querySelectorAll("input");
    equal([number.hasAttribute("aria-label"), number.step, number.min, number.max], [false, "0.5", "1", "8"], "the limits still come from the declaration");
    equal([range.getAttribute("aria-label"), range.step, root.querySelector("span")!.textContent], ["Pace", "any", "How fast"]);
    const select = root.querySelector("select")!;
    equal([[...select.options].map((option) => option.textContent), select.value], [["Second", "First"], "a"]);
    equal([root.querySelector<HTMLInputElement>('[type="color"]')!.getAttribute("list"), root.querySelectorAll("datalist").length], ["mine", 1]);

    // Where the template says nothing, a control is named by the declaration: a choice by its own label, or its value.
    const [first, second] = root.querySelectorAll<HTMLInputElement>('[type="radio"]');
    const bare = root.querySelector<HTMLInputElement>(".bare")!;
    equal([first.getAttribute("aria-label"), second.getAttribute("aria-label"), bare.getAttribute("aria-label"), first.checked], ["a", "Second mode", "Mode", true]);
    host.lang = "de";
    await until(() => bare.getAttribute("aria-label") === "Modus", "the names did not follow the language");
    equal([second.getAttribute("aria-label"), range.getAttribute("aria-label")], ["Zweiter Modus", "Pace"]);
    host.lang = "en";

    host.toggleAttribute("locked", true);
    await until(() => range.disabled, "the control was not turned off");
    equal([range.title, range.getAttribute("aria-description"), number.title], ["Drag me", "Locked", "Locked"], "the template's own title stays");
});

// ── Development warnings and teardown ─────────────────────────────────────

class Careless extends HTMLElement {
    static settings = { size: { type: Number, default: 1, group: "missing" }, items: { type: Array as unknown as StringConstructor } } satisfies SettingsDeclarations;
    size = 3;
    core = new SettingsCore(this);
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `<label data-ww-can="allowSize"><input data-ww-setting="size"></label><input data-ww-setting="sise">`;
    }
}
customElements.define("ww-settings-careless", Careless);

check("development: a shadowing field, an undeclared group, a structured type, an unknown name and a mark without Permissions are reported once", async () => {
    const log = warnings();
    const host = await mount<Careless>(`<ww-settings-careless></ww-settings-careless>`);
    host.core.connect();
    host.core.refresh();
    host.core.disconnect();
    host.core.connect();
    host.core.disconnect();
    const messages = log.stop();
    for (const part of [`a class field named "size" shadows the setting`, `names the group "missing"`, `"items" is an object or an array`, `data-ww-setting="sise" names no declared setting`, `marked data-ww-can, but the widget has no Permissions`]) {
        equal(messages.filter((message) => message.includes(part)).length, 1, `warning about: ${part}`);
    }
    equal(messages.length, 5);

    // Warnings are counted per class, so a class that has not been checked yet shows whether the example is clean.
    customElements.define("ww-settings-plain-again", class extends (customElements.get("ww-settings-plain") as typeof HTMLElement) {});
    const quiet = warnings();
    await mount(`<ww-settings-plain-again contenteditable></ww-settings-plain-again>`);
    equal(quiet.stop(), [], "a widget that declares everything gets no warning");
});

check("teardown: nothing listens or follows after disconnect, module elements are gone, and a reconnect works again", async () => {
    const before = listeners(document, window);
    const outside = listenerTypes(document, window);
    const widget = await card();
    const root = widget.shadowRoot!;
    const parent = widget.parentElement!;
    assert(listeners(root) >= 3, "the core listens on the shadow root");
    equal([addedListeners(outside, document, window), root.querySelectorAll("datalist").length], [["online"], 1], "and outside the widget only for one thing: the module text listens for the browser coming back online, to ask again for a catalog that could not be loaded");
    widget.remove();
    equal([listeners(root, widget), listeners(document, window), root.querySelectorAll("datalist").length], [0, before, 0]);
    widget.setAttribute("rounds", "6");
    await frame(2);
    equal(control(widget, "rounds").value, "1", "a disconnected core no longer follows the attributes");
    typeInto(control(widget, "rounds"), "3", "input", "change");
    equal(widget.getAttribute("rounds"), "6", "and takes no input");

    parent.append(widget);
    await frame(2);
    equal([control(widget, "rounds").value, root.querySelectorAll("datalist").length], ["6", 1]);
    typeInto(control(widget, "rounds"), "3", "input", "change");
    equal(widget.rounds, 3);
});

run();
