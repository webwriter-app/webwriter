# Build and test

`@webwriter/build` compiles widget and test exports from their `source` condition to their `default` path. Plain browser JavaScript can be exported directly without a build.

| Command / flag | Effect |
|---|---|
| `npx @webwriter/build` | Build exports. |
| `npx @webwriter/build dev` | Watch and rebuild source changes. |
| `npx @webwriter/build preview <tag-name>` | Serve a standalone preview for a `./widgets/<tag-name>.*` export. |
| `npx @webwriter/build localize` | Generate and apply configured widget, snippet, and metadata translations. |
| `npx @webwriter/build document` | Generate widget documentation and custom element metadata. |
| `--yes`, `-y` | Confirm interactive proposals, including saving proposed prebuilt dependencies. |
| `--prebuild-threshold=<modules>` | Reconsider bundling dependencies above this module count; default 200. |

Shared dependencies remain bare imports. Prebuilt dependencies are bundled. Without a terminal or confirmation, a proposed prebuild choice applies to the current build without being saved.

The developer console reports invalid configuration, unmatched export keys, invalid tag names and content expressions, undefined widget tags, and Lit properties whose changes are not reflected to attributes.

## Test reporting

Export tests through `./tests/<name>.js` or `./tests/<name>.*`. WebWriter runs each module in an isolated frame, with a 60-second limit.

For Mocha, import `getMochaConfig` from `@webwriter/build/test`, pass its result to `mocha.setup()`, define tests, then call `mocha.run()`. The helper supplies reporting hooks; install Mocha separately if needed.

Other runners dispatch `CustomEvent("test-update", {detail})` on the test frame's `window`:

| `detail.type` | Fields |
|---|---|
| `beforeAll` | No additional fields. |
| `beforeOne` | `id: string`, `path: string[]`. Optional `sync: boolean`. |
| `afterOne` | Same `id` and `path`, plus `passed: boolean`. Optional `duration: number` in milliseconds, `sync: boolean`, `timedOut: boolean`. |
| `afterAll` | No additional fields. |

Send one `beforeAll` and `afterAll` per module, with a before/after pair for each test. See the [tutorial](../tutorial/07-testing-publishing.md) for a complete small test.
