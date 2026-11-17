// Checks of the WebWriter package of the examples (`webwriter/`, built by
// `npm run build:webwriter`). They run on the built modules, not on the sources:
//
//   1. the editor's own loader reads the folder, and its schema takes the editing configuration;
//   2. every module loads the way the editor loads it and defines its tag;
//   3. every snippet survives the editor's sanitizer, fits the content expression and renders,
//      in the editing frame and as a reader sees it;
//   4. the main interaction of each widget works in the editing frame.
//
// "The editing frame" is what the editor sets up around a widget (domeditor
// `domeditor-core.ts` and `features/widget.ts`): `document.designMode = "on"`,
// and on every widget of an installed package an `id` and `contenteditable=""`.
//
// The editor's code comes from ../domeditor in the same repository. Without
// it, or without the built package, the checks that need them say that they
// were skipped.
import { assert, check, deepActive, drag, equal, frame, key, point, pointer, run, settled, typeInto, until } from "../../test/harness";
import { manage, type ManagedScope } from "../order-exercise/editor";

// ── The editor's side ─────────────────────────────────────────────────────

type Warning = { code: string; path?: string; message: string };
type Member = { kind: "widget" | "snippet"; exportName: string; label: string; insertable: boolean; tagName?: string; htmlUrl?: string; scriptUrl?: string };
type Package = { name: string; version: string; label: string; members: Member[]; scripts: string[]; styles: string[] };
type Directory = { getFileHandle(name: string): Promise<{ getFile(): Promise<{ text(): Promise<string>; size: number }> }>; getDirectoryHandle(name: string): Promise<Directory> };
type SchemaEntry = { group?: string[]; content?: { source?: string }; sharedData?: boolean; inseperable?: boolean };
type Schema = { extendWidgets(widgets: unknown): void; get(key: string): SchemaEntry | undefined; isContentValid(node: Node, content?: Node[]): boolean };
type OptionState = { name: string; type: string; attribute: string | null; label: string; value: unknown; hidden?: boolean; inverted?: boolean };
type ActionState = { name: string; label: string; hidden?: boolean };
/** The parts of the editor the checks use. */
type Editor = {
    loadLocalPackage(directory: Directory, options: { urlFor(path: string): string; locale?: string }): Promise<{ package: Package; warnings: Warning[] }>;
    packageWidgetSchemaDefinitions(packages: Package[]): unknown;
    packageInsertionItems(packages: Package[]): { name: string; kind: string; tag?: string }[];
    sanitizePackageSnippet(html: string): string;
    localizeSnippet(html: string, locale: string): string;
    Schema: new () => Schema;
    widgetDeclarations(widget: Element, kind: "options" | "actions" | "permissions"): Record<string, unknown>;
    readWidgetOption(widget: Element, name: string, raw: unknown, locale: string): OptionState;
    widgetActionState(name: string, declaration: unknown, locale: string): ActionState;
};

async function loadEditor(): Promise<Editor | undefined> {
    try {
        const modules = await Promise.all([
            // @ts-ignore The paths exist only where the editor sources are.
            import("../../../domeditor/src/local-package"),
            // @ts-ignore
            import("../../../domeditor/src/packages"),
            // @ts-ignore
            import("../../../domeditor/src/schema"),
            // @ts-ignore
            import("../../../domeditor/src/widget-options"),
        ]);
        return Object.assign({}, ...modules) as Editor;
    } catch {
        return undefined;
    }
}

const PACKAGE = "/webwriter";
const editor = await loadEditor();
const built = (await fetch(`${PACKAGE}/dist/ww-sort-item.js`, { method: "HEAD" })).ok;
const SKIPPED = !built ? "SKIPPED: the package is not built (npm run build:webwriter)" : !editor ? "SKIPPED: the editor sources in ../domeditor were not found" : "";

/** A folder of this server as the directory handle the editor's loader reads. */
const directory = (base: string): Directory => ({
    async getFileHandle(name) {
        const response = await fetch(`${base}/${name}`);
        if (!response.ok) throw Object.assign(new Error(`Missing ${name}`), { name: "NotFoundError" });
        const text = await response.text();
        return { getFile: async () => ({ text: async () => text, size: text.length }) };
    },
    getDirectoryHandle: async (name) => directory(`${base}/${name}`),
});

