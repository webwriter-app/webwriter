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

The **Developer console** reports invalid configuration, export keys, tag names, and content expressions. It also reports widget tags without definitions and [Lit properties](https://lit.dev/docs/components/properties/) that fail to reflect changes to attributes.

## Test reporting

Export tests through `./tests/<name>.js` or `./tests/<name>.*`. WebWriter gives each test module 60 seconds to run.

For [Mocha](https://mochajs.org/running/browsers/), import `getMochaConfig` from `@webwriter/build/test`. Pass its result to `mocha.setup()`. Define the tests. Call `mocha.run()`. The helper supplies reporting hooks. Install Mocha separately if necessary.

For other runners, dispatch [`CustomEvent("test-update", {detail})`](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent) on the test frame's `window`.

| `detail.type` | Fields |
|---|---|
| `beforeAll` | No additional fields. |
| `beforeOne` | `id: string`, `path: string[]`. Optional `sync: boolean`. |
| `afterOne` | Same `id` and `path`, plus `passed: boolean`. Optional `duration: number` in milliseconds, `sync: boolean`, `timedOut: boolean`. |
| `afterAll` | No additional fields. |

Send one `beforeAll` and one `afterAll` per module. Send one `beforeOne` and one `afterOne` per test. See the [Ghost Disco test module](../examples/ghost-disco-tests.js) for a complete example.
