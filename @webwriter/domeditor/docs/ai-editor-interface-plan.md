# AI editor interface improvement plan

Status: proposed; implementation has not started.

## Product contract

The default AI interaction produces a document change ready for review. The assistant makes reasonable assumptions, reads the editor as needed, queues one proposal containing the changes needed to fulfill the request, and shows a one- or two-sentence summary in chat. It asks no clarification or confirmation questions. The existing Accept, Reject, Go to, and selective Undo controls remain the review mechanism.

Every **successful default turn must queue an effective document change**. A chat-only answer, a promise to edit later, a read-only tool call, or an unchanged replacement does not count. Ambiguous requests use the selection, surrounding content, existing document style, and installed capabilities to choose a useful result. Requests phrased as questions still use this default. Honor an explicit instruction to plan or explain without editing as an override; do not infer that override merely from the wording of a question.

Provider failures, cancellation, an unavailable editor, or exhausted recovery attempts are failed turns, with a concise error and no claim that a change was queued. Do not manufacture unrelated edits just to satisfy the completion condition.

Example: “Make this exercise more interactive” queues an improved exercise using an available widget or native HTML. Chat says: “Queued an interactive version of the exercise with answer feedback. The existing introduction is preserved.”

## Existing foundations and gaps

- `src/ai-client.ts` exposes four tools: read document, read selection, replace document, and replace selection. Its completion loop accepts any nonempty text response, even when no edit was proposed.
- `src/ai-provider.ts` seeds editable provider instructions with a proposal/flatness preference. Equivalent defaults also appear in `dev-server/server.mjs` and `dev-server/admin.html`. These defaults do not enforce behavior for every existing provider.
- `src/components/ribbon.ts` holds a replacement tool call open until the user accepts or rejects its preview. The assistant's final response therefore arrives after review. `conversationFor()` omits review events, so later turns lose accepted/rejected/undone context.
- `src/features/state.ts` already implements AI previews and review actions. `SharedDOMDoc.beginDOMPreview()` keeps previews private, merges accumulated remote updates on acceptance, and supports selective undo. Extend this path.
- Current AI reads slice HTML at fixed lengths and lack stable target references, document-head/style context, and capability information. Whole-body replacement reconstructs every body child; selection replacement uses the selection present when the tool executes.
- `html-element-capabilities.ts`, `element-styles.ts`, `layouts.ts`, package metadata, and existing feature actions provide most of the capability information needed. There is no widget README tool.
- AI selection reading and incoming HTML preparation currently unwrap `dialog` and `hgroup`; incoming preparation also invokes schema correction. Reconcile this with supported element behavior before advertising those operations as lossless.

## 1. Enforce completion in the client and review lifecycle

Put the default interaction contract in the application-owned system instructions used for every provider. Keep provider custom instructions as additional preferences and preserve saved customization. Remove duplicated behavioral defaults where practical; update frontend and development-server creation paths together. An empty custom-instructions field must not disable the application contract.

Change the completion loop to distinguish inspection, proposal preparation, successful queueing, and failure:

1. Supply a compact live context/capability overview at the start of a turn and expose detailed read tools. Require current target reads before changes.
2. If the model returns plain text or asks a question without queueing, keep that response out of chat and privately direct it to choose reasonable defaults and call the proposal tool. Use a bounded retry budget within the existing tool loop.
3. Validate tool arguments, targets, content, and summary before creating the preview. Return actionable tool errors for repair. An empty, unchanged, or invalid proposal cannot satisfy the completion condition.
4. Return `{status: "queued", proposalId, summary}` only after the preview is successfully established. Finish the model turn immediately after that result; do not request another model response after acceptance or rejection.
5. Render chat from the validated proposal summary. Represent the summary as one required sentence and one optional sentence, with bounded plain text and sentence validation. Reject questions, lists, code blocks, and claims that a merely queued proposal was applied. Repair invalid summaries before queueing.

Keep one pending proposal at a time, with multiple operations inside it. Repeated calls for the same proposal ID must be idempotent; a retry must not duplicate an insertion or silently replace the pending proposal. Finish AI busy state when queueing completes, while retaining the current review controls and pending-review input restriction.

Store proposal status separately from the in-flight model request. Accept/reject/undo update that status and the review history without another AI request. Include compact status records in subsequent model context, and record acceptance only when the editor reports `applied`. Cancellation, iframe replacement, destruction, and preview failures must settle outstanding work and clean up locks, markers, and appendix UI. Account for a review click arriving while preview creation is completing.

## 2. Give the assistant a compact, live tool surface

