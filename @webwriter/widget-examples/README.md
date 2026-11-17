# @webwriter/widget-examples

Example widgets and real-browser checks of the declarative widget modules. A private workspace package of the WebWriter repository; it is not published.

The modules themselves are not in this package. The framework-neutral cores are `@webwriter/widget/<module>`, the bindings `@webwriter/lit/<module>` and the matching modules of `@webwriter/react`, `vue`, `svelte` and `angular`, all in the sibling folders of this package. This package imports them by those names and holds no copy. It keeps the example widgets, the headless Chrome checks of every module (`npm test`), and the examples as a loadable WebWriter package (`webwriter/`). A change to a library and the checks that cover it belong in the same commit.

```
examples/<n>/       index.ts (the widget), index.html (demo), test.ts + test.html (checks)
examples/shared     shared pieces of the examples (base class, sort item, shared checks)
examples/binding-*  the same checks for the React, Vue, Svelte and Angular bindings
test/               harness.ts (in-page helpers), run.mjs (runner)
scripts/            build.mjs (examples), build-webwriter.mjs (the WebWriter package), libraries.mjs (where the libraries come from)
webwriter/          the WebWriter package of the examples: manifest, entry modules, snippets, TESTING.md
dist/               build output of the examples, git-ignored
webwriter/dist/     build output of the WebWriter package, git-ignored
```

## How the libraries are consumed

The libraries are read from the sibling folders (`..`; set `WEBWRITER` to another `@webwriter` folder to check a different copy). They are not installed as dependencies, so a change in a library is in the next build here.

- **Builds** resolve the library names with the esbuild plugin in `scripts/libraries.mjs`, by the `exports` of each package. A subpath that a package does not export fails the build, as it would for a widget that installed the package.
  - By default an import resolves to the **source**: the `source` target of the export (the `.ts` file), and inside a library the `.ts` beside every relative `.js` import. A change in a library is in the next build here, without building it.
  - With `LIBRARIES=built` an import resolves to the `default` target, the `.js` files that `npm run build` writes in each library. These are the files npm publishes. `npm run test:built` runs every check against them; build the libraries first.
- **One copy of each dependency.** The plugin resolves `lit`, `lit-html`, `lit-element`, `@lit/*`, `@lit-labs/*`, `signal-polyfill` and `pixi.js` from this package's folder for every file, also for the library and editor code that the checks import. After each build `bundleProblems()` reads esbuild's metafile and fails the build if a bundle holds a package from two folders, holds a library that is not from the sibling folders, or holds a library module both as its source and as its built file.
- **Frameworks.** React, Vue, Svelte and Angular come from the repository's `node_modules`, where the bindings resolve them too.
- **TypeScript** finds the libraries through `paths` in `tsconfig.json`. The library sources are type-checked with this package's options.

A catalog of module text is imported by its module on demand (`import("./de.js")`). esbuild puts such a file into the bundle when it writes one file per entry, which both builds here do, so every catalog of every module a widget uses is part of that widget's file. Nothing is fetched at run time, and the text still arrives asynchronously (see "Module text").

## Commands

Run `bun install --frozen-lockfile` once in the repository root, then the commands in this directory. Google Chrome is needed for the checks.

| Command | What it does |
| --- | --- |
| `npm run build` | Bundles every `examples/*/index.ts` and `examples/*/test.ts` into `dist/<name>/`, with the sources of the libraries, and checks the bundles for duplicates. |
| `npm run typecheck` | `tsc --noEmit` over `examples`, `test/harness.ts` and the library files they import. |
| `npm test` | Builds the examples and their WebWriter package, then runs every `examples/*/test.html` in headless Chrome. Exits non-zero on a failure. |
| `npm run test:built` | The same against the built files of the libraries (`LIBRARIES=built`). Run `npm run build` in the libraries first. |
| `node scripts/build.mjs circuit swarm && node test/run.mjs circuit swarm` | Build and check only these examples, leaving the rest of `dist/` alone. |
| `npm run build:webwriter` | Builds the WebWriter package of the examples: `webwriter/dist/<tag>.js` for every widget export of `webwriter/package.json`. Load the folder `webwriter/` in WebWriter with Develop → Local packages → Load; `webwriter/TESTING.md` says what to try. The checks of the built package are `examples/webwriter-package`. `LIBRARIES=built` works here too. |