/** What the editor reports for a widget whose Lit properties read an attribute without reflecting to it (`features/widget.ts` `inspect()`). */
function unreflected(tag: string): string[] {
    const properties: unknown = (customElements.get(tag) as { elementProperties?: unknown } | undefined)?.elementProperties;
    if (!(properties instanceof Map)) return [];
    const global = new Set(["lang", "dir", "title", "hidden", "id", "slot", "contentEditable"]);
    return [...properties].flatMap(([name, options]) => {
        const declaration = (options ?? {}) as { attribute?: unknown; reflect?: unknown; state?: unknown };
        return typeof name === "string" && !global.has(name) && !declaration.state && declaration.attribute !== false && !declaration.reflect ? [name] : [];
    });
}

// ── Loading, before the checks are registered, so that their names can say what was found ──

const loaded = SKIPPED ? undefined : await editor!.loadLocalPackage(directory(PACKAGE), { urlFor: (path) => `${PACKAGE}/${path}`, locale: "en" });
const pkg = loaded?.package;
const widgets = pkg?.members.filter((member) => member.kind === "widget") ?? [];
const snippets = pkg?.members.filter((member) => member.kind === "snippet") ?? [];
const tags = new Set(widgets.map((member) => member.tagName!));
const schema = editor && pkg ? new editor.Schema() : undefined;
let schemaError = "";
try {
    schema?.extendWidgets(editor!.packageWidgetSchemaDefinitions([pkg!]));
} catch (error) {
    schemaError = String(error);
}

/** Loads the modules as `features/dependencies.ts` does: one module script per member, all added at once. */
const scriptErrors: string[] = [];
const collect = (event: ErrorEvent) => scriptErrors.push(String(event.error?.stack ?? event.message));
addEventListener("error", collect);
await Promise.all(
    (pkg?.scripts ?? []).map((src) => {
        const script = Object.assign(document.createElement("script"), { type: "module", src });
        return new Promise<void>((done) => {
            script.addEventListener("load", () => done());
            script.addEventListener("error", () => (scriptErrors.push(`${src} failed to load`), done()));
            document.head.append(script);
        });
    }),
);
await frame(2);
removeEventListener("error", collect);

/** Registers a check, or says why it was skipped. */
const packageCheck = (name: string, fn: () => unknown) => check(SKIPPED ? `${name}: ${SKIPPED}` : name, () => (SKIPPED ? undefined : fn()));

// ── The editing frame ─────────────────────────────────────────────────────

type Mode = "edit" | "read";
type Inserted = { container: HTMLElement; scope: ManagedScope; messages: string[]; remove(): void };

/**
 * Puts HTML into the page as the editor holds it while an author edits (`edit`), or as a
 * reader gets it (`read`). The scoped data blocks are managed as the editor manages them.
 * Everything written to the console as a warning or an error is collected.
 */
async function insert(html: string, mode: Mode): Promise<Inserted> {
    const messages: string[] = [];
    const native = { warn: console.warn, error: console.error };
    console.warn = (...parts: unknown[]) => void messages.push(`warn: ${parts.map(String).join(" ")}`);
    console.error = (...parts: unknown[]) => void messages.push(`error: ${parts.map(String).join(" ")}`);
    document.designMode = mode === "edit" ? "on" : "off";
    const container = document.body.appendChild(document.createElement("div"));
    container.style.width = "640px";
    const scope = manage(container);
    container.setHTMLUnsafe(html);
    const members = [...container.querySelectorAll<HTMLElement>("*")].filter((element) => tags.has(element.localName));
    if (mode === "edit") {
        for (const member of members) {
            if (!member.id) member.id = `ww${crypto.randomUUID()}`;
            member.setAttribute("contenteditable", "");
        }
    }
    await settled(...members);
    if (scope.requests) scope.deliver({});
    await settled(...members);
    await frame(2);
    return {
        container,
        scope,
        messages,
        remove() {
            scope.stop();
            container.remove();
            document.designMode = "off";
            Object.assign(console, native);
            getSelection()?.removeAllRanges();
        },
    };
}

