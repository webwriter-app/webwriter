// Checks of the Localization helper: matching, per-instance languages, loading.
import { html, LitElement } from "lit";
import { assert, check, deepActive, equal, events, key, listeners, mount, settled, until } from "../../test/harness";
import { exerciseMessages } from "@webwriter/widget/exercise";
import type { Catalog, LocalePreferences, LocalizeErrorDetail } from "@webwriter/widget/localize";
import { obfuscate } from "@webwriter/widget/obfuscate";
import { localizer, matchLocale } from "@webwriter/lit/localize";
import { ExampleElement } from "../shared/base";
import type { OrderExercise } from "./index";

const CHECK = "s42cbd8dca939a9c7"; // the generated id of the message "Check"
const catalog = (text: string): Catalog => ({ templates: { [CHECK]: text } });

/** Gets `msg` as a property, which is the same function in every language. */
class PassedLabel extends LitElement {
    static properties = { msg: { attribute: false } };
    declare msg: (text: string) => string;
    render() {
        return this.msg("Check");
    }
}

type ProbeOptions = { targetLocales?: string[]; prefer?: LocalePreferences; drawer?: boolean; wait?: boolean };

/** A widget class of its own per check, because catalogs are shared per class. `load` waits until the check releases it. */
function probe(options: ProbeOptions = {}) {
    const calls: string[] = [];
    const gates = new Map<string, Deferred>();
    const gate = (locale: string) => gates.get(locale) ?? gates.set(locale, deferred()).get(locale)!;
    class LocaleProbe extends ExampleElement {
        static scopedElements = { "ww-passed-label": PassedLabel };
        /** What each render showed, in order. */
        painted: string[] = [];
        localize = localizer(this, {
            sourceLocale: "en",
            targetLocales: options.targetLocales ?? ["de", "fr"],
            prefer: options.prefer,
            drawer: options.drawer,
            load(locale) {
                calls.push(locale);
                return gate(locale).promise;
            },
        });
        msg = this.localize.msg;
        /** The documented way to keep the source language off the screen: wait for the catalog before the first render. */
        protected async scheduleUpdate() {
            if (options.wait && !this.hasUpdated) await this.localize.loaded;
            return super.scheduleUpdate();
        }
        protected updated() {
            this.painted.push(this.renderRoot.querySelector("p")!.textContent!);
        }
        render() {
            return html`<p>${this.msg("Check")}</p><ww-passed-label .msg=${this.msg}></ww-passed-label>`;
        }
    }
    const tag = `ww-locale-probe-${++probes}`;
    customElements.define(tag, LocaleProbe);
    const text = (widget: Element) => widget.shadowRoot!.querySelector("p")!.textContent;
    return { tag, calls, gate, gates, text };
}
let probes = 0;
type Deferred = { promise: Promise<Catalog>; resolve(catalog: Catalog): void; reject(error: Error): void };
function deferred(): Deferred {
    let resolve!: Deferred["resolve"], reject!: Deferred["reject"];
    const promise = new Promise<Catalog>((yes, no) => ((resolve = yes), (reject = no)));
    return { promise, resolve, reject };
}
type Probe = ExampleElement & { localize: ReturnType<typeof localizer>; painted: string[] };

const exercise = (attributes: string) =>
    `<ww-order-exercise ${attributes} solution="${obfuscate(["a", "b", "c"])}">
        <data value="b">Boil</data><data value="a">Add</data><data value="c">Cool</data>
        <script type="application/json" slot="data">{}</script>
    </ww-order-exercise>`;
const button = (widget: Element, id: string) => widget.shadowRoot!.querySelector<HTMLButtonElement>(`#${id}`)!;
const label = (widget: Element, id = "check") => button(widget, id).textContent!.trim();
const output = (widget: Element) => widget.shadowRoot!.querySelector("output")!;
const marks = (widget: Element) => [...widget.shadowRoot!.querySelectorAll("ww-order-mark")].map((mark) => mark.shadowRoot!.textContent!.trim());
const squeeze = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