The packaging of the libraries (every export has its types and its built module, a module pulls in no other module, only `scene/pixi` imports `pixi.js`, the built modules load without a bundler) is checked where the libraries are: `npm test` in `@webwriter/widget` and `@webwriter/lit`.

To look at a demo, build and serve this directory on loopback, for example `python3 -m http.server --bind 127.0.0.1 8000`, then open `/examples/<name>/index.html`.

## Working in parallel

Several people work on different examples at the same time. Each one builds and checks only their own examples:

```
node scripts/build.mjs <name> [<name>…] && node test/run.mjs <name> [<name>…]
```

- Do not run `npm test`, `npm run build` or `node scripts/build.mjs` without names while others are working: they rebuild all of `dist/`. They are for the integration at the end.
- For types run `npx tsc --noEmit` and look only at errors in your own files.
- If a check fails because of a defect in a library, fix the library in the same change, or describe the defect and register the check with `knownFailure()` (see below).
- The shared files are frozen. If one of them needs a change, describe the change instead of making it: `test/harness.ts`, `test/run.mjs`, `scripts/`, `package.json`, `tsconfig.json`, this file, `examples/core/`, `examples/shared/`, `examples/sort-list/` and `examples/vanilla-sort/`.

## Add an example

1. Create `examples/<name>/index.ts`. Lit examples extend `ExampleElement` from `examples/shared/base.ts`, which is `LitElementWw` from `@webwriter/lit`. It works in a plain page in current Chrome (it needs native scoped custom element registries).
2. Import the modules by their package names: `import { Drag } from "@webwriter/lit/drag"`, `import { transaction } from "@webwriter/widget/transaction"`.
3. Create `examples/<name>/index.html` that loads `../../dist/<name>/index.js` as a module and shows the widget.
4. Use tag names that start with `ww-` and are unique in this package.

The build and the runner find the folder by itself. Do not edit `scripts/build.mjs` or `test/run.mjs` for a new example.

What an example must do itself:

- A change to the document that no module makes goes through `transaction(this, change)`, so that it is one undo step. Lit writes a reflected attribute at the render, so the step lasts until then: `transaction(this, async () => { this.running = !this.running; await this.updateComplete; })`.
- A widget with the Exercise binding declares the helper's actions with a getter: `get actions() { return this.#exercise.actions }`. The binding warns in development if the getter is missing.
- A widget keeps its controllers in private fields. `LitElementWw` reports a public member named `permissions`, `options`, `actions`, `data` or `localize` that holds something else than a declaration.

## Add and run checks

`examples/<name>/test.html` only loads the bundle:

```html
<!doctype html>
<meta charset="utf-8">
<title>name checks</title>
<script type="module" src="../../dist/<name>/test.js"></script>
```

`examples/<name>/test.ts` imports the harness first, registers checks and ends with `run()`:

```ts
import { check, drag, equal, mount, run } from "../../test/harness";
import "./index";

check("pointer: a drop moves the item", async () => {
    const list = await mount(`<ww-thing><p>a</p><p>b</p></ww-thing>`);
    await drag(list.children[0], list.children[1]);
    equal([...list.children].map((child) => child.textContent), ["b", "a"]);
});

run();
```

A check passes unless its function throws or rejects, an uncaught error occurs while it runs, or it takes longer than ten seconds. Elements created with `mount()` are removed after each check. If a page hangs, the runner names the check it was in.

The harness (`test/harness.ts`):

