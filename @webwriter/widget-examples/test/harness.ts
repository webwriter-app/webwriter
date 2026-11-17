// In-page helpers for check pages. A test.ts imports this file first, registers
// checks with check() and ends with run(). The runner (test/run.mjs) collects
// what run() reports.

/** A position in client coordinates. */
export type Point = { x: number; y: number };
type Result = { name: string; ok: boolean; error?: string; known?: string };

const checks: { name: string; fn: () => unknown; known?: string }[] = [];
const mounted: Element[] = [];
const restores: (() => void)[] = [];
const uncaught: string[] = [];
addEventListener("error", (event) => uncaught.push(String(event.error?.stack ?? event.message)));
addEventListener("unhandledrejection", (event) => uncaught.push(String(event.reason?.stack ?? event.reason)));

/** Register a check. It passes unless `fn` throws or rejects, or an uncaught error occurs while it runs. */
export function check(name: string, fn: () => unknown): void {
    checks.push({ name, fn });
}

/**
 * Register a check that fails because of a defect outside this package, in a library the checks
 * run against. `defect` names the place and what happens there. While the check fails it is
 * reported as KNOWN and does not fail the run. Once it passes it fails, so that the mark is
 * taken away when the defect is fixed.
 */
export function knownFailure(name: string, defect: string, fn: () => unknown): void {
    checks.push({ name, fn, known: defect });
}

/** Run the registered checks in order and report them. Call once, at the end of the test file. */
export async function run(): Promise<void> {
    const results: Result[] = [];
    for (const { name, fn, known } of checks) {
        uncaught.length = 0;
        // Lets the runner name the check if the page hangs.
        navigator.sendBeacon(`/__progress?${encodeURIComponent(name)}`);
        let error: string | undefined;
        try {
            await Promise.race([fn(), timeout(name)]);
        } catch (thrown) {
            error = String((thrown as Error)?.stack ?? thrown);
        }
        for (const restore of restores.splice(0)) restore();
        for (const element of mounted.splice(0)) element.remove();
        await frame();
        error ??= uncaught.length ? `uncaught: ${uncaught.join("\n")}` : undefined;
        if (known === undefined) results.push({ name, ok: !error, error });
        else if (error) results.push({ name, ok: true, error, known });
        else results.push({ name, ok: false, error: `this check passes now. It was marked as a known failure: ${known}\nRegister it with check() again.` });
    }
    const list = document.body.appendChild(document.createElement("pre"));
    list.textContent = results.map((r) => `${r.known ? "KNOWN" : r.ok ? "PASS" : "FAIL"}  ${r.name}${r.error ? `\n      ${r.error}` : ""}`).join("\n");
    console.log(list.textContent);
    await fetch("/__report", { method: "POST", body: JSON.stringify({ page: location.pathname, results }) }).catch(() => {});
    document.title = "done";
}

/** A check that hangs fails after ten seconds instead of stalling the page. */
async function timeout(name: string): Promise<never> {
    await wait(10000);
    const frames = await Promise.race([frame().then(() => "still running"), wait(1000).then(() => "stalled")]);
    throw new Error(`"${name}" did not finish within 10 s (animation frames ${frames}, page ${document.visibilityState})`);
}

/** Throws `message` unless the condition holds. */
export function assert(condition: unknown, message = "assertion failed"): asserts condition {
    if (!condition) throw new Error(message);
}

/** Compares with JSON, so arrays and plain objects work. */
export function equal<T>(actual: T, expected: T, message = "values differ"): void {
    const [a, e] = [JSON.stringify(actual), JSON.stringify(expected)];
    if (a !== e) throw new Error(`${message}: expected ${e}, got ${a}`);
}

// ── Waiting ───────────────────────────────────────────────────────────────

/** Waits a fixed time. Prefer `frame()`, `settled()`, `animations()` or `until()`. */
export const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

// The browser's own clock, so that the waiting helpers keep working while a check runs on fakeFrames().
const realFrames = { request: window.requestAnimationFrame, cancel: window.cancelAnimationFrame };

/** Waits for animation frames of the real clock, also while `fakeFrames()` is installed. */
export async function frame(count = 1): Promise<void> {
    for (let i = 0; i < count; i++) await new Promise((done) => realFrames.request.call(window, done));
}

/** What `fakeFrames()` returns. */
export type FakeFrames = {
    /** Number of callbacks that wait for the next fake frame. */
    readonly pending: number;
    /** Runs the waiting callbacks as one frame at time `now` (ms, as `performance.now()` counts). Callbacks they request wait for the next `fire()`. */
    fire(now?: number): void;
    /** Gives the animation frames back to the browser. Waiting callbacks are dropped. */
    restore(): void;
};