check("localize: matching a language tag to the configured locales", () => {
    const cases: [tag: string, targets: string[], expected: string][] = [
        ["de", ["de", "fr"], "de"],
        ["DE_at", ["de", "fr"], "de"], // shorter tag, any case, underscore
        ["de-Latn-AT-1996", ["de"], "de"],
        ["de", ["de-DE", "fr"], "de-DE"], // likely region
        ["zh-TW", ["zh-Hans", "zh-Hant"], "zh-Hant"], // likely script
        ["zh", ["zh-Hans", "zh-Hant"], "zh-Hans"],
        ["zh-HK", ["zh", "zh-Hant"], "zh-Hant"], // the likely script comes before the bare language
        ["zh-Hant-HK", ["zh", "zh-Hant"], "zh-Hant"],
        ["pt", ["pt-PT", "pt-BR"], "pt-BR"], // likely region of "pt"
        ["pt-AO", ["pt-PT", "pt-BR"], "pt-PT"], // no likely match: the first locale of the language
        ["sr-Latn", ["sr", "sr-Latn"], "sr-Latn"],
        ["en-GB", ["de"], "en"], // the source locale
        ["es", ["de"], "en"],
        ["", ["de"], "en"],
        ["not a tag!", ["de"], "en"],
    ];
    for (const [tag, targets, expected] of cases) equal(matchLocale(tag, "en", targets), expected, `"${tag}" among ${targets}`);
});

check("localize: aliases, deprecated codes and a widget's own preferences", () => {
    const cases: [tag: string, targets: string[], expected: string, prefer?: LocalePreferences][] = [
        // What Intl.Locale does not know: Norwegian without a variant is Bokmål, in both directions.
        ["no", ["nb"], "nb"],
        ["no-NO", ["nb", "nb-NO"], "nb-NO"],
        ["nb-NO", ["no"], "no"],
        ["no", ["no", "nb"], "no"], // the language itself comes first
        ["nn", ["nb"], "en"], // Nynorsk is not Bokmål
        // The defaults of the localizer copies in the widget packages (slides/localization/localizer.ts).
        ["bn", ["bn-BD"], "bn-BD"],
        ["de", ["de-DE"], "de-DE"],
        ["es", ["es-ES", "es-MX"], "es-ES"],
        ["fa", ["fa-IR"], "fa-IR"],
        ["fr", ["fr-CA", "fr-FR"], "fr-FR"],
        ["pt", ["pt-PT"], "pt-PT"],
        // Deprecated codes, which Intl.Locale replaces.
        ["iw", ["he"], "he"],
        ["tl", ["fil"], "fil"],
        ["ur-Aran-PK", ["ur-Arab"], "ur-Arab"], // Nastaliq is written as the Arabic script in catalogs
        // A widget's own choice among its locales.
        ["pt", ["pt-BR", "pt-PT"], "pt-BR"],
        ["pt", ["pt-BR", "pt-PT"], "pt-PT", { pt: "pt-PT" }],
        ["pt-AO", ["pt-BR", "pt-PT"], "pt-PT", { pt: "pt-PT" }], // also for longer tags of the language
        ["pt_BR", ["pt-BR", "pt-PT"], "pt-BR", { pt: "pt-PT" }], // the tag itself still comes first
        ["zh-HK", ["zh-Hans", "zh-Hant"], "zh-Hans", { "zh-HK": "zh-Hans" }],
        ["zh-TW", ["zh-Hans", "zh-Hant"], "zh-Hant", { "zh-HK": "zh-Hans" }],
        ["de", ["de"], "de", { de: "de-CH" }], // a preference for a locale the widget does not have is skipped
        ["es", ["de"], "de", { ES: "de" }], // any locale can stand in, and keys are tags in any case
    ];
    for (const [tag, targets, expected, prefer] of cases) equal(matchLocale(tag, "en", targets, prefer), expected, `"${tag}" among ${targets}`);
});