| Helper | Use |
| --- | --- |
| `check(name, fn)`, `run()` | Register a check; run and report all of them. |
| `knownFailure(name, defect, fn)` | A check that fails because of a defect in a library. `defect` names the file, the line and what happens. It is reported as `KNOWN` and does not fail the run; once it passes it fails, so that the mark is taken away. |
| `assert(condition, message)`, `equal(actual, expected, message)` | `equal` compares JSON. |
| `mount(html)` | Adds the HTML to the page, waits for it and returns its first element. A `<template shadowrootmode="open">` becomes the shadow root of its parent. |
| `frame(n)`, `wait(ms)`, `settled(...elements)`, `animations()`, `until(fn)` | Wait for frames, for Lit updates plus two frames, for running animations, or for a condition. They use the browser's clock, also while `fakeFrames()` is installed. |
| `fakeFrames()` | Replaces `requestAnimationFrame`: `fire(now)` runs the waiting callbacks as one frame at that time, `pending` counts them, `restore()` gives the clock back. Restored in any case when the check ends. |
| `point(element, fx, fy)` | A point inside an element, as fractions of its box. |
| `pointer(target, type, point, init)`, `key(name, target, init)` | Synthetic pointer and keydown events. `key` goes to the focused element by default. |
| `typeInto(control, value, ...events)` | Sets the value of an input, textarea or select (`checked` for a boolean) and dispatches `input`, or the events named: `typeInto(field, "5", "input", "change")`. |
| `drag(from, to, {cancel, held})` | A whole pointer drag. `held` runs while the item is over the destination. |
| `deepActive()` | The focused element, through open shadow roots. |
| `mutations(node).stop()` | Mutation records of a subtree, to prove that nothing was written. |
| `events(...types).stop()` | Names of events in the order they reached the document. |
| `transactionSteps(widget, read).stop()` | The undo steps of a widget: what `read()` returned at each `ww-transactionstart` and `ww-transactionend`. `["start 5", "end 105"]` is one step that holds the write. |
| `editorSetOption(widget, name, value)`, `editorSetPermission(widget, name, granted)` | What the editor does for a change in its drawer: it finds the attribute and writes it, or the property for `attribute: false`. For a boolean with `inverted: true` it writes the attribute for false and removes it for true. |
| `listeners(...targets)` | Number of listeners currently registered (default: window and document), for cleanup checks. |
| `listenerTypes(...targets)`, `addedListeners(before, ...targets)` | The event types that are listened for, and those that were added since `before`. A connected module with text has one `online` listener on the window (see "Module text"). |
| `warnings().stop()` | The `console.warn` messages since the call, for checks of development warnings. |

Checks share one page, so a check must not leave listeners or changed globals behind. Test the interaction, the cancel path and the cleanup, not only that something rendered.

Text of a module in another language than English arrives after the module connected. A check waits for it with `until()`, or with `await loadMessages(source, "de")` from `@webwriter/widget/messages`, before it compares German text. A check that depends on a catalog not being loaded yet is the first check of its page, and sets `document.documentElement.lang`, because a module may also load the catalog of the browser's language.

Headless Chrome delivers animation frames slowly on a busy machine (about 15 per second was measured), so wait with `frame()`, `settled()`, `animations()` or `until()` and never with fixed times. The runner starts one Chrome per page, one after the other, and gives a page `CHECK_TIMEOUT` ms (default 120000). `CHROME` sets the binary and `CHROME_FLAGS` adds flags.

The runner prints `PASS`, `FAIL` or `KNOWN` per check and ends with the counts and the list of known failures. A page reports by POSTing `{results: [{name, ok, error, known}]}` to `/__report`. The Mocha tests that widget packages export run with `scripts/widget-test.mjs` of the widgets workspace, not with this runner.

The checks of `order-exercise`, `choice-exercise` and `webwriter-package` also import editor code from `../domeditor` (`examples/order-exercise/host.ts`, `examples/webwriter-package/test.ts`). If that code is gone, those checks report `SKIPPED`.

## Known failures

None.

## What exists

| Module | Core | Lit binding | Example |
| --- | --- | --- | --- |
| Base | `@webwriter/widget/base` | `@webwriter/lit/base` | `core` |
| Undo transaction | `@webwriter/widget/transaction` | | `core`, and every example that writes to the document |
| Pointer gesture | `@webwriter/widget/gesture` | | `core` |
| Module styles | `@webwriter/widget/styles` | | `core` |
| Module text | `@webwriter/widget/messages`, `@webwriter/widget/messages/shared` | | `core` |
| Live region | `@webwriter/widget/announce` | | `core` |
| Permissions | `@webwriter/widget/permissions` | `@webwriter/lit/permissions` | `sort-list`, `vanilla-sort`, `core` |
| Drag | `@webwriter/widget/drag` | `@webwriter/lit/drag` | `sort-list`, `vanilla-sort`, `palette` (copy, free positions), `pairing` (links) |
| Viewport | `@webwriter/widget/viewport` | `@webwriter/lit/viewport` | `diagram-view` (scroll and canvas form), `library-view` (adapter) |
| Help | `@webwriter/widget/help` | `@webwriter/lit/help` | `diagram-view` |
| Scene | `@webwriter/widget/scene`, `@webwriter/widget/scene/pixi` (the only one that imports PixiJS) | `@webwriter/lit/scene` | `circuit` (SVG), `swarm` (PixiJS) |
| Settings | `@webwriter/widget/settings` | `@webwriter/lit/settings` | `epidemic`, `settings-plain` (no framework) |
| Shortcuts | `@webwriter/widget/shortcuts` | `@webwriter/lit/shortcuts` | `epidemic`, `stepper` |
| Playback | `@webwriter/widget/playback` | `@webwriter/lit/playback` | `epidemic`, `stepper`, `media-stepper` (a media element) |
| Run when visible | `@webwriter/widget/visible` | | `epidemic` |
| Data block | `@webwriter/widget/data` | `@webwriter/lit/data` | `order-exercise`, `data-plain` (no framework, on `withWidgetRuntime()`) |
| Localization | `@webwriter/widget/localize` (also `matchLocale`) | `@webwriter/lit/localize` | `order-exercise`, `choice-exercise` |
| Exercise | `@webwriter/widget/exercise` | `@webwriter/lit/exercise` | `order-exercise`, `choice-exercise` |
| Obfuscation | `@webwriter/widget/obfuscate` | | `order-exercise`, `choice-exercise` |