/**
 * Replaces `requestAnimationFrame` and `cancelAnimationFrame`, so that a check
 * decides when a frame happens and what time it reports. A frame that was
 * requested before is still delivered by the browser: wait for it with
 * `frame()`. Restored by `restore()`, and in any case when the check ends.
 */
export function fakeFrames(): FakeFrames {
    const queue = new Map<number, FrameRequestCallback>();
    let id = 0;
    const request = (window.requestAnimationFrame = (callback) => (queue.set(++id, callback), id));
    const cancel = (window.cancelAnimationFrame = (handle) => void queue.delete(handle));
    const restore = () => {
        queue.clear();
        if (window.requestAnimationFrame === request) window.requestAnimationFrame = realFrames.request;
        if (window.cancelAnimationFrame === cancel) window.cancelAnimationFrame = realFrames.cancel;
    };
    restores.push(restore);
    return {
        get pending() {
            return queue.size;
        },
        fire(now = performance.now()) {
            const callbacks = [...queue.values()];
            queue.clear();
            for (const callback of callbacks) callback(now);
        },
        restore,
    };
}

/** Waits for Lit updates of the given elements (if they are Lit elements), then for two frames. */
export async function settled(...elements: Element[]): Promise<void> {
    for (const element of elements) await (element as Element & { updateComplete?: Promise<unknown> }).updateComplete;
    await frame(2);
}

/** Waits until every running animation on the page has finished. Use after a drop or a cancel. */
export async function animations(): Promise<void> {
    await frame(2);
    const running = document.getAnimations().filter((animation) => animation.playState === "running");
    await Promise.all(running.map((animation) => animation.finished.catch(() => {})));
    await frame(2);
}

/** Polls until `fn` returns something truthy and returns it. Throws after `timeout` ms. */
export async function until<T>(fn: () => T, message = "condition not met", timeout = 2000): Promise<NonNullable<T>> {
    const end = performance.now() + timeout;
    for (;;) {
        const value = fn();
        if (value) return value;
        if (performance.now() > end) throw new Error(message);
        await frame();
    }
}

// ── Page ──────────────────────────────────────────────────────────────────

/**
 * Puts HTML into the page and returns its first element. Removed again when the check ends.
 * A `<template shadowrootmode="open">` in the HTML becomes the shadow root of its parent.
 */
export async function mount<E extends HTMLElement = HTMLElement>(html: string): Promise<E> {
    const container = document.body.appendChild(document.createElement("div"));
    container.setHTMLUnsafe(html);
    mounted.push(container);
    const element = container.firstElementChild as E;
    await settled(element);
    return element;
}

/** A point inside an element, as fractions of its box. Default: the centre. */
export function point(element: Element, fx = 0.5, fy = 0.5): Point {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width * fx, y: rect.top + rect.height * fy };
}

// ── Input ─────────────────────────────────────────────────────────────────

/** Dispatches a synthetic pointer event of the primary pointer on `target`. */
export function pointer(target: EventTarget, type: string, at: Point, init: PointerEventInit = {}): boolean {
    return target.dispatchEvent(
        new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, pointerId: 7, button: 0, isPrimary: true, clientX: at.x, clientY: at.y, ...init }),
    );
}

/** Dispatches a synthetic keydown on `target` (default: the focused element). */
export function key(name: string, target: EventTarget = deepActive() ?? document.body, init: KeyboardEventInit = {}): boolean {
    return target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, composed: true, cancelable: true, ...init }));
}

/**
 * Enters a value into a form control the way typing or choosing does: sets the
 * value (`checked` for a boolean), then dispatches the given events on the
 * control, by default one `input`. Pass `"input", "change"` for an entry that
 * is also committed, or `"change"` alone.
 */
export function typeInto(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string | boolean, ...types: ("input" | "change")[]): void {
    if (typeof value === "boolean") (control as HTMLInputElement).checked = value;
    else control.value = value;
    // As the browser sends them: `input` crosses shadow roots, `change` does not.
    for (const type of types.length ? types : (["input"] as const)) control.dispatchEvent(new Event(type, { bubbles: true, composed: type === "input" }));
}

/** The focused element, looking into open shadow roots. */
export function deepActive(): Element | null {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
}

/** Options of `drag()`. */
export type DragSteps = {
    /** End with Escape instead of a release. */
    cancel?: boolean;
    /** Runs while the item is held over the destination, before the release. */
    held?: () => unknown;
};

