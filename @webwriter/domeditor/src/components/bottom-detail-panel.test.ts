// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {emptyVersionHistoryState} from "../editor-bridge"
import {BottomDetailPanel} from "./bottom-detail-panel"
import {PackageSearch} from "./package-search"

afterEach(() => document.body.replaceChildren())

describe("Bottom detail panel", () => {
  it("renders local package checks and test results, and dispatches test runs", async () => {
    const panel = new BottomDetailPanel()
    panel.mode = "checks"
    panel.localPackages = [{
      name: "@local/demo", version: "1.0.0", label: "Demo", description: "", authors: [], keywords: [], links: {},
      members: [], scripts: [], styles: [], manifest: {name: "@local/demo", version: "1.0.0", exports: {}},
      tests: [{name: "basics", scriptUrl: "https://example.test/test.js"}],
    }]
    panel.localPackageWarnings = {"@local/demo": []}
    panel.localPackageTestResults = {"@local/demo/basics": {status: "passed", tests: [{id: "works", path: ["demo"], passed: true}]}}
    document.body.append(panel)
    await panel.updateComplete
    const root = panel.shadowRoot!
    expect(root.querySelectorAll('.develop-check[data-status="passed"]').length).toBeGreaterThan(0)
    expect(root.querySelector('.develop-test[data-status="passed"]')).not.toBeNull()
    expect(root.querySelector('[role="status"]')?.textContent).toContain("1/1 passed")
    const run = vi.fn()
    panel.addEventListener("local-package-test-run", run)
    root.querySelector<HTMLButtonElement>('[aria-label="Run test basics"]')!.click()
    expect(run).toHaveBeenCalledWith(expect.objectContaining({detail: {name: "basics"}}))
  })

  it("shows pending checks until inspected and exposes package selection", async () => {
    const panel = new BottomDetailPanel()
    panel.mode = "checks"
    panel.localPackages = [{name: "@local/demo", version: "1.0.0", label: "Demo", description: "", authors: [], keywords: [], links: {}, members: [], scripts: [], styles: []}]
    document.body.append(panel)
    await panel.updateComplete
    const root = panel.shadowRoot!
    expect(root.querySelector('.develop-check[data-status="pending"]')).not.toBeNull()
    const selected = vi.fn()
    panel.addEventListener("ribbon-button-click", selected)
    root.querySelector<HTMLButtonElement>(".local-package-item")!.click()
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({detail: {label: "local-package-select:@local/demo"}}))
  })

  it("retains the versions list, changes, restore, and preview-clear behavior", async () => {
    const panel = new BottomDetailPanel()
    panel.mode = "versions"
    const user = {clientId: 7, name: "Ada", initials: "AD", color: "#64748b"}
    const initial = {id: "initial", timestamp: 0, label: "Document created", user, changes: {added: 0, removed: 0, modified: 0}, commentCount: 0}
    const first = {...initial, id: "first", timestamp: 1, label: "Edited by Ada", changes: {added: 2, removed: 1, modified: 3}}
    panel.historyState = {...emptyVersionHistoryState(), checkpoints: [first, initial], versions: [{...first, user: {clientId: 8, name: "Grace", initials: "GH", color: "#64748b"}, id: "v1", checkpointIds: [first.id, initial.id], isUnsaved: false, isCurrent: true}], currentCheckpointId: initial.id}
    document.body.append(panel)
    await panel.updateComplete
    const root = panel.shadowRoot!
    expect(root.querySelectorAll(".history-version-card")).toHaveLength(1)
    expect(root.querySelectorAll(".history-change-card")).toHaveLength(1)
    const select = vi.fn(), revert = vi.fn(), clear = vi.fn()
    panel.addEventListener("history-checkpoint-select", select)
    panel.addEventListener("history-revert", revert)
    panel.addEventListener("history-preview-clear", clear)
    root.querySelector<HTMLButtonElement>('.history-checkpoint[data-checkpoint-id="first"]')!.click()
    root.querySelector<HTMLButtonElement>('.history-card-restore-button[data-checkpoint-id="first"]')!.click()
    panel.historyState = {...panel.historyState, preview: {checkpointId: "first", html: "<p>preview</p>"} as never}
    await panel.updateComplete
    root.querySelector<HTMLButtonElement>(".history-preview-clear")!.click()
    expect(select).toHaveBeenCalledWith(expect.objectContaining({detail: {checkpointId: "first"}}))
    expect(revert).toHaveBeenCalledWith(expect.objectContaining({detail: {checkpointId: "first"}}))
    expect(clear).toHaveBeenCalledOnce()
  })
})

describe("Package search", () => {
  it("emits query changes and catalog refresh requests", async () => {
    const search = new PackageSearch()
    document.body.append(search)
    await search.updateComplete
    const changed = vi.fn(), refreshed = vi.fn()
    search.addEventListener("package-search-change", changed)
    search.addEventListener("package-catalog-request", refreshed)
    const input = search.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.value = "charts"
    input.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({detail: {query: "charts"}}))
    search.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Refresh list"]')!.click()
    expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({detail: {refresh: true}}))
  })
})