A Pixi scene falls back to SVG with `webglAvailable() ? PixiScene : Scene` when registering `ww-scene`.

## How the modules are built

The rest of this file describes how the libraries are built, as the examples and checks here rely on them. The interface for widget authors is in `domeditor/docs/widgets/reference/lit.md` and `adapters.md`; this part is for people who change the libraries. Paths are relative to `@webwriter/widget` unless they name `@webwriter/lit`.

### A core and its binding

- A core extends `ModuleCore<Snapshot>` from `base.ts`. Its constructor takes the host and one options object. The options extend `CoreOptions`, which holds `root`, the way to get the shadow root.
- Everything that must end on disconnect is registered in `onConnect()` with `this.listen()`, `this.cleanup()` or `this.signal`. There is no `onDisconnect()`.
- `onRefresh()` runs after the widget rendered. Read the template then, and never keep nodes across renders.
- State is an immutable snapshot. Replace it, then call `this.notify()`. `getSnapshot()` returns the same object until the state changes.
- A change to the document goes through `transaction(host, change)` from `transaction.ts`. `transactionOpen(host)` tells whether one is open. If `change` returns a promise, the transaction ends when it settles. If the host leaves the document while its transaction is open, the transaction ends at once and the place the host was attached to sends a second `ww-transactionend`, with `detail.host`, because the host's own event no longer reaches the document.
- Markers are `data-ww-*` attributes on the shadow template. Events are `ww-*` CustomEvents with `bubbles: true, composed: true`.
- Module CSS goes into the shadow root with `adoptStyles(root, css)` from `styles.ts`. It returns the function that removes the sheet; `adoptStyles(root, css).sheet` is the sheet, for a module that changes its rules later. Module elements, such as an overlay, are appended to the shadow root and removed in a `cleanup()`.
- Nothing is written to authored (light DOM) elements except the change that is committed. Use Web Animations instead of style attributes.
- A module never decides by itself what a reader may do. It takes a `can` function, and the widget passes `() => permissions.can("name")`, combined with its own conditions. A permission that a declaration names (`can: "allowReset"` on an action, `data-ww-can` around a control) is resolved with `can(host, name)` from `permissions.ts`.
- An interaction asks again while it runs: `this.whileAllowed(can, ended)` returns a signal that aborts when the answer turns false. See "Permissions for modules" below.
- Pointer input uses `PointerGesture` from `gesture.ts`. `gesture.ended` aborts when the gesture is over. The `convert` option delivers samples in other coordinates: `new PointerGesture(surface, event, { convert: (x, y) => viewport.toWorld(x, y) })`.
- Text a module speaks or shows comes from `Messages`, and it speaks through `announcer(root)`. See "Module text" below.
- Relative imports inside the libraries are written with `.js`. Every `.ts` has its built `.js` beside it (`npm run build` in the package).
- The Lit binding extends `CoreController` from `@webwriter/lit/base` and only forwards what a template needs. If only some changes of the core show in a template, it overrides `shouldRender()` and returns false for the others.
- A core that is stored in a public member named `permissions`, `options`, `actions`, `data` or `localize` reports that in development (Lit's development build, or a page on loopback), because the editor reads those members as declarations. A Lit binding in such a member is reported by `LitElementWw`; the binding itself says nothing. `warnOnce(owner, key, message)` from `base.ts` is there for a module's own development warnings.

Template for a new module:

```ts
// @webwriter/widget/messages/example/index.ts
import { defineMessages } from "../../messages.js";
import catalogs from "./catalogs.js"; // generated by `node scripts/messages.mjs tables`, which the build runs

export type ExampleMessages = { toggle: string; switched: (on: boolean) => string };
export const exampleMessages = defineMessages<ExampleMessages>(
    { toggle: "Switch", switched: (on) => (on ? "Switched on." : "Switched off.") },
    catalogs,
);

// @webwriter/widget/messages/example/de.ts
import type { Catalog } from "../../messages.js";
import type { ExampleMessages } from "./index.js";

export default {
    toggle: "Umschalten",
    switched: (on) => (on ? "Eingeschaltet." : "Ausgeschaltet."),
} satisfies Catalog<ExampleMessages>;

// @webwriter/widget/example.ts
import { announcer } from "./announce.js";
import { ModuleCore, type CoreOptions } from "./base.js";
import { Messages, type MessagesOption } from "./messages.js";
import { exampleMessages, type ExampleMessages } from "./messages/example/index.js";

export type ExampleOptions = CoreOptions & { can?: () => boolean; messages?: MessagesOption<ExampleMessages> };
export type ExampleSnapshot = { readonly active: boolean };

export class ExampleCore extends ModuleCore<ExampleSnapshot> {
    #options: ExampleOptions;
    #messages: Messages<ExampleMessages>;
    #announce: (text: string) => void = () => {};
    #state: ExampleSnapshot = { active: false };

    constructor(host: HTMLElement, options: ExampleOptions = {}) {
        super(host, options);
        this.#options = options;
        this.#messages = new Messages(host, exampleMessages, options.messages);
    }

    getSnapshot() {
        return this.#state;
    }

    protected onConnect() {
        const live = announcer(this.root);
        this.cleanup(live.release);
        this.#announce = live.announce;
        // Asks for the catalog of the widget's language. Names that onRefresh() wrote are
        // written again when it has arrived, and in a new language.
        this.cleanup(this.#messages.follow(() => this.refresh()));
        this.listen(this.root, "click", (event) => this.#toggle(event));
        this.cleanup(() => (this.#state = { active: false }));
    }

    protected onRefresh() {
        for (const element of this.root.querySelectorAll("[data-ww-example]")) {
            element.toggleAttribute("data-ww-active", this.#state.active);
            if (element.getAttribute("aria-label") !== this.#messages.current.toggle) element.setAttribute("aria-label", this.#messages.current.toggle);
        }
    }

    #toggle(event: Event) {
        if (!(event.target as Element).closest("[data-ww-example]") || this.#options.can?.() === false) return;
        this.#state = { active: !this.#state.active };
        this.#announce(this.#messages.current.switched(this.#state.active));
        this.notify();
    }
}

// @webwriter/lit/example.ts
import { ExampleCore, type ExampleOptions } from "@webwriter/widget/example";
import { CoreController, type BindingOptions, type CoreHost } from "./base.js";

export class Example extends CoreController<ExampleCore> {
    constructor(host: CoreHost, options: BindingOptions<ExampleOptions> = {}) {
        super(host, (root) => new ExampleCore(host, { ...options, root }));
    }
    get active() {
        return this.snapshot.active;
    }
}
```

A new module also needs its entry in the `exports` of its package.

In a Lit widget: `#example = new Example(this, { can: () => this.#permissions.can("allowExample") })`. In a plain custom element, call `core.connect()` in `connectedCallback`, `core.disconnect()` in `disconnectedCallback`, and `core.refresh()` after changing the template; see `examples/vanilla-sort/index.ts`.

### Module text

A module that speaks or names its buttons gets its text from one mechanism, `messages.ts`. Its default strings cannot be extracted from a widget's project, so the module ships its own catalogs.

- **The table.** A type with one entry per text: a string, or a function of parameters that returns the string. `defineMessages<T>(defaults, catalogs)` holds the English defaults and the catalogs by locale. A catalog is given as a loader, `() => import("./de.js")`, or, for a widget's own table, as the object itself.
- **A catalog** is `messages/<module>/<locale>.ts`, beside the module's table in `messages/<module>/index.ts`. It default-exports `{…} satisfies Catalog<T>` with every key of the table and imports types only: a catalog does not import another catalog. `messages/<module>/catalogs.ts` is generated from the files of the folder and holds one loader per locale.
- **Loading.** A catalog is loaded when a widget has that language: `Messages.follow()` asks for it when the module connects, and a read of `current` asks for it too. Until it has arrived the text is English. `messages.loaded` tells which it is. A failed load sends `localizationerror` (`detail.locale`, `detail.error`) on the widget and is tried again when the browser comes back online. A catalog that arrives after the language changed again is not shown.
- **The language** is the widget's effective language: that of its widget runtime, or the `lang` of the host or of its nearest ancestor, through shadow roots (`languageOf(element)`). The best catalog is found with `matchLocale` from `locale.ts`, which `@webwriter/widget/localize` exports, so `de-AT` reads the `de` catalog. Without a language, or without a catalog for it, the text is English.
- **The instance.** `new Messages(host, source, options.messages)`. `messages.current` is the table for the language the widget has at that moment, with what has arrived. `messages.follow(changed)` calls `changed` when another catalog answers for the language and when the catalog of the language arrives, and returns the function that stops it; a core passes `() => this.refresh()`. While it follows it has one `online` listener on the window. `messages.language` and `messages.locale` say what was resolved.
- **The override.** Every module takes `messages?: MessagesOption<T>`: an object with some entries, or a function that returns one. The override wins in every language and needs no loading. A function is asked on every read, so a widget can pass its own translated strings: `messages: () => ({ zoomIn: this.msg("Closer") })`.
- **Shared strings** that several modules speak are in `messages/shared/` (`sharedMessages`: `cancelled`, `notAllowed`).
- `resolveMessages(source, language, override)` answers with what has arrived, `loadMessages(source, language, override)` waits for the catalog, and `messageLocale(source, language)` names the locale, all without an instance.
- **The editor's labels.** The Exercise helper builds its action and option labels as localized text with one entry per catalog that has arrived, loads the catalog of the document's language for them, and sends `optionschange` when the widget's language changes or a catalog arrives.

A module speaks through one polite live region per widget, `announce.ts`: `announcer(root)` returns `{ announce(text), release() }`. Every module in a shadow root shares the same `<div data-ww-live aria-live="polite">`. It exists, empty, from the first `announcer()` call, is put back if a framework cleared the shadow root, is hidden by a module style sheet, and is removed when its last user called `release()`. The same text twice in a row is read twice. The template above shows both.

### Settings and the editor's options

`SettingsCore.editorOptions()` generates one option per setting, each with its attribute. A boolean that is true by default is stored by a negative attribute (`no-show-chart`). By default it is declared with that attribute and `inverted: true`, and the editor writes the attribute for false. `negativeBooleans: "property"` declares it with `attribute: false` instead, for an editor that sets the property; `core.defineProperties()` or the Lit mixin gives the host that property.

### Permissions for modules

`permissions.ts` answers for the editor's `static permissions`. Besides the controller it has what other modules and inner components need:

| Need | Use |
| --- | --- |
| A permission named in a declaration, without holding the widget's controller | `can(host, name)`. It is answered by the widget's Permissions if it has them, otherwise by the same rule applied to the widget's declaration and attributes. `isEditing(host)` is the mode. Both work for the widget and for any element in its shadow tree. |
| A component inside the widget's shadow tree, where `isContentEditable` is false | Lit: `#permissions = widgetPermissions(this)` from `@webwriter/lit/permissions` gives `can(name)` and `editing` of the widget and re-renders the component when they change. `new Permissions(this)` in such a component follows the widget in the same way and also handles `data-ww-can` in the component's own template. Without Lit: `requestPermissions(element)` returns the widget's `PermissionsSource` (`can`, `editing`, `subscribe`). The request is the event `ww-permissionsrequest`; a widget answers it for itself and for its shadow tree, not for slotted children. |
| Cancel a running interaction when the answer turns false | In a core: `const lost = this.whileAllowed(() => this.#can(), gesture.ended)`, then `lost.addEventListener("abort", () => gesture.cancel())`. `can()` is asked again when an attribute of the host or of a widget around it changes, which is how the mode and the permissions change, also by undo or by a collaborator, and on every `refresh()`, which is when a widget's own conditions change. The watch ends with the signal passed as `until` and on disconnect, and then never reports a loss. Outside a core: `watchAllowed(host, can, until)` from `base.ts` returns `{ signal, check() }`. |

The attribute of a permission follows the editor: `attribute` in the declaration, then the attribute of the Lit property with the permission's name, then the lowercase name. A widget without Lit properties names the attribute in the declaration, which the editor reads too: `static permissions = { allowReordering: { label: {…}, attribute: "allow-reordering" } }`. `edit` is reserved and never a permission.
