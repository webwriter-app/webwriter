// Checks of the types that `LitElementWw` declares for `convertFrom` and
// `convertTo`: the static and the instance form, one handler signature per
// kind of key. Most of this is checked by `tsc` (`npm run typecheck`), where
// a `@ts-expect-error` line must still fail to compile. The runtime part
// calls the handlers the way the editor does.
import { assert, check, equal, mount } from "../../test/harness";
import { LitElementWw, type ConvertFromDeclarations, type ConvertToDeclarations } from "@webwriter/lit";

class Checklist extends LitElementWw {
    // A tag key (`ul`) is an HTML conversion; a key that starts with a dot or holds a slash is a file format.
    static convertFrom = {
        ul: "loadList",
        ".json": "importJson",
        "text/plain": async (file: File) => {
            const text = await file.text();
            if (!text.trim()) throw new Error("The file is empty.");
            return () => {};
        },
    } satisfies ConvertFromDeclarations<Checklist>;
    static convertTo = {
        ul: "toList",
        "text/plain": function (this: Checklist) {
            return new File([this.textContent ?? ""], "list.txt", { type: "text/plain" });
        },
    } satisfies ConvertToDeclarations<Checklist>;

    items: string[] = [];
    loadList(fragment: DocumentFragment) {
        this.items = [...fragment.querySelectorAll("li")].map((item) => item.textContent ?? "");
    }
    async importJson(file: File) {
        const values: unknown = JSON.parse(await file.text());
        if (!Array.isArray(values)) throw new Error("Expected an array.");
        return () => (this.items = values.map(String));
    }
    toList() {
        const list = document.createElement("ul");
        for (const item of this.items) list.append(Object.assign(document.createElement("li"), { textContent: item }));
        return list;
    }
}
customElements.define("ww-conversion-checklist", Checklist);

/** The instance form takes precedence and sees the widget as `this`. */
class Dynamic extends LitElementWw {
    get convertTo() {
        return { ".csv": () => new File([this.getAttribute("rows") ?? ""], "rows.csv") } satisfies ConvertToDeclarations<this>;
    }
    convertFrom = { ".csv": (file: File) => () => this.setAttribute("rows", String(file.size)) };
}
customElements.define("ww-conversion-dynamic", Dynamic);

// @ts-expect-error a file key does not take a handler that returns an element
class WrongKind extends LitElementWw {
    static convertTo = { ".json": (): Element => document.createElement("p") };
}
void WrongKind;

check("conversions: the typed maps are plain declarations the editor reads", async () => {
    const el = await mount<Checklist>("<ww-conversion-checklist></ww-conversion-checklist>");
    const fragment = document.createRange().createContextualFragment("<ul><li>a</li><li>b</li></ul>");
    const from = Checklist.convertFrom;
    equal(Object.keys(from), ["ul", ".json", "text/plain"]);
    (el[from.ul as "loadList"] as Checklist["loadList"]).call(el, fragment);
    equal(el.items, ["a", "b"]);
    const apply = await el.importJson(new File(['["x","y"]'], "list.json"));
    apply();
    equal(el.items, ["x", "y"]);
    const text = (from["text/plain"] as (file: File) => Promise<() => void>)!;
    const message = await text.call(el, new File([" "], "empty.txt")).catch((error: Error) => error.message);
    equal(message, "The file is empty.", "a bad file is reported by a thrown Error with the widget's message");
    equal(el.toList().outerHTML, "<ul><li>x</li><li>y</li></ul>");
});

check("conversions: an instance declaration is read from the widget", async () => {
    const el = await mount<Dynamic>("<ww-conversion-dynamic rows='1,2'></ww-conversion-dynamic>");
    const file = el.convertTo[".csv"] as () => File;
    equal([file().name, await file().text()], ["rows.csv", "1,2"]);
    assert(el.convertFrom![".csv"] !== undefined);
});
