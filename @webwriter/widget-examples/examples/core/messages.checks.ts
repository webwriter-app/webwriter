// Checks of the module messages and of the shared live region.
import { assert, check, equal, events, frame, mount, until } from "../../test/harness";
import { announcer } from "@webwriter/widget/announce";
import { defineMessages, languageOf, loadMessages, messageLocale, Messages, resolveMessages, type Catalog, type MessagesErrorDetail } from "@webwriter/widget/messages";
import { widgetLanguage } from "@webwriter/widget";
import { sharedMessages } from "@webwriter/widget/messages/shared";

// A module's table, as a module declares it: English defaults, strings and functions.
type DemoMessages = {
    zoomIn: string;
    close: string;
    dropped: (item: string, target?: string) => string;
};
const de: Catalog<DemoMessages> = {
    zoomIn: "Vergrößern",
    dropped: (item, target) => (target ? `${item} auf ${target} abgelegt.` : `${item} abgelegt.`),
    // `close` is not translated yet.
};
const ptBR: Catalog<DemoMessages> = { zoomIn: "Ampliar" };
const demo = defineMessages<DemoMessages>(
    { zoomIn: "Zoom in", close: "Close", dropped: (item, target) => (target ? `Dropped ${item} on ${target}.` : `Dropped ${item}.`) },
    { de, "pt-BR": ptBR },
);

// ── Messages ──────────────────────────────────────────────────────────────

check("messages: defaults, a shipped catalog, missing entries and locale matching", () => {
    const text = (language: string) => {
        const table = resolveMessages(demo, language);
        return [table.zoomIn, table.close, table.dropped("A", "B")];
    };
    equal(text(""), ["Zoom in", "Close", "Dropped A on B."], "no language: the English defaults");
    equal(text("de"), ["Vergrößern", "Close", "A auf B abgelegt."], "an entry the catalog lacks stays English");
    equal(["de-AT", "DE_ch", "pt", "pt-PT", "fr", "en-GB", "not a tag"].map((tag) => messageLocale(demo, tag)), ["de", "de", "pt-BR", "pt-BR", "en", "en", "en"]);
    equal(resolveMessages(demo, "de", { zoomIn: "Näher" }).zoomIn, "Näher", "an override wins over the catalog");
});

check("messages: a shipped catalog is a file of its own that is loaded for the language, and the text is English until it has arrived", async () => {
    assert(sharedMessages.locales.includes("de"), "the shared messages ship a German catalog");
    // A table of the module's own kind: every catalog is a loader. This one arrives when the check says so.
    let arrive!: (module: { default: Catalog<DemoMessages> }) => void;
    let loads = 0;
    const lazy = defineMessages<DemoMessages>(demo.defaults, { de: () => (loads++, new Promise((resolve) => (arrive = resolve))) });
    equal([lazy.locales, Object.keys(lazy.catalogs), loads], [["de"], [], 0], "declared, and not asked for yet");

    const page = await mount(`<section lang="de-AT"><div id="widget"><template shadowrootmode="open"><span></span></template></div></section>`);
    const messages = new Messages(page.querySelector<HTMLElement>("#widget")!, lazy);
    let changes = 0;
    const stop = messages.follow(() => changes++);
    equal([messages.locale, messages.loaded, messages.current.zoomIn, loads], ["de", false, "Zoom in", 1], "following asks for the catalog, and the text is English meanwhile");
    equal(resolveMessages(lazy, "de").zoomIn, "Zoom in", "resolveMessages() answers with what has arrived");
    const waited = loadMessages(lazy, "de-AT");
    equal([messages.current.zoomIn, loads], ["Zoom in", 1], "a read and another request do not load it twice");

    arrive({ default: de });
    equal((await waited).zoomIn, "Vergrößern", "loadMessages() resolves with the catalog's text");
    await until(() => changes === 1, "the follower was not told that the catalog arrived");
    equal([messages.loaded, messages.current.zoomIn, messages.current.close, resolveMessages(lazy, "de").zoomIn], [true, "Vergrößern", "Close", "Vergrößern"]);
    stop();

    // The shared catalog that the modules ship, through the real dynamic import of its file.
    equal((await loadMessages(sharedMessages, "de-DE")).cancelled, "Abgebrochen.", "the shipped shared catalog");
    equal(resolveMessages(sharedMessages, "de-DE").cancelled, "Abgebrochen.", "and from then on it answers at once");
});