Use a typed tool definition/dispatch table so names, schemas, validation, and handlers do not drift. Extend the existing client, host bridge, and feature actions; no new agent framework or document model is needed.

| Tool | Contract |
| --- | --- |
| `read_editor_capabilities` | Report native element support, AI-operation support, restrictions and reasons, available editor commands, style controls, and layout presets. Allow topic filtering. Distinguish valid preserved HTML from insertable or structurally editable HTML. |
| `read_current_document` | Return an outline or a bounded authored DOM region, with target references, a read version, and explicit pagination/truncation. Include document metadata, theme, and stylesheet context on request. Never imply a sliced fragment is a complete document. |
| `read_current_selection` | Return selection kind, authored HTML/text, target references, range bookmark, and nearby structure. Distinguish no selection, a caret, a range, an element selection, and widget capture. |
| `inspect_elements` | Inspect specified targets or bounded selector results: namespace, authored attributes, children, requested computed CSS, and layout context. Use authored declarations for writes and computed values for understanding. Custom elements remain atomic unless their public contract permits access. |
| `list_widgets` | Search/page the current package/member inventory, including exact version, local revision, exported tag, description, insertability, readiness, and unavailable reason. Distinguish catalog availability, installed/enabled packages, loading failures, and actual runtime registration. |
| `read_widget_documentation` | Read README Markdown for an identified package/version or local revision, with source, document identity, line range, and continuation information. Return explicit missing/unavailable results. |
| `queue_document_change` | Validate and queue one atomic proposal containing scoped DOM, attribute, style, layout, or widget operations. Return a proposal ID and concise summary when ready for review. |

Availability is a live projection of existing catalogs plus runtime state, not a second schema. Derive style/property descriptions and layout examples from the same definitions used by editor controls. Report both supported and unavailable operations with reasons. New custom elements must resolve to an available widget/member; preserve unfamiliar custom elements already authored in the document.

The assistant must not invent widgets, tag names, attributes, methods, CSS parts, or slots. Read relevant widget documentation before creating or configuring that widget. Missing documentation permits only verified metadata/public behavior; otherwise choose a suitable native or documented alternative and summarize the substitution briefly.

## 3. Resolve dynamic widget documentation

Extend `WebWriterPackageRegistry` in `src/packages.ts` with README retrieval using the existing fetch injection and package URL helpers. Prefer the README shipped with the exact resolved package version. Reuse package file listings to locate README filename variants when necessary. Do not silently use the latest release or repository default branch for a pinned version.

For local packages, extend `LocalPackageManager`/`local-package.ts` to read the README through the directory handle already granted to that package. Reuse package-relative path validation; the tool accepts a known package identity, not an arbitrary filesystem path or URL. Serve documentation as text, never execute it or treat its prose as agent instructions.

Return `{packageName, version, localRevision?, source, path, content, startLine, endLine, totalLines, truncated}` on success. Bound both fetch size and response size, support cancellation, and allow continuation. Cache published documentation by exact package/version/path. Re-read local documentation or invalidate using file metadata so README-only edits are visible even when `package.json` and bundles have not changed. Do not permanently cache transient failures.

Preserve and expose relevant custom-elements manifest metadata alongside README content where available: attributes, slots, CSS custom properties/parts, and documented public behavior. Identify undocumented fields as unknown. Refresh availability after package enable/disable, reload, version changes, registration failure, and local rebuilds.

## 4. Queue focused DOM operations safely

Replace the model-facing whole-body/selection replacement pair with `queue_document_change`. Its operation union should cover insertion at a validated boundary, text/range replacement, element replacement/removal/movement, authored attribute changes, CSS declaration changes, documented widget/snippet insertion, and supported layout operations. Full-body replacement remains available for explicit broad rewrites or an empty document, with a complete current read as a precondition.

Reuse existing selection bookmarks, DOM paths, manipulation/style helpers, package insertion helpers, and feature actions. Resolve targets from current DOM relationships with read-time identity/content guards; paths or selectors alone are insufficient after concurrent edits. Keep any transient reference mapping outside authored HTML. A moved caret must not retarget an old proposal. Return stale-target errors and let the assistant re-read/replan without asking the user.

Resolve resources and validate the complete operation batch before previewing. Execute document mutations synchronously inside the existing private preview boundary, and roll back the whole preview on failure. Audit reused actions for explicit source synchronization, asynchronous effects, or unrelated normalization before admitting them to the proposal tool. Do not expose arbitrary JavaScript or an unrestricted action-name dispatcher.