check("localize: two instances of one widget show different languages at the same time", async () => {
    const page = await mount(`<div>${exercise(`id="english" lang="en"`)}${exercise(`id="german" lang="de-AT"`)}</div>`);
    const [english, german] = page.children as unknown as OrderExercise[];
    await until(() => label(german) === "Prüfen", "the German instance loads its catalog");
    equal(label(english), "Check");
    equal([english.localize.getLocale(), german.localize.getLocale()], ["en", "de"]);

    button(english, "check").click();
    button(german, "check").click();
    await settled(english, german);
    // An html-templated message with two expressions, which the German catalog puts in the other order.
    equal(squeeze(output(english).textContent), "1 of 3 items are in the right place.");
    equal(squeeze(output(german).textContent), "Von 3 Einträgen stehen 1 am richtigen Platz.");
    equal([output(english).querySelector("b")?.textContent, output(german).querySelector("b")?.textContent], ["1", "1"], "the markup of the message is kept");
    // Components inside each widget follow their own widget.
    equal(marks(english), ["Wrong", "Wrong", "Correct"]);
    equal(marks(german), ["Falsch", "Falsch", "Richtig"]);

    // Rendering one again does not disturb the other, in either order.
    english.requestUpdate();
    german.requestUpdate();
    await settled(english, german);
    equal([label(english), label(german), label(english, "reset"), label(german, "reset")], ["Check", "Prüfen", "Reset", "Zurücksetzen"]);
    equal(squeeze(output(english).textContent), "1 of 3 items are in the right place.");
    equal(marks(german), ["Falsch", "Falsch", "Richtig"]);
});

check("localize: a language change re-renders the widget and its components and sends optionschange", async () => {
    const page = await mount(`<div lang="en">${exercise("")}</div>`);
    const widget = page.firstElementChild as OrderExercise;
    button(widget, "check").click();
    await settled(widget);
    equal([label(widget), ...marks(widget)], ["Check", "Wrong", "Wrong", "Correct"]);
    equal(widget.actions.check.label, { _: "Check" });

    // The helper's German catalog has arrived, so that only the change of language is counted below.
    await exerciseMessages.load("de");
    await settled(widget);
    const log = events("optionschange");
    page.lang = "de"; // inherited, not set on the widget
    await until(() => label(widget) === "Prüfen", "the widget follows its ancestor's language");
    await settled(widget);
    equal(marks(widget), ["Falsch", "Falsch", "Richtig"], "the inner components were rendered again");
    equal(log.log, ["optionschange", "optionschange"], "the editor is told to read the declarations again: by the Exercise helper for its labels and by the localizer for the widget's");
    equal(widget.actions.check.label, { _: "Prüfen" }, "and finds the drawer label in the new language");
    assert(!widget.hasAttribute("lang"), "the inherited language is not written to the widget");

    widget.lang = "en";
    await until(() => label(widget) === "Check", "back to the source language");
    await settled(widget);
    equal(marks(widget), ["Wrong", "Wrong", "Correct"]);
    equal(log.stop().length, 4, "and twice again for the way back");
});

check("localize: the keyboard announcements of Drag are in the widget's language, from Drag's own catalog", async () => {
    const widget = await mount<OrderExercise>(exercise(`lang="de"`));
    await until(() => label(widget) === "Prüfen");
    const live = () => widget.shadowRoot!.querySelector("[aria-live]")?.textContent ?? "";
    widget.shadowRoot!.querySelector<HTMLElement>("li")!.focus();
    assert(deepActive()?.localName === "li", "an item has the focus");
    key(" ");
    assert(live().startsWith("Boil aufgenommen."), `pick-up: "${live()}"`);
    key("ArrowDown");
    equal(live(), "Platz 2 von 3");
    key("Escape");
    equal(live(), "Abgebrochen.");
});

check("localize: a catalog that arrives late for a language that is no longer current is dropped", async () => {
    const { tag, gate, text } = probe();
    const widget = await mount<Probe>(`<${tag}></${tag}>`);
    const german = widget.localize.setLocale("de");
    const french = widget.localize.setLocale("fr");
    gate("fr").resolve(catalog("Vérifier"));
    await french;
    await settled(widget);
    equal([widget.localize.getLocale(), text(widget)], ["fr", "Vérifier"]);
    gate("de").resolve(catalog("Prüfen"));
    await german;
    await settled(widget);
    equal([widget.localize.getLocale(), text(widget)], ["fr", "Vérifier"], "the late German catalog changed nothing");

    // The same when the widget went back to the source language, which needs no load.
    const other = probe();
    const second = await mount<Probe>(`<${other.tag}></${other.tag}>`);
    const pending = second.localize.setLocale("de");
    await second.localize.setLocale("en-US");
    other.gate("de").resolve(catalog("Prüfen"));
    await pending;
    await settled(second);
    equal([second.localize.getLocale(), other.text(second)], ["en", "Check"]);
});