/** Inserts a snippet of the package, runs `fn` on its first widget, and cleans up whatever happens. */
async function withSnippet<E extends HTMLElement>(name: string, mode: Mode, fn: (widget: E, inserted: Inserted) => unknown): Promise<void> {
    const html = editor!.sanitizePackageSnippet(await (await fetch(`${PACKAGE}/snippets/${name}.html`)).text());
    const inserted = await insert(html, mode);
    try {
        const widget = [...inserted.container.querySelectorAll<E>("*")].find((element) => tags.has(element.localName))!;
        await fn(widget, inserted);
        equal(inserted.messages, [], "nothing is written to the console");
    } finally {
        inserted.remove();
    }
}

const $ = <E extends Element = HTMLElement>(host: Element, selector: string) => host.shadowRoot!.querySelector<E>(selector)!;
const $$ = <E extends Element = HTMLElement>(host: Element, selector: string) => [...host.shadowRoot!.querySelectorAll<E>(selector)];

/**
 * The undo steps the editor would record for what happens to a widget, by its rules
 * (domeditor `domdoc.ts`, `features/widget.ts`): every batch of mutations is one change of
 * the document; `ww-transactionstart` on the widget opens an undo group, which first takes
 * what is pending and then collects every change until `ww-transactionend`. A change outside
 * a group is a step of its own here; the editor merges such steps while they follow each
 * other within half a second. `stop()` returns one entry per step: `group` or `loose`, and
 * what changed (`@attribute`, `children`, `text`, or `data` for the data block, which the editor
 * keeps apart from the document). A group without a change is no step.
 */
function undoSteps(widget: Element): { stop(): string[] } {
    const steps: string[] = [];
    let group: string[] | null = null;
    const block = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest('script[slot="data"]');
    const name = (record: MutationRecord) =>
        block(record.target) ? "data" : record.type === "attributes" ? `@${record.attributeName}` : record.type === "childList" ? "children" : "text";
    const take = (records: MutationRecord[]) => {
        const changes = [...new Set(records.map(name))];
        if (changes.length === 0) return;
        if (group) group.push(...changes.filter((change) => !group!.includes(change)));
        else steps.push(`loose ${changes.join(" ")}`);
    };
    const observer = new MutationObserver(take);
    observer.observe(widget, { attributes: true, childList: true, characterData: true, subtree: true });
    const abort = new AbortController();
    widget.addEventListener(
        "ww-transactionstart",
        (event) => {
            if (event.target !== widget) return;
            take(observer.takeRecords());
            group = [];
        },
        { signal: abort.signal },
    );
    widget.addEventListener(
        "ww-transactionend",
        (event) => {
            if (event.target !== widget || !group) return;
            take(observer.takeRecords());
            if (group.length) steps.push(`group ${group.join(" ")}`);
            group = null;
        },
        { signal: abort.signal },
    );
    return {
        stop() {
            take(observer.takeRecords());
            observer.disconnect();
            abort.abort();
            if (group) steps.push(`open group ${group.join(" ")}`);
            return steps;
        },
    };
}

// ── 1. The package as the editor reads it ─────────────────────────────────

packageCheck(`loader: the editor reads the folder without a warning (${loaded?.warnings.length ?? "?"}: ${loaded?.warnings.map((warning) => warning.message).join(" | ") || "none"})`, () => {
    equal(loaded!.warnings, []);
    equal([pkg!.name, pkg!.label, pkg!.styles.length], ["@webwriter/module-examples", "Module examples", 0]);
});