check("messages: a catalog that arrives after the language changed again is not shown, and one that fails is reported and tried again", async () => {
    let arrive!: (module: { default: Catalog<DemoMessages> }) => void;
    let fail = true;
    let loads = 0;
    const lazy = defineMessages<DemoMessages>(demo.defaults, {
        de: () => new Promise((resolve) => (arrive = resolve)),
        "pt-BR": () => (loads++, fail ? Promise.reject(new Error("offline")) : Promise.resolve({ default: ptBR })),
    });
    const page = await mount(`<section lang="de"><div id="widget"><template shadowrootmode="open"><span></span></template></div></section>`);
    const widget = page.querySelector<HTMLElement>("#widget")!;
    const messages = new Messages(widget, lazy);
    let changes = 0;
    const stop = messages.follow(() => changes++);
    page.lang = "en";
    await frame();
    equal([changes, messages.current.zoomIn], [1, "Zoom in"], "the language changed while the German catalog was on its way");
    arrive({ default: de });
    await frame(2);
    equal([changes, messages.current.zoomIn], [1, "Zoom in"], "the late catalog changes nothing that is shown");

    const errors: MessagesErrorDetail[] = [];
    const listen = (event: Event) => void errors.push((event as CustomEvent<MessagesErrorDetail>).detail);
    document.addEventListener("localizationerror", listen);
    try {
        const log = events("localizationerror");
        page.lang = "pt";
        await until(() => errors.length === 1, "the failed load was not reported");
        equal([log.stop(), errors[0].locale, String(errors[0].error), messages.loaded, messages.current.zoomIn], [["localizationerror"], "pt-BR", "Error: offline", false, "Zoom in"], "reported on the widget, and the text stays English");
        void messages.current;
        await frame(2);
        equal(loads, 1, "a failed load is not asked for again by every read");
        fail = false;
        window.dispatchEvent(new Event("online"));
        await until(() => messages.current.zoomIn === "Ampliar", "the catalog was not loaded again when the browser came back online");
        equal([loads, messages.loaded], [2, true]);
    } finally {
        document.removeEventListener("localizationerror", listen);
        stop();
    }
});

check("messages: the language is the host's or the nearest ancestor's, through shadow roots", async () => {
    const page = await mount(
        `<section lang="de"><div id="widget"><template shadowrootmode="open"><span id="part"><template shadowrootmode="open"><b></b></template></span><i lang="pt-BR"></i></template></div><p lang=""><em></em></p></section>`,
    );
    const widget = page.querySelector<HTMLElement>("#widget")!;
    const part = widget.shadowRoot!.querySelector("#part")!;
    const deep = part.shadowRoot!.querySelector("b")!;
    equal([languageOf(widget), languageOf(part), languageOf(deep)], ["de", "de", "de"], "inherited from the section, two shadow roots down");
    equal(languageOf(widget.shadowRoot!.querySelector("i")!), "pt-BR", "the nearest one counts");
    equal([widgetLanguage(deep as HTMLElement), widgetLanguage(page.querySelector("em")!)], ["de", ""], "the widget's own `lang` is found the same way");
    equal(languageOf(page.querySelector("em")!), "", `lang="" ends the search`);
    widget.lang = "en";
    equal([languageOf(widget), languageOf(deep)], ["en", "en"], "the host's own attribute comes first");
    page.remove();
    equal(languageOf(page), "de", "a detached tree is answered by what it has");
});