check("localize: a catalog is loaded once for all instances, and a failed load is reported and tried again", async () => {
    const { tag, calls, gate, gates, text } = probe();
    const page = await mount(`<div lang="de"><${tag}></${tag}><${tag}></${tag}><${tag} lang="en"></${tag}></div>`);
    const [first, second, english] = page.children as unknown as Probe[];
    equal(calls, ["de"], "two German instances, one load; the English one loads nothing");
    const failures: unknown[] = [];
    page.addEventListener("localizationerror", (event) => failures.push((event as CustomEvent).detail.error), true);
    gate("de").reject(new Error("offline"));
    await until(() => failures.length === 2, "the failure is reported on both widgets");
    equal([first.localize.getLocale(), text(first)], ["en", "Check"], "the widget stays in the language it had");

    gates.delete("de");
    const done = Promise.all([first.localize.setLocale("de"), second.localize.setLocale("de")]);
    equal(calls, ["de", "de"], "the failed load is not cached");
    gate("de").resolve(catalog("Prüfen"));
    await done;
    await settled(first, second, english);
    equal([text(first), text(second), text(english)], ["Prüfen", "Prüfen", "Check"]);
});

check("finding: a component that gets the widget's msg as a property keeps the old language", async () => {
    const { tag, gate, text } = probe();
    const widget = await mount<Probe>(`<${tag}></${tag}>`);
    const passed = widget.shadowRoot!.querySelector("ww-passed-label")!;
    gate("de").resolve(catalog("Prüfen"));
    await widget.localize.setLocale("de");
    await settled(widget, passed);
    equal(text(widget), "Prüfen");
    // `msg` is one function for the life of the widget, so Lit sees no changed property and does not render
    // the component again. widgetMsg() subscribes instead (see the order marks in the checks above).
    equal(passed.shadowRoot!.textContent!.trim(), "Check");
});

// ── The second round ──────────────────────────────────────────────────────

check("localize: the first paint is in the source language; a widget that waits for its catalog paints the right language first", async () => {
    const plain = probe();
    const page = await mount(`<div lang="de"><${plain.tag}></${plain.tag}></div>`);
    const widget = page.firstElementChild as Probe;
    await settled(widget);
    equal([widget.painted, plain.calls], [["Check"], ["de"]], "painted at once, in English, while the catalog loads");
    plain.gate("de").resolve(catalog("Prüfen"));
    await until(() => plain.text(widget) === "Prüfen", "rendered again when the catalog is in");
    // LitElementWw renders once more when setLocale() has resolved, so the German text may be painted twice.
    equal([...new Set(widget.painted)], ["Check", "Prüfen"]);

    const waiting = probe({ wait: true });
    const other = await mount(`<div lang="de"><${waiting.tag}></${waiting.tag}><${waiting.tag} lang="en"></${waiting.tag}></div>`);
    const [german, english] = other.children as unknown as Probe[];
    await settled(english);
    equal([german.painted, english.painted], [[], ["Check"]], "nothing is painted while the catalog loads; the source language needs no wait");
    assert(!german.shadowRoot!.querySelector("p"), "the shadow root is still empty");
    waiting.gate("de").resolve(catalog("Prüfen"));
    await until(() => german.painted.length > 0, "the first paint follows the catalog");
    equal([...new Set(german.painted)], ["Prüfen"], "and it is German: the source language never showed");

    // A failed load does not keep the widget blank.
    const failing = probe({ wait: true });
    const third = await mount(`<div lang="de"><${failing.tag}></${failing.tag}></div>`);
    failing.gate("de").reject(new Error("offline"));
    await until(() => (third.firstElementChild as Probe).painted.length > 0, "painted after the failure");
    equal((third.firstElementChild as Probe).painted, ["Check"]);
});