/**
 * A pointer drag: press on `from`, move past the threshold, move to `to`, release.
 * Waits for the frames in between and for the settle animation at the end.
 */
export async function drag(from: Element, to: Element | Point, steps: DragSteps = {}): Promise<void> {
    const start = point(from);
    const end = to instanceof Element ? point(to) : to;
    pointer(from, "pointerdown", start);
    pointer(from, "pointermove", { x: start.x + 6, y: start.y + 6 });
    await frame(2);
    pointer(from, "pointermove", end);
    await frame(2);
    await steps.held?.();
    if (steps.cancel) key("Escape", window);
    else pointer(from, "pointerup", end);
    await animations();
}

// ── The editor ────────────────────────────────────────────────────────────

type Declaration = Record<string, unknown>;
const isMap = (value: unknown): value is Declaration => !!value && typeof value === "object" && !Array.isArray(value);

/** A widget's declarations as the editor reads them: the instance member if it is a map, otherwise the static one. */
function editorDeclarations(widget: HTMLElement, kind: "options" | "permissions"): Record<string, unknown> {
    const own = (widget as unknown as Declaration)[kind];
    if (isMap(own)) return own;
    const shared = (widget.constructor as unknown as Declaration)[kind];
    return isMap(shared) ? shared : {};
}

/** The editor's attribute of a declaration: its own `attribute`, then the Lit property's, then the lowercase name. Null for `attribute: false`. */
function editorAttribute(widget: HTMLElement, name: string, declaration: Declaration): string | null {
    let attribute = declaration.attribute;
    if (typeof attribute !== "string" && attribute !== false) {
        const properties = (widget.constructor as unknown as { elementProperties?: unknown }).elementProperties;
        const property: unknown = properties instanceof Map ? properties.get(name) : undefined;
        if (isMap(property)) attribute = property.attribute;
    }
    return attribute === false ? null : typeof attribute === "string" ? attribute : name.toLowerCase();
}

/**
 * What the editor does for a change in its drawer (domeditor `features/widget.ts`
 * with `@webwriter/lit` `widget-options.ts`): find the attribute, check that the
 * option is available and the value fits, then write the attribute, or the
 * property when the declaration says `attribute: false`. A boolean with
 * `inverted: true` has the negative attribute: false writes it and true
 * removes it. `null` resets.
 * Returns false if the editor would refuse the change.
 */
export function editorSetOption(widget: HTMLElement, name: string, value: string | number | boolean | null): boolean {
    const declaration = editorDeclarations(widget, "options")[name];
    if (!isMap(declaration)) throw new TypeError(`The widget has no option '${name}'`);
    const attribute = editorAttribute(widget, name, declaration);
    const kind = declaration.type === Boolean ? "boolean" : declaration.type === Number ? "number" : typeof declaration.type === "string" ? declaration.type : "string";
    if (declaration.hidden === true || declaration.disabled === true || declaration.readOnly === true) return false;
    if (value !== null && value !== "") {
        const { min = -Infinity, max = Infinity } = declaration as { min?: number; max?: number };
        if (kind === "boolean" && typeof value !== "boolean") return false;
        if (kind === "number" && (typeof value !== "number" || value < min || value > max)) return false;
        if (kind === "select" && !(Array.isArray(declaration.options) && declaration.options.some((choice: { value?: unknown }) => choice.value === value))) return false;
    }
    if (attribute === null) (widget as unknown as Declaration)[name] = value;
    else {
        const inverted = kind === "boolean" && declaration.inverted === true;
        const text = kind === "boolean" ? (value === !inverted ? "" : null) : value === null || value === "" ? null : String(value);
        if (text === null) widget.removeAttribute(attribute);
        else widget.setAttribute(attribute, text);
    }
    return true;
}

/**
 * What the editor does when an author switches a permission of a widget
 * (domeditor `setPermission`): the permission must be declared, and its
 * attribute is set or removed. Returns false if the editor would refuse.
 */
export function editorSetPermission(widget: HTMLElement, name: string, granted: boolean): boolean {
    const declarations = editorDeclarations(widget, "permissions");
    const declaration = Object.hasOwn(declarations, name) ? declarations[name] : undefined;
    if (!isMap(declaration)) return false;
    const attribute = editorAttribute(widget, name, declaration);
    if (!attribute || !/^[a-z_][a-z0-9_.-]*$/i.test(attribute) || ["style", "class", "is", "id", "contenteditable"].includes(attribute.toLowerCase())) return false;
    if (declaration.hidden === true || declaration.disabled === true || declaration.readOnly === true) return false;
    widget.toggleAttribute(attribute, granted);
    return true;
}