packageCheck(`loader: ${widgets.length} widgets (${widgets.map((member) => `${member.tagName}${member.insertable ? "" : "°"}`).join(", ")}; ° is not in the insertion menu)`, () => {
    equal(widgets.length, 16);
    equal(widgets.filter((member) => !member.insertable).map((member) => member.tagName), ["ww-sort-item", "ww-order-exercise", "ww-choice-exercise", "ww-plain-poll"]);
    assert(widgets.every((member) => member.scriptUrl === `${PACKAGE}/dist/${member.tagName}.js`), "every widget has its module");
    assert(widgets.every((member) => member.label && member.label !== member.tagName), "every widget has a label");
});

packageCheck(`loader: ${snippets.length} snippets (${snippets.map((member) => member.label).join("; ")})`, () => {
    equal(snippets.length, 15);
    equal(editor!.packageInsertionItems([pkg!]).length, 12 + 15, "the insertion menu lists the insertable widgets and the snippets");
});

const described = [...tags].map((tag) => {
    const entry = schema?.get(tag);
    const groups = (entry?.group ?? []).join(" ");
    return `${tag} [${groups}]${entry?.content?.source ? ` content "${entry.content.source}"` : ""}${entry?.sharedData ? " sharedData" : ""}`;
});
packageCheck(`schema: the editor's schema takes every widget (${schemaError || described.join("; ")})`, () => {
    equal(schemaError, "");
    equal(schema!.get("ww-sort-list")?.content?.source, "ww-sort-item+");
    equal(schema!.get("ww-sort-item")?.group, ["sortitem", "widget"], "a sort item is no flow content: it only fits where an expression names it");
    equal(schema!.get("ww-stepper")?.content?.source, "p+");
    equal(["ww-order-exercise", "ww-choice-exercise", "ww-plain-poll", "ww-palette"].map((tag) => schema!.get(tag)?.sharedData === true), [true, true, true, false]);
    assert([...tags].every((tag) => schema!.get(tag)?.inseperable === true), "every widget is isolating");
});

// ── 2. The modules ────────────────────────────────────────────────────────

const reflected = [...tags].map((tag) => [tag, unreflected(tag)] as const).filter(([, names]) => names.length);
packageCheck(`modules: every module loads and defines its tag (${scriptErrors.length} errors), and every Lit property that reads an attribute reflects to it`, () => {
    equal(scriptErrors, []);
    equal([...tags].filter((tag) => !customElements.get(tag)), [], "the editor's 'Widgets registered' check");
    equal(reflected, [], "the editor's 'Widget properties reflect to attributes' check");
});

// ── 3. The snippets ───────────────────────────────────────────────────────

for (const snippet of snippets) {
    const name = snippet.exportName.replace(/^\.\/snippets\/|\.html$/g, "");
    packageCheck(`snippet ${name}: the sanitizer keeps it, it fits the schema, and it renders for an author and for a reader`, async () => {
        const source = await (await fetch(snippet.htmlUrl!)).text();
        const sanitized = editor!.sanitizePackageSnippet(editor!.localizeSnippet(source, "en"));
        const parsed = Object.assign(document.createElement("template"), { innerHTML: source });
        equal(sanitized, parsed.innerHTML, "the editor's sanitizer removes nothing");
        for (const element of parsed.content.querySelectorAll("*")) {
            if (!tags.has(element.localName) || !schema!.get(element.localName)?.content) continue;
            assert(schema!.isContentValid(element), `the children of <${element.localName}> fit its content expression`);
        }
        for (const mode of ["edit", "read"] as const) {
            const inserted = await insert(sanitized, mode);
            try {
                const members = [...inserted.container.querySelectorAll<HTMLElement>("*")].filter((element) => tags.has(element.localName));
                assert(members.length > 0, "the snippet contains a widget of the package");
                for (const member of members) {
                    assert(member instanceof customElements.get(member.localName)!, `<${member.localName}> is upgraded`);
                    assert(member.shadowRoot && member.shadowRoot.childElementCount > 0, `<${member.localName}> rendered (${mode})`);
                    assert(member.getBoundingClientRect().height > 0, `<${member.localName}> has a size (${mode})`);
                    equal(member.isContentEditable, mode === "edit");
                }
                equal(inserted.messages, [], `nothing is written to the console (${mode})`);
            } finally {
                inserted.remove();
            }
        }
    });
}