check("localize: a failed load is reported with its locale, never rejects, and is tried again when the browser is back online", async () => {
    const { tag, calls, gate, gates, text } = probe();
    const page = await mount(`<div lang="de-CH"><${tag}></${tag}></div>`);
    const widget = page.firstElementChild as Probe;
    const failures: LocalizeErrorDetail[] = [];
    document.addEventListener("localizationerror", (event) => failures.push((event as CustomEvent<LocalizeErrorDetail>).detail), { once: true });
    const error = new Error("offline");
    gate("de").reject(error);
    await until(() => failures.length === 1, "the event bubbles to the document");
    equal([failures[0].locale, failures[0].error === error], ["de", true], "it names the locale and carries the error");
    equal([widget.localize.getLocale(), text(widget)], ["en", "Check"]);

    gates.delete("de");
    gate("de").reject(new Error("still offline"));
    await widget.localize.setLocale("de-CH"); // must not reject
    equal(calls, ["de", "de"], "asking again loads again");

    gates.delete("de");
    window.dispatchEvent(new Event("online"));
    equal(calls, ["de", "de", "de"], "back online: the missing catalog is asked for again");
    gate("de").resolve(catalog("Prüfen"));
    await until(() => text(widget) === "Prüfen", "and shown");
    window.dispatchEvent(new Event("online"));
    equal(calls.length, 3, "nothing is missing any more");
});

check("localize: an instance whose load failed takes the catalog over when another instance of its class loaded it", async () => {
    const { tag, calls, gate, gates, text } = probe();
    const page = await mount(`<div lang="de"><${tag}></${tag}></div>`);
    const first = page.firstElementChild as Probe;
    const failed = new Promise((done) => page.addEventListener("localizationerror", done, { once: true }));
    gate("de").reject(new Error("offline"));
    await failed;
    equal(text(first), "Check");

    gates.delete("de");
    page.insertAdjacentHTML("beforeend", `<${tag}></${tag}>`);
    const second = page.lastElementChild as Probe;
    await settled(second);
    equal(calls, ["de", "de"], "the new instance loads the catalog");
    gate("de").resolve(catalog("Prüfen"));
    await until(() => text(second) === "Prüfen" && text(first) === "Prüfen", "both show it, though only one asked");
    equal(calls.length, 2, "with one load");

    // A removed instance is not kept and not updated.
    const before = listeners();
    first.remove();
    equal(listeners(), before - 1, "its listener for `online` is gone");
});

check("localize: optionschange follows a language change only where drawer labels are computed with msg", async () => {
    const maps = probe();
    const computed = probe({ drawer: true });
    const page = await mount(`<div><${maps.tag}></${maps.tag}><${computed.tag}></${computed.tag}></div>`);
    const [first, second] = page.children as unknown as Probe[];
    const heard: EventTarget[] = [];
    page.addEventListener("optionschange", (event) => heard.push(event.target!));
    maps.gate("de").resolve(catalog("Prüfen"));
    computed.gate("de").resolve(catalog("Prüfen"));
    page.lang = "de";
    await until(() => maps.text(first) === "Prüfen" && computed.text(second) === "Prüfen");
    equal(heard.length, 1, "one event");
    assert(heard[0] === second, "from the widget that asked for it with `drawer`");
});

check("localize: a widget's own preference decides between its locales", async () => {
    const { tag, calls, gate } = probe({ targetLocales: ["pt-BR", "pt-PT"], prefer: { pt: "pt-PT" } });
    const widget = await mount<Probe>(`<${tag} lang="pt"></${tag}>`);
    equal(calls, ["pt-PT"], "the preferred catalog is loaded, not the likely one");
    gate("pt-PT").resolve(catalog("Verificar"));
    await until(() => widget.localize.getLocale() === "pt-PT");
    widget.lang = "pt-BR";
    await until(() => calls.length === 2);
    equal(calls[1], "pt-BR", "a tag the widget has still comes first");
});
