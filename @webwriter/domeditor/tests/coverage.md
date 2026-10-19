# Test coverage

Run the complete one-shot Vitest coverage suite:

```sh
npm run test:coverage
```

The installed V8 provider measures every `src/**/*.ts` file, including files
that no test imports. Test files and type declarations are excluded. Reports
are written to the ignored `coverage/` directory:

- `index.html`: source-level statements, functions, and branch gaps.
- `coverage-final.json`: detailed Istanbul-format coverage data.
- `coverage-summary.json`: totals and per-file coverage counts.

The global thresholds preserve the latest full-suite baseline: 87.18%
statements, 81.75% branches, 89.5% functions, and 90.85% lines. Raise them as
coverage improves. Do not exclude authored runtime code to satisfy a threshold.

The last clean full-suite measurement is the fifth batch: 120 files and 5,032
tests (17 added cases). Its coverage is:

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| All source | 87.18% | 81.79% | 89.53% | 90.87% |
| Schema | 98.97% | 95.80% | 100% | 99.28% |
| Selection | 95.06% | 91.95% | 98.87% | 96.86% |
| Document state feature | 96.80% | 92.38% | 98.16% | 99.07% |
| DOM/Yjs document | 91.17% | 86.96% | 96.83% | 95.47% |

Repair tests found a relocation defect: inserting before removing the original
entry could cancel the move. Repair now removes the original entry first. Tests
cover both directions, retained element/text identity, and repeated repair.

Drop-caret tests found retained widget capture after blurring only the widget
host. `selectDropRange` now reuses the existing focus helper to release shadow
focus before placing the caret. The focused Chromium regression passes:

```sh
npm run test:native-browser -- --filter='selection feature treats custom element as atomic'
```

The sixth batch adds four Vitest cases: transparent content reaching a parent
without a content rule, nested-open widget focus during drop placement, peer
awareness selection resolution, and refusal of a second pending HTML edit.
The native regression also checks closed, nested-open, and nested-closed shadow
focus, including the actual focused control and final caret endpoint. Closed
shadow focus is checked in Chromium because that case hangs in the DOM emulator.

The sixth-batch retry passed all 5,036 tests in the 120 persistent suites using
`--testTimeout=20000`. The overall invocation failed because concurrent work
created a temporary `src/ai-provider.activation-race.tmp.test.ts` that disappeared
before Vitest loaded it. The first invocation had two five-second timeouts in
unrelated math/slides cases; both passed in isolation and in the retry. No new
clean coverage report was produced, so the table and global thresholds above
remain the previous baseline. Re-measure once the shared workspace is stable.

For development, run the nearest test files without coverage. A partial suite
does not satisfy the global coverage thresholds:

```sh
npx vitest run src/schema.test.ts src/features/selection.test.ts src/domdoc.test.ts src/features/state.test.ts
```

Use uncovered branch outcomes to identify missing behaviors, and assert their
observable DOM, selection, collaboration, and cleanup contracts. Generated cases
must be bounded and deterministic, with expected results independent of the
implementation. Preserve small regression cases when a sequence finds a bug.

Native-browser suites validate platform editing and geometry separately; their
execution is not included in this Vitest report. See `native-browser.md` for the
existing loopback-only runner and cross-browser validation scope.

## Next focused batches

- Schema: audit expression sequence skipping and transparent rules without a
  concrete parent rule for reachable public inputs; function coverage is complete.
- Selection: cover remaining atomic endpoint transitions using native fixtures
  where platform behavior matters. Closed/nested widget drop focus is covered.
  Scrolling now covers
  nested offsets, both RTL limits, equal-distance choices, vertical clamping, and
  skipped overflow ancestors.
- Document state: audit remaining review target-path restoration outcomes and
  defensive guards. Lock ownership, capture/element/range reads, HTML fallback
  paths, synchronization failure cleanup, widget self-removal rollback, review
  pulse expiry, selection clearing, peer awareness selections, second pending-edit
  refusal, and duplicate provider sync are covered.

Recheck the full report before each batch: other suites contribute coverage to
these modules. Keep unreachable defensive branches visible; do not manufacture
invalid private state or exclude runtime code just to reach 100%.