// ── 4. What the drawer and Distribute show ────────────────────────────────

packageCheck("drawer: the options, actions and permissions the editor reads from each widget have labels and attributes", async () => {
    const lines: string[] = [];
    for (const snippet of snippets) {
        const name = snippet.exportName.replace(/^\.\/snippets\/|\.html$/g, "");
        await withSnippet(name, "edit", (widget) => {
            const options = Object.entries(editor!.widgetDeclarations(widget, "options")).map(([option, raw]) => editor!.readWidgetOption(widget, option, raw, "en"));
            const actions = Object.entries(editor!.widgetDeclarations(widget, "actions"))
                .filter(([action]) => typeof (widget as unknown as Record<string, unknown>)[action] === "function")
                .map(([action, raw]) => editor!.widgetActionState(action, raw, "en"));
            const permissions = Object.keys(editor!.widgetDeclarations(widget, "permissions"));
            for (const option of options) {
                assert(option.label && option.label !== option.name, `${widget.localName}: option ${option.name} has a label`);
                assert(option.attribute === null || /^[a-z][a-z0-9-]*$/.test(option.attribute), `${widget.localName}: option ${option.name} has a plain attribute (${option.attribute})`);
            }
            lines.push(
                `${widget.localName}: options ${options.map((option) => `${option.name}→${option.attribute}`).join(",") || "–"}; actions ${
                    actions.map((action) => `${action.name}${action.hidden ? "(hidden)" : ""}`).join(",") || "–"
                }; permissions ${permissions.join(",") || "–"}`,
            );
        });
    }
    if (new URLSearchParams(location.search).has("list")) throw new Error(`\n${lines.join("\n")}`);
    equal(lines.length, snippets.length);
});

// ── 5. The main interaction of each widget, in the editing frame ──────────
//
// Each check also says which undo steps the editor would record (see `undoSteps`).

packageCheck("edit: a drag by the handle reorders the sort list: one undo step", () =>
    withSnippet("sort-list", "edit", async (list) => {
        const items = [...list.children] as HTMLElement[];
        const undo = undoSteps(list);
        await drag(items[0].shadowRoot!.querySelector("button")!, point(items[2], 0.5, 0.9));
        equal([...list.children].map((item) => item.textContent), ["Apple", "Banana", "Cherry", "Date"]);
        equal(undo.stop(), ["group children"]);
    }));

packageCheck("edit: Sort A–Z of the sort list is one undo step", () =>
    withSnippet("sort-list", "edit", async (list) => {
        const undo = undoSteps(list);
        $(list, "button").click();
        await settled(list);
        equal([...list.children].map((item) => item.textContent), ["Apple", "Banana", "Cherry", "Date"]);
        equal(undo.stop(), ["group children"]);
    }));

packageCheck("edit: the keyboard reorders the sort list without a framework: one undo step", () =>
    withSnippet("vanilla-sort", "edit", async (list) => {
        const handle = (list.children[0] as HTMLElement).shadowRoot!.querySelector("button")!;
        handle.focus();
        const undo = undoSteps(list);
        key(" ");
        key("ArrowDown");
        key("Enter");
        await frame(4);
        equal([...list.children].map((item) => item.textContent), ["Apple", "Cherry", "Banana", "Date"]);
        equal(undo.stop(), ["group children"]);
    }));

packageCheck("edit: a shape of the palette is dragged to another place: one undo step", () =>
    withSnippet<HTMLElement & { shapes: { id: string; x: number; y: number }[] }>("palette", "edit", async (palette) => {
        const canvas = $(palette, ".canvas");
        const undo = undoSteps(palette);
        await drag($(palette, '.shape[data-ww-key="s1"]'), point(canvas, 0.6, 0.6));
        await settled(palette);
        const moved = palette.shapes.find((shape) => shape.id === "s1")!;
        assert(moved.x !== 40 || moved.y !== 40, `the shape moved (${JSON.stringify(moved)})`);
        assert(palette.getAttribute("shapes")!.includes(`"x":${moved.x}`), "and the attribute, which is what the document keeps, follows");
        equal(undo.stop(), ["group @shapes"]);
    }));

