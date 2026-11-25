# C1. @webwriter/build

> [!NPM]
>
> [View `@webwriter/build` on npm](https://www.npmjs.com/package/@webwriter/build)

`@webwriter/build` compiles widget and test exports. It reads the path in `source` and writes the result to the path in `default`. Export plain browser JavaScript directly if it needs no build.

| Command / flag | Effect |
|---|---|
| `npx @webwriter/build` | Build exports. |
| `npx @webwriter/build dev` | Watch source files and build again when they change. |
| `npx @webwriter/build preview <tag-name>` | Serve a standalone preview for a `./widgets/<tag-name>.*` export. |
| `npx @webwriter/build localize` | Generate and apply configured widget, snippet, and metadata translations. |
| `npx @webwriter/build document` | Generate widget documentation and custom element metadata. |
| `--shared-dependencies` | Use shared dependency imports and chunks for builds and `dev` in WebWriter 2. |
| `--yes`, `-y` | Confirm interactive proposals, including saving proposed prebuilt dependencies. |
| `--prebuild-threshold=<modules>` | With `--shared-dependencies`, reconsider whether to bundle dependencies above this module count. The default is 200. |
| `--help`, `-h` | Show CLI help. |

By default, the build puts dependencies in each widget for compatibility with WebWriter 1. With `--shared-dependencies`, shared dependencies stay as bare imports. The build bundles the prebuilt dependencies.

The build uses an unconfirmed prebuild choice for the current build only. This also applies to a build without a terminal. Standalone previews include all dependencies in the bundle.

## Document

`npx @webwriter/build document` reads the sources of the widget exports and writes `custom-elements.json` and a `README.md`. It also sets `customElements` and the `./custom-elements.json` export in `package.json`. The command runs the manifest analyzer that `@webwriter/build` installs, so it needs no network connection. The analyzer reads only the folder that holds each widget `source` (for example `src/`), without `dist/`, `localization/`, generated catalogs, tests, and declaration files. The manifest lists only the modules of the widget sources. A README that the command did not sign is left alone, and the command writes `API.md` instead.

If the optional package `@wc-toolkit/cem-inheritance` is not installed, the command downloads its plugin once from a CDN. The plugin copies inherited members of base classes into the manifest. Without a network connection the command warns and continues without the plugin. The manifest then lacks inherited members.

## Import text files

The build imports these file types as a string: `.txt`, `.csv`, `.tsv`, `.md`, `.html`, `.htm`, `.xml`, `.puml`, `.plantuml`, `.mmd`, `.mermaid`, `.gift`, `.vtt`, `.srt`, `.fasta`, `.fa`, `.jff`, `.dot` and `.gv`. This also works in test modules, for example for a fixture file. Import any other file as text with the `inline:` prefix.

```js
import diagram from "./fixtures/sequence.puml"
import legacy from "inline:./fixtures/legacy.dat"
```

The `@webwriter/build/client` types declare these imports for TypeScript.

The **Checks & Tests** tab at the bottom of the editor reports invalid configuration, export keys, tag names, and content expressions. It also reports widget tags without definitions and [Lit properties](https://lit.dev/docs/components/properties/) that fail to reflect changes to attributes.

## Test reporting

Export tests through `./tests/<name>.js` or `./tests/<name>.*`. WebWriter gives each test module 60 seconds to run.

For [Mocha](https://mochajs.org/running/browsers/), import `getMochaConfig` from `@webwriter/build/test`. Pass its result to `mocha.setup()`. Define the tests. Call `mocha.run()` as the last step of the module. Without that call no test starts and the module times out after 60 seconds. The helper supplies reporting hooks. Install Mocha separately if necessary.

```js
import "mocha/mocha.js"
import {getMochaConfig} from "@webwriter/build/test"

mocha.setup(getMochaConfig())
describe("ww-counter", () => {
  it("counts", async () => { /* … */ })
})
mocha.run()
```

The build writes test exports only in `npx @webwriter/build dev`. A one-time `npx @webwriter/build` (and so `prepublishOnly`) builds the widget exports and leaves `./tests/` out of `dist/`, because the tests are for development and WebWriter's testing mode. To run them in a script or in CI, start `dev` and stop it after the first build has finished. Wait until every test file exists and is newer than the start of the run, because the watcher reports before the last file is written.

`@webwriter/build/test` also exports `connectEffect(widget, attribute, source, {shape})`. It connects an effect of a widget to a source for the length of a test and returns `{lifetime, disconnect()}`. Create the source with `signal` or `computed` from `@webwriter/widget/signals`. It throws when the widget declares no such effect or when the effect's `accepts` excludes the `shape`. See [Make data reactive](../guides/reactivity.md#test-a-receiver).

For other runners, dispatch [`CustomEvent("test-update", {detail})`](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent) on the test frame's `window`.

| `detail.type` | Fields |
|---|---|
| `beforeAll` | No additional fields. |
| `beforeOne` | `id: string`, `path: string[]`. Optional `sync: boolean`. |
| `afterOne` | Same `id` and `path`, plus `passed: boolean`. Optional `duration: number` in milliseconds, `sync: boolean`, `timedOut: boolean`. |
| `afterAll` | No additional fields. |

Send one `beforeAll` and one `afterAll` per module. Send one `beforeOne` and one `afterOne` per test. See the [Ghost Disco test module](../examples/ghost-disco-tests.js) for a complete example.