// ── Observation ───────────────────────────────────────────────────────────

/** Records every mutation of an element's attributes, children and text. `stop()` returns the records. */
export function mutations(element: Node): { stop(): MutationRecord[] } {
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => void records.push(...list));
    observer.observe(element, { attributes: true, childList: true, characterData: true, subtree: true });
    return {
        stop() {
            records.push(...observer.takeRecords());
            observer.disconnect();
            return records;
        },
    };
}

/** Records the names of the given events as they reach the document. `stop()` returns them in order. */
export function events(...types: string[]): { log: string[]; stop(): string[] } {
    const log: string[] = [];
    const abort = new AbortController();
    for (const type of types) document.addEventListener(type, () => void log.push(type), { signal: abort.signal, capture: true });
    return {
        log,
        stop() {
            abort.abort();
            return log;
        },
    };
}

/** Collects `console.warn` messages instead of printing them. `stop()` returns them and restores the console. Also restored when the check ends. */
export function warnings(): { stop(): string[] } {
    const log: string[] = [];
    const native = console.warn;
    const record = (console.warn = (...parts: unknown[]) => void log.push(parts.map(String).join(" ")));
    const restore = () => {
        if (console.warn === record) console.warn = native;
    };
    restores.push(restore);
    return {
        stop() {
            restore();
            return log;
        },
    };
}

// Listener bookkeeping, for cleanup checks. Installed when this file loads.
const registered = new Map<EventTarget, Set<string>>();
const ids = new WeakMap<object, number>();
let nextId = 0;
const { addEventListener: add, removeEventListener: remove } = EventTarget.prototype;
const entry = (type: string, listener: object, options?: boolean | AddEventListenerOptions) => {
    if (!ids.has(listener)) ids.set(listener, nextId++);
    const capture = typeof options === "boolean" ? options : !!options?.capture;
    return `${type}|${capture}|${ids.get(listener)}`;
};
EventTarget.prototype.addEventListener = function (type: string, listener: any, options?: any) {
    if (listener) {
        const id = entry(type, listener, options);
        const target = this ?? window;
        const set = registered.get(target) ?? registered.set(target, new Set()).get(target)!;
        set.add(id);
        if (options?.signal) add.call(options.signal, "abort", () => set.delete(id), { once: true });
        if (options?.signal?.aborted) set.delete(id);
    }
    return add.call(this, type, listener, options);
};
EventTarget.prototype.removeEventListener = function (type: string, listener: any, options?: any) {
    if (listener) registered.get(this ?? window)?.delete(entry(type, listener, options));
    return remove.call(this, type, listener, options);
};

/**
 * Records the undo steps of a widget: for every `ww-transactionstart` and `ww-transactionend` on
 * it, what `read()` returned at that moment. `["start 500", "end 600"]` is one step that holds the
 * change. `stop()` returns the list.
 */
export function transactionSteps(widget: Element, read: () => unknown): { stop(): string[] } {
    const log: string[] = [];
    const ended = new AbortController();
    widget.addEventListener("ww-transactionstart", () => void log.push(`start ${read()}`), { signal: ended.signal });
    widget.addEventListener("ww-transactionend", () => void log.push(`end ${read()}`), { signal: ended.signal });
    return {
        stop() {
            ended.abort();
            return log;
        },
    };
}

/** How many listeners are currently registered on the given targets (default: window and document). */
export function listeners(...targets: EventTarget[]): number {
    if (targets.length === 0) targets = [window, document];
    return targets.reduce((sum, target) => sum + (registered.get(target)?.size ?? 0), 0);
}

/**
 * The event types of the listeners that are registered on the given targets (default: window and
 * document), one entry per listener, sorted. `listenerTypes().join()` before and after says
 * exactly what was added: `added(before)` below.
 */
export function listenerTypes(...targets: EventTarget[]): string[] {
    if (targets.length === 0) targets = [window, document];
    return targets.flatMap((target) => [...(registered.get(target) ?? [])].map((id) => id.split("|")[0])).sort();
}

/** The event types that are listened for now and were not in `before`, a result of `listenerTypes()` for the same targets. */
export function addedListeners(before: readonly string[], ...targets: EventTarget[]): string[] {
    const left = [...before];
    return listenerTypes(...targets).filter((type) => {
        const at = left.indexOf(type);
        if (at < 0) return true;
        left.splice(at, 1);
        return false;
    });
}