packageCheck("edit: a term is linked to a definition by a drag: one undo step", () =>
    withSnippet<HTMLElement & { links: Record<string, string> }>("pairing", "edit", async (pairing) => {
        const undo = undoSteps(pairing);
        await drag($(pairing, '.term[data-ww-key="gene"]'), $(pairing, '.definition[data-id="gene"]'));
        await settled(pairing);
        equal(pairing.links, { gene: "gene" });
        equal(pairing.getAttribute("links"), '{"gene":"gene"}');
        equal(undo.stop(), ["group @links"]);
    }));

packageCheck("edit: an author's drag in the order exercise records the solution, not a response: one undo step", () =>
    withSnippet<HTMLElement & { solution: string[]; response: string[] | undefined }>("order-exercise", "edit", async (exercise) => {
        const before = exercise.getAttribute("solution");
        equal(exercise.solution, ["a", "b", "c"], "boil, add, cool");
        const undo = undoSteps(exercise);
        await drag($(exercise, 'li[data-ww-key="b"]'), point($(exercise, 'li[data-ww-key="c"]'), 0.5, 0.9));
        await settled(exercise);
        equal(exercise.solution, ["a", "c", "b"]);
        assert(exercise.getAttribute("solution") !== before, "the attribute changed");
        equal(exercise.response, undefined);
        equal(undo.stop(), ["group @solution"]);
    }));

packageCheck("read: a reader's drag in the order exercise is kept in the data block, and Check marks it", () =>
    withSnippet<HTMLElement & { response: string[] | undefined }>("order-exercise", "read", async (exercise) => {
        const undo = undoSteps(exercise);
        await drag($(exercise, 'li[data-ww-key="a"]'), point($(exercise, 'li[data-ww-key="c"]'), 0.5, 0.9));
        await until(() => exercise.response, "no response was recorded");
        equal(exercise.response, ["b", "c", "a"]);
        equal(JSON.parse(exercise.querySelector("script")!.textContent!), { order: ["b", "c", "a"] });
        $(exercise, "#check").click();
        await settled(exercise);
        assert($$(exercise, "li.correct, li.wrong").length === 3, "the entries are marked");
        equal(undo.stop(), ["group data"], "the response is one change of the data block; Check changes nothing in the document");
    }));

packageCheck("read: the exercises speak the language around them: the modules load their catalogs themselves", async () => {
    const html = (name: string) => fetch(`${PACKAGE}/snippets/${name}.html`).then((response) => response.text());
    const inserted = await insert(`<section lang="de">${await html("order-exercise")}${await html("choice-exercise")}</section>`, "read");
    try {
        const [order, choice] = [inserted.container.querySelector("ww-order-exercise")!, inserted.container.querySelector("ww-choice-exercise")!];
        await until(() => $(order, "p").textContent === "Bringe die Einträge in die richtige Reihenfolge.", "the order exercise did not turn German");
        await until(() => $(choice, "#instruction").textContent === "Kreuze eine Antwort an.", "the choice exercise did not turn German");
        // The module's own text: the buttons of the choice exercise come from the Exercise catalog, which is loaded for the language.
        await until(() => $(choice, "#check").textContent!.trim() === "Prüfen", "the catalog of the Exercise helper did not arrive");
        equal(inserted.messages, []);
    } finally {
        inserted.remove();
    }
});

packageCheck("edit: a tick in the choice exercise records the solution: one undo step", () =>
    withSnippet<HTMLElement & { solution: string[] }>("choice-exercise", "edit", async (exercise) => {
        equal(exercise.solution, ["a"]);
        const undo = undoSteps(exercise);
        $<HTMLInputElement>(exercise, 'input[value="b"]').click();
        await settled(exercise);
        equal(exercise.solution, ["b"]);
        equal(undo.stop(), ["group @solution"]);
    }));