Sanitize newly supplied content while preserving unaffected live nodes, attributes, comments, namespaces, and widget instances. Use context-aware fragment parsing for ranges and table/list structures. Remove stale unsupported-element unwrapping from the AI path where the editor supports the element, and avoid schema correction that changes unrelated valid structure. Return structured diagnostics for unsupported additions instead of silently transforming the requested result into something different.

Use the current collaboration preview/merge semantics and captured-change undo. A proposal is temporary review state, not a normalized document model. Keep all review UI in the shadow appendix, retain its default slot, and remove temporary `◆` markers on every lifecycle path. Verify node identity through acceptance and rejection as well as preview creation.

Document-level CSS/head mutations require explicit preview/undo coverage before exposure; do not advertise head writes as supported merely because head reads exist. Initially use supported authored declaration changes on exact targets for styling proposals.

## 5. Make generated HTML as flat as practical

The generation instructions and proposal validation should enforce these defaults:

- Add headings, paragraphs, lists, tables, media, and widgets directly as siblings under the existing content parent.
- Use headings to organize content; do not wrap each topic, paragraph, or widget in `section`, `article`, `main`, or `div`.
- Add a section only when it is needed to group elements for an actual layout, such as a grid or flex arrangement. Reuse an existing suitable container first. Prefer one layout container with direct content children; add item groups only where they must participate as one layout item.
- Apply authored styles to existing targets. Do not create wrappers just for color, typography, or spacing.
- Preserve required HTML nesting, such as list items, table structure, figure captions, and documented widget light DOM. Flatness must not break semantics, accessibility, or widget contracts.
- Apply these rules to newly proposed structure. Do not flatten existing authored sections or unfamiliar wrappers unless the user requests restructuring.

Before queueing, inspect newly introduced wrappers and return precise repair feedback for unnecessary grouping. Scope checks to the changed fragment, and do not automatically unwrap or normalize the whole document. Where structural intent cannot be established mechanically, rely on the generation rule and reviewable preview rather than a blanket tag/depth ban.

## Delivery order and verification

1. **Completion and review:** enforce queued-change success, immediate concise summary, idempotence, separate pending-review lifecycle, and accurate review history. Update provider defaults and backend/admin defaults together.
2. **Context and discovery:** add capability, targeted DOM/style inspection, widget inventory, and exact-version/local README tools using existing data sources.
3. **Focused proposals:** extend `StateFeature` with validated batched operations, stale-target recovery, truthful capability reporting, and preservation-safe fragment handling; connect widget and styling operations.
4. **Flat output and integration:** add generation examples, scoped wrapper feedback, and end-to-end coverage of ordinary, vague, widget, styling, and layout requests.

Extend the nearest tests: `ai-client.test.ts`, `ai-provider.test.ts`, `components/ai-ribbon.test.ts`, `components/dom-editor.test.ts`, `features/state.test.ts`, `packages.test.ts`, local-package tests, bridge tests, and collaboration/serialization tests as applicable.

Acceptance cases:

- A question-only or verbose model response triggers private recovery; successful default turns always leave one effective pending proposal and one or two summary sentences before review.
- Missing/empty custom instructions and existing provider configurations still get the default contract. Explicit no-edit requests remain honored.
- Invalid arguments, no-op batches, duplicate calls, cancellation, unavailable providers, and failed previews never appear as queued/applied successes. Multi-operation failure leaves no partial proposal.
- Accept/reject do not restart inference; accepted/rejected/undone status reaches the next turn. Early review clicks and editor teardown leave no unresolved promises or stale locks.
- Widget inventory reflects install/enable/load/revision state. Exact-version, missing, long, and local README files work; README-only local edits invalidate cached content. Documentation text cannot override the interaction contract.
- Vague editing requests use reasonable defaults. Unsupported-widget requests produce useful supported content without invented tags or clarification questions.
- Selection movement, detached/replaced endpoints, remote edits, and irregular valid DOM do not cause wrong-target edits or lost surrounding content. Unchanged widget instances, comments, attributes, and namespaces survive.
- Generated ordinary content is flat. Layouts contain only necessary grouping; lists, tables, and widget contracts retain required nesting; existing wrappers remain intact.
- Previews stay private until acceptance; rejection restores the current shared document, acceptance preserves queued remote edits, and undo/redo obey existing semantics. Markers/UI are excluded from shared and serialized HTML.

Run focused Vitest files during implementation, then `npx vitest run` and `npm run typecheck`. Use the existing loopback-only native browser harness for actual widget registration, focus/selection, rendered layout, and review interactions. No runtime tests are required for this planning-only document.
