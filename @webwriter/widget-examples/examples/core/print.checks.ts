// Checks of the print note: a note that appears on paper only, in the widget's language, with the address of the
// document where it is known. The core with a plain element, the Lit binding, and the catalogs.
import { assert, check, equal, frame, mount, until } from "../../test/harness";
import { html } from "lit";
import { PrintNoteCore, documentAddress, printMessages } from "@webwriter/widget/print";
import { PrintNote } from "@webwriter/lit/print";
import { ExampleElement } from "../shared/base";

/** A plain element with a shadow root and a print note. */
class PlainNote extends HTMLElement {
    note = new PrintNoteCore(this, { address: () => this.address });
    address: string | null | undefined = null;
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `<slot></slot>`;
    }
    connectedCallback() {
        this.note.connect();
    }
    disconnectedCallback() {
        this.note.disconnect();
    }
}
customElements.define("ww-print-plain", PlainNote);

class TemplateNote extends HTMLElement {
    note = new PrintNoteCore(this);
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `<section><p data-ww-print-note></p></section><slot></slot>`;
    }
    connectedCallback() {
        this.note.connect();
    }
    disconnectedCallback() {
        this.note.disconnect();
    }
}
customElements.define("ww-print-template", TemplateNote);

class LitNote extends ExampleElement {
    static properties = { lang: { reflect: true } };
    note = new PrintNote(this, { address: "https://example.org/lesson" });
    render() {
        return html`<slot></slot>`;
    }
}
customElements.define("ww-print-lit", LitNote);

const noteOf = (host: Element) => host.shadowRoot!.querySelector<HTMLElement>("[data-ww-print-note]")!;
const ENGLISH = printMessages.defaults.note;

check("print note: a note at the end of the shadow root that is hidden on screen and shown for the editor's class", async () => {
    const host = await mount<PlainNote>(`<ww-print-plain></ww-print-plain>`);
    await frame();
    const note = noteOf(host);
    assert(note, "the module added a note");
    equal(note.parentNode, host.shadowRoot, "in the shadow root");
    equal(host.shadowRoot!.lastElementChild, note, "at its end");
    equal(note.textContent, ENGLISH, "in English without a language");
    equal(getComputedStyle(note).display, "none", "hidden on screen");
    host.classList.add("ww-beforeprint");
    equal(getComputedStyle(note).display, "block", "shown while the editor prints");
    host.classList.remove("ww-beforeprint");
    equal(getComputedStyle(note).display, "none", "and hidden again");
    equal(host.note.getSnapshot(), { text: ENGLISH, address: null }, "the snapshot");
});

check("print note: the text is in the widget's language, in every shipped language", async () => {
    const host = await mount<PlainNote>(`<ww-print-plain lang="de"></ww-print-plain>`);
    await until(() => noteOf(host).textContent === "Dieser interaktive Inhalt wird auf Papier nicht angezeigt. Öffnen Sie das Dokument online, um ihn zu nutzen.", "the German catalog arrives");
    host.lang = "fr";
    await until(() => noteOf(host).textContent!.startsWith("Ce contenu interactif"), "the note follows the language");
    equal(printMessages.locales.length, 105, "a catalog for every language of the other modules");
    for (const locale of printMessages.locales) {
        const catalog = await printMessages.load(locale);
        const text = catalog?.note;
        assert(typeof text === "string" && text.length > 20, `${locale} has a note`);
        assert(text !== ENGLISH, `${locale} is translated`);
    }
});

check("print note: a note in the template is filled and no second one is added, and a framework that clears the root gets the note back", async () => {
    const host = await mount<TemplateNote>(`<ww-print-template></ww-print-template>`);
    await frame();
    equal(host.shadowRoot!.querySelectorAll("[data-ww-print-note]").length, 1, "one note");
    equal(noteOf(host).parentElement!.localName, "section", "the one of the template");
    equal(noteOf(host).textContent, ENGLISH);
    const plain = await mount<PlainNote>(`<ww-print-plain></ww-print-plain>`);
    plain.shadowRoot!.replaceChildren();
    plain.note.refresh();
    assert(noteOf(plain), "the note is back after a refresh");
    equal(plain.shadowRoot!.querySelectorAll("[data-ww-print-note]").length, 1, "once");
});

check("print note: the address is shown on a line of its own, and an option decides it", async () => {
    const host = await mount<PlainNote>(`<ww-print-plain></ww-print-plain>`);
    host.address = "https://example.org/lesson";
    host.note.refresh();
    const line = noteOf(host).querySelector<HTMLElement>("[data-ww-print-address]");
    equal(line?.textContent, "https://example.org/lesson", "the address");
    equal(host.note.getSnapshot().address, "https://example.org/lesson");
    host.address = null;
    host.note.refresh();
    equal(noteOf(host).querySelector("[data-ww-print-address]"), null, "null leaves it out");
    equal(noteOf(host).textContent, ENGLISH);
});

check("print note: documentAddress finds a canonical link or a public http address, and nothing else", () => {
    const page = (href: string, canonical?: string) => ({ querySelector: () => (canonical ? { href: canonical } : null), location: { href } }) as unknown as Document;
    equal(documentAddress(page("https://example.org/a/b?x=1#top")), "https://example.org/a/b?x=1", "the page, without its fragment");
    equal(documentAddress(page("http://localhost:3000/doc", "https://example.org/canonical")), "https://example.org/canonical", "the canonical link wins");
    for (const local of ["http://localhost:3000/", "http://127.0.0.1/doc", "http://[::1]/doc", "https://lesson.localhost/", "http://shop.test/", "file:///Users/me/doc.html", "blob:https://example.org/uuid", "about:blank"]) {
        equal(documentAddress(page(local)), null, `${local} is no public address`);
    }
    equal(documentAddress(), null, "this page is served from a loopback address");
});

check("print note: disconnecting removes the note, and the module can connect again", async () => {
    const host = await mount<PlainNote>(`<ww-print-plain></ww-print-plain>`);
    await frame();
    const sheets = host.shadowRoot!.adoptedStyleSheets.length;
    assert(sheets > 0, "the module adopted its styles");
    host.remove();
    equal(host.shadowRoot!.querySelector("[data-ww-print-note]"), null, "the note is gone");
    equal(host.shadowRoot!.adoptedStyleSheets.length, 0, "and the styles");
    document.body.append(host);
    await frame();
    assert(noteOf(host), "connected again");
    host.remove();
});

check("print note: the Lit controller has text and address, and follows the language", async () => {
    const host = await mount<LitNote>(`<ww-print-lit></ww-print-lit>`);
    await host.updateComplete;
    await frame();
    equal(host.note.text, ENGLISH);
    equal(host.note.address, "https://example.org/lesson");
    equal(noteOf(host).querySelector("[data-ww-print-address]")!.textContent, "https://example.org/lesson");
    host.setAttribute("lang", "es");
    await until(() => host.note.text.startsWith("Este contenido interactivo"), "Spanish");
    equal(noteOf(host).firstChild!.textContent, host.note.text, "the note shows it");
});