packageCheck("read: a vote in the poll is written to the data block that the snippet brings", () =>
    withSnippet<HTMLElement & { store: { get(): { vote: string | null } } }>("plain-poll", "read", async (poll) => {
        equal($$(poll, "button[value]").length, 3);
        assert($(poll, "p").hidden, "the empty block of the snippet is read as no vote");
        $$<HTMLButtonElement>(poll, "button[value]")[1].click();
        await until(() => poll.store.get().vote === "coffee", "the vote was not kept");
        equal(JSON.parse(poll.querySelector("script")!.textContent!), { vote: "coffee" });
        equal(poll.querySelectorAll("script").length, 1, "no second block is created");
    }));

packageCheck("edit: an author drags a node of the diagram: one undo step", () =>
    withSnippet<HTMLElement & { nodes: string }>("diagram-view", "edit", async (view) => {
        const node = $<SVGCircleElement>(view, ".node");
        const start = point(node);
        const undo = undoSteps(view);
        pointer(node, "pointerdown", start, { pointerType: "mouse" });
        pointer(node, "pointermove", { x: start.x + 40, y: start.y + 20 });
        await frame(2);
        pointer(node, "pointerup", { x: start.x + 40, y: start.y + 20 });
        await until(() => !view.nodes.startsWith("150,150"), "the node did not move");
        await settled(view);
        equal(view.getAttribute("nodes"), view.nodes);
        equal(undo.stop(), ["group @nodes"]);
    }));

packageCheck("edit: Add and Unlock in the toolbar of the diagram are one undo step each", () =>
    withSnippet<HTMLElement & { nodes: string }>("diagram-view", "edit", async (view) => {
        const [add, , unlock] = $$(view, ".toolbar button");
        const undo = undoSteps(view);
        add.click();
        await settled(view);
        unlock.click();
        await settled(view);
        equal(view.nodes.split(" ").length, 4);
        equal(view.hasAttribute("allow-panning"), false);
        equal(undo.stop(), ["group @nodes", "group @allow-panning"]);
    }));

packageCheck("edit: the Help overlay of the diagram opens with its button and closes with Escape", () =>
    withSnippet("diagram-view", "edit", async (view) => {
        const toggle = $(view, "[data-ww-help-toggle]");
        const undo = undoSteps(view);
        toggle.focus();
        toggle.click();
        await until(() => toggle.getAttribute("aria-pressed") === "true" || toggle.getAttribute("aria-expanded") === "true", "the overlay did not open");
        key("Escape");
        await until(() => toggle.getAttribute("aria-pressed") !== "true" && toggle.getAttribute("aria-expanded") !== "true", "Escape did not close the overlay");
        equal(undo.stop(), [], "the overlay writes nothing to the document");
    }));

packageCheck("edit: the zoom buttons drive the library's own viewport, and nothing is written", () =>
    withSnippet<HTMLElement & { map: { getZoom(): number } }>("library-view", "edit", async (view) => {
        await until(() => $$(view, "[data-ww-viewport-controls] button").length, "the zoom buttons were not rendered");
        const before = view.map.getZoom();
        const undo = undoSteps(view);
        $$(view, "[data-ww-viewport-controls] button")[0].click();
        await until(() => view.map.getZoom() !== before, "the zoom did not change");
        equal(undo.stop(), []);
    }));

packageCheck("edit: a gate of the circuit is moved by a drag: one undo step", () =>
    withSnippet<HTMLElement & { model: { gates: { id: string; x: number; y: number }[] } }>("circuit", "edit", async (circuit) => {
        const scene = $(circuit, "ww-scene");
        const gate = scene.querySelector<HTMLElement>('[data-ww-key="not"]')!;
        const at = () => circuit.model.gates.find((other) => other.id === "not")!;
        const before = { ...at() };
        const undo = undoSteps(circuit);
        await drag(gate, { x: point(gate).x + 60, y: point(gate).y + 40 });
        await settled(circuit);
        equal([at().x, at().y], [before.x + 60, before.y + 40]);
        equal(undo.stop(), ["group @model"]);
    }));

