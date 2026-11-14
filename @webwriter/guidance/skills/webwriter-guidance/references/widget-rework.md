# Widget rework

## Establish the current behavior

Identify the target widget exports, their package manifest, existing tests and fixtures, and the author and reader tasks affected by the request. Start with the declared badges and add checks for capabilities the request affects. Use the whole catalog for a broad review and mark unrelated capabilities out of scope.

```sh
npx -y @webwriter/guidance badges ./package.json
npx -y @webwriter/guidance badges
npx -y @webwriter/guidance retrieve "reference/keywords,guides/focus,guides/sharing"
```

`badges` uses the documentation's badge-to-guide mapping and reports guide IDs for `retrieve`. With a manifest path it resolves declared keywords, retaining specific language tags, formats, and migration versions. Check the keyword reference for valid values. Retrieve the guides for the checks in scope. For a package with several widget exports, verify which exports support each relevant package-level claim.

Keep an audit row for each relevant badge and each declared value. Record the affected export, expected behavior, observed behavior and evidence, and status. Use `Verified`, `Gap`, `Needs decision`, `Out of scope`, or `Unverified` when evidence is unavailable. A manifest entry alone is a claim. Verify it against behavior.

## Work through the capabilities

| Badges | Evidence to collect | Decisions for the human when open |
| --- | --- | --- |
| Editable, Configurable, Has content | Exercise author controls in edit mode and reader controls in read mode. Save and reopen authored text and nested widgets. Check option defaults, actions, and undo. | What authors can change, which controls to expose, and accepted content. |
| Pointer, Keyboard, Touch input | Complete the primary task with each claimed input method. Check activation, focus order, visible focus, and interaction with editor selection. | Interaction changes such as new controls, gestures, or a different task flow. |
| Responsive, Themeable, Printable, Content languages | Check narrow and wide document widths, inherited theme or documented styling hooks, print preview, and each claimed language. | What gets priority in a narrow layout, what appears in print, public styling hooks, and supported languages. |
| Stateful, Reactive | Check saved state after reopening and undo, temporary state during interaction, and updates between connected widgets. | What persists or resets and which signals form a public interface. |
| Shareable, Distributable | Exercise the claimed scopes with participants in distinct roles or groups. Check permissions, submission, and what the host can see. | Default sharing scope, participation permissions, and what participants and hosts can see. |
| Converts from, Converts to, Migrates from | Use a fixture per claimed format or version. Inspect what survives conversion or migration and how invalid imports are handled. | Supported formats and versions and acceptable data loss. |
| Online variants, Dynamic loading, Shared dependencies, Standalone | Exercise the claimed modes online and offline. Check optional imports, dependency sharing, and standalone use on a plain page as applicable. | Network requirements, offline behavior, and where standalone results are stored. |
| Testable, Widget, purpose badges | Check manifest exports and discovery, run exported tests in the Developer console when claimed, and compare the purpose badge with the reader's primary task. | Intended audience and purpose, and whether to publish. |

## Ask and keep working

Use the request, accepted decisions, documented behavior, and existing tests or saved content to establish intent. On a rework, fix gaps with a clear expected outcome within scope, including compatibility and accessibility regressions. On an audit, report the findings. Preserve existing behavior and authored data when the request leaves them open.

When fixing a gap would choose a user-visible design, change a documented default, or add or drop a supported capability, ask before making that change unless the user already decided it. Group related questions. State the observed behavior, give two or three concrete options with tradeoffs when available, and recommend one. Use the host's question mechanism if available. While the answer is pending, continue independent fixes and verification. Keep dependent changes pending until the user answers. If the host requires a reply before work can resume, complete the independent work first and ask with a summary of what remains.

For example, if a poll's default sharing scope is unclear, ask who should see votes by default and explain the individual, group, and everyone options. While waiting, verify keyboard submission and that existing saved polls still open, provided those checks do not depend on the choice.

## Verify and report

Test the affected flows with a fresh widget and representative saved content. Recheck the declared badge claims against the result. Update manifest keywords to reflect verified capabilities within the agreed scope. If a badge is unsupported and retaining or dropping the capability is a design decision, record the gap and ask. Report completed fixes and evidence alongside any pending decisions or unverified claims.