check("messages: an instance follows its widget's language, and the override always wins", async () => {
    const page = await mount(`<section><div id="widget"><template shadowrootmode="open"><span></span></template></div></section>`);
    const widget = page.querySelector<HTMLElement>("#widget")!;
    const inner = widget.shadowRoot!.querySelector("span")!;
    const messages = new Messages(inner, demo);
    let changes = 0;
    const stop = messages.follow(() => changes++);

    equal([messages.language, messages.locale, messages.current.zoomIn], ["", "en", "Zoom in"]);
    const english = messages.current;
    assert(messages.current === english, "the table is the same object while the language stays");

    page.lang = "de-AT"; // an ancestor of the widget, outside its shadow root
    equal([messages.locale, messages.current.zoomIn, messages.current.dropped("A")], ["de", "Vergrößern", "A abgelegt."], "read at once, without waiting for the observer");
    await frame();
    equal(changes, 1, "followers are told");
    page.lang = "de-CH";
    await frame();
    equal(changes, 1, "a tag that the same catalog answers is no change");
    widget.lang = "pt";
    await frame();
    equal([changes, messages.current.zoomIn, messages.current.close], [2, "Ampliar", "Close"]);
    widget.removeAttribute("lang");
    page.removeAttribute("lang");
    await frame();
    equal([changes, messages.current === english], [3, false], "back to the defaults");
    equal(messages.current.zoomIn, "Zoom in");

    stop();
    page.lang = "de";
    await frame();
    equal([changes, messages.current.zoomIn], [3, "Vergrößern"], "after stop() nobody is told, but reads stay correct");

    const fixed = new Messages(inner, demo, { close: "Schließen!" });
    let own = "Zu";
    const asked = new Messages(inner, demo, () => ({ close: own }));
    equal([fixed.current.close, fixed.current.zoomIn, asked.current.close], ["Schließen!", "Vergrößern", "Zu"]);
    own = "Fenster zu";
    page.lang = "en";
    equal([fixed.current.close, fixed.current.zoomIn, asked.current.close], ["Schließen!", "Zoom in", "Fenster zu"], "in every language; a function is asked on every read");
});

// ── The live region ───────────────────────────────────────────────────────

check("announce: one polite region per shadow root, shared, hidden and removed with its last user", async () => {
    const host = await mount(`<div><template shadowrootmode="open"><p>content</p></template></div>`);
    const root = host.shadowRoot!;
    const sheets = root.adoptedStyleSheets.length;
    const first = announcer(root);
    const second = announcer(root);
    const regions = () => root.querySelectorAll<HTMLElement>("[aria-live]");
    equal([regions().length, regions()[0].getAttribute("aria-live"), regions()[0].textContent], [1, "polite", ""], "the empty region exists before anything is said");
    const region = regions()[0];
    const box = region.getBoundingClientRect();
    equal([box.width, box.height, getComputedStyle(region).position, region.style.length], [1, 1, "absolute", 0], "hidden by the module's sheet, not by a style attribute");

    first.announce("Picked up A.");
    equal(region.textContent, "Picked up A.");
    second.announce("Zoom 200%");
    equal(region.textContent, "Zoom 200%", "both modules speak through the same region");
    second.announce("Zoom 200%");
    assert(region.textContent !== "Zoom 200%" && region.textContent!.trim() === "Zoom 200%", "the same text again is a change, so it is read again");

    root.replaceChildren(); // a framework may clear the shadow root
    first.announce("Dropped A.");
    equal([regions().length, regions()[0] === region, region.textContent], [1, true, "Dropped A."], "the region is put back");

    first.release();
    first.release();
    first.announce("ignored");
    equal([regions().length, region.textContent], [1, "Dropped A."], "still there for the other user; a released one is silent");
    second.release();
    equal([regions().length, root.adoptedStyleSheets.length], [0, sheets], "the last release removes the region and its sheet");

    const again = announcer(root);
    again.announce("back");
    equal([regions().length, regions()[0].textContent], [1, "back"], "and a later user gets a new one");
    again.release();
});