packageCheck("edit: the swarm draws, and Pause is one undo step that is written to the attribute the document keeps", () =>
    withSnippet<HTMLElement & { failure: string }>("swarm", "edit", async (swarm) => {
        equal(swarm.failure, "", "the scene reported no failure");
        assert($(swarm, "ww-scene").shadowRoot!.querySelector("canvas, svg"), "the scene has a drawing surface");
        equal(swarm.hasAttribute("running"), true);
        const undo = undoSteps(swarm);
        $(swarm, "#run").click();
        await settled(swarm);
        equal(swarm.hasAttribute("running"), false);
        equal(undo.stop(), ["group @running"], "the widget wraps the write in a transaction");
    }));

packageCheck("edit: the shortcuts of the epidemic work with the focus in the widget and write nothing", () =>
    withSnippet<HTMLElement & { playback: { paused: boolean } }>("epidemic", "edit", async (epidemic) => {
        $(epidemic, ".stage").focus();
        equal(deepActive(), $(epidemic, ".stage"));
        const undo = undoSteps(epidemic);
        equal(key(" "), false, "Space is taken by the widget");
        equal(epidemic.playback.paused, false);
        key(" ");
        equal(epidemic.playback.paused, true);
        equal(key("r"), false, "R restarts");
        await settled(epidemic);
        equal(undo.stop(), [], "playing, pausing and restarting change nothing in the document");
    }));

packageCheck("edit: a slider drag in the epidemic is one undo step, and so is the key that raises the value", () =>
    withSnippet<HTMLElement & { infectivity: number }>("epidemic", "edit", async (epidemic) => {
        const slider = $<HTMLInputElement>(epidemic, 'input[data-ww-setting="infectivity"]');
        const undo = undoSteps(epidemic);
        for (const value of ["0.35", "0.4", "0.45", "0.5"]) typeInto(slider, value);
        typeInto(slider, "0.5", "change");
        await settled(epidemic);
        equal([epidemic.infectivity, epidemic.getAttribute("infectivity")], [0.5, "0.5"]);
        $(epidemic, ".stage").focus();
        const mac = /mac/i.test(navigator.platform);
        key("ArrowUp", undefined, { ctrlKey: !mac, metaKey: mac });
        await settled(epidemic);
        equal(epidemic.getAttribute("infectivity"), "0.55");
        equal(undo.stop(), ["group @infectivity", "group @infectivity"]);
    }));

packageCheck("edit: the arrow keys step the stepper while the caret is not in a step", () =>
    withSnippet<HTMLElement & { playback: { currentStep: number } }>("stepper", "edit", async (stepper) => {
        const undo = undoSteps(stepper);
        $(stepper, ".stage").focus();
        equal(key("ArrowRight"), false, "the key is taken by the widget");
        equal(stepper.playback.currentStep, 1);
        equal($<HTMLSlotElement>(stepper, "slot").assignedElements()[0], stepper.children[1]);
        // With the caret in a step the keys belong to the text.
        getSelection()!.setPosition(stepper.children[1], 0);
        equal(key("ArrowRight"), true, "the key is left to the editor");
        equal(stepper.playback.currentStep, 1);
        await settled(stepper);
        equal(undo.stop(), [], "stepping writes nothing to the steps");
    }));

packageCheck("edit: the media stepper gets its generated audio and shows its length", () =>
    withSnippet("media-stepper", "edit", async (player) => {
        const audio = $<HTMLAudioElement>(player, "audio");
        assert(audio.src.startsWith("blob:"), "the audio is an object URL");
        await until(() => audio.readyState >= 1, "the audio did not load", 5000);
        equal(Math.round(audio.duration), 3);
        equal(player.hasAttribute("src"), false, "the object URL is not written to the document");
    }));

packageCheck("edit: a setting typed into the countdown card is written to its attribute: one undo step", () =>
    withSnippet("settings-plain", "edit", async (card) => {
        const undo = undoSteps(card);
        const rounds = $<HTMLInputElement>(card, 'input[data-ww-setting="rounds"]');
        typeInto(rounds, "3");
        typeInto(rounds, "3", "change");
        await frame(2);
        equal(card.getAttribute("rounds"), "3");
        equal(undo.stop(), ["group @rounds"]);
    }));

run();
