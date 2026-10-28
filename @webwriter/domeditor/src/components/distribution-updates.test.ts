// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DomEditor} from "./dom-editor"
import {DistributionControls} from "./distribution-controls"
import {emptyDistributionConfig, type DistributionConfig} from "../distribution.js"
import type {DistributionSelection} from "../features/distribution"
import {ribbonInsertionDragType} from "./insertion-menu"

const state = (): DistributionSelection => {
  const config = emptyDistributionConfig("document")
  return {target: "document", path: null, identity: "element-document", local: config, effective: config, inheritedFrom: null}
}
const change = (config: DistributionConfig) => new CustomEvent("distribution-config-change", {
  detail: {target: "document", general: true, config},
})
const tick = async () => { await Promise.resolve(); await Promise.resolve() }

afterEach(() => { document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks() })

describe("distribution updates", () => {
  it("publishes ribbon drag activity from dragstart until dragend", () => {
    const host = new DomEditor() as any
    const data = new DataTransfer()
    data.setData(ribbonInsertionDragType, "element:p")
    host.handleRibbonDragStart(Object.assign(new Event("dragstart"), {dataTransfer: data}))
    expect(host.ribbonDrag).toEqual({[ribbonInsertionDragType]: "element:p"})
    host.handleRibbonDragEnd()
    expect(host.ribbonDrag).toBeNull()
  })

  const drop = (detail: Record<string, unknown>) => new CustomEvent("distribution-insert-drop", {
    detail: {target: "document", general: true, ...detail},
  })
  const dropHost = () => {
    const host = new DomEditor() as any
    host.settings = {...host.settings, userSnippets: []}
    host.distributionGeneral = host.projectDistributionState(state())
    const execute = vi.spyOn(host, "execute").mockImplementation(async (command: any) => {
      if(command.type === "setDistributionConfig") {
        host.distributionGeneral = host.projectDistributionState({...state(), local: command.config, effective: command.config})
        return true
      }
      return null
    })
    return {host, execute}
  }

  it.each(["element:p", "package-member:sample/widget", "user-snippet:quote"])("enables Insert and adds the exact %s recipe without duplicates", async id => {
    const {host, execute} = dropHost()
    const item = {id, label: "Choice", html: "<p>template</p>"}
    host.distributionItems = [item]
    await host.handleDistributionInsertDrop(drop({action: id}))
    await host.handleDistributionInsertDrop(drop({action: id}))
    expect(execute).toHaveBeenCalledTimes(2)
    expect(host.distributionGeneral.local).toMatchObject({permissions: ["insert"], add: [id], items: [item]})
  })

  it("can drop a builtin while the insertion catalog is still loading", async () => {
    const {host, execute} = dropHost()
    const item = {id: "element:p", label: "Paragraph", html: "<p></p>"}
    host.distributionPending = true
    const original = execute.getMockImplementation()! as (command: any) => Promise<any>
    execute.mockImplementation(async (command: any) => command.type === "getDistributionInsertionItems" ? [item] : original(command))
    await host.handleDistributionInsertDrop(drop({action: item.id}))
    expect(host.distributionGeneral.local.items).toEqual([item])
    expect(host.distributionGeneral.local.permissions).toEqual(["insert"])
  })

  it("creates a complete local policy from inherited settings when dropping onto selection permissions", async () => {
    const {host, execute} = dropHost()
    const inherited = {...state().local!, target: "outer", scope: "group", groupSize: 4, permissions: ["edit"]}
    host.distributionSelection = {...state(), target: "child", identity: "element-child", path: [0], local: null, effective: inherited, inheritedFrom: "outer"}
    const item = {id: "element:p", label: "Paragraph", html: "<p></p>"}
    host.distributionItems = [item]
    await host.handleDistributionInsertDrop(drop({target: "child", general: false, action: item.id}))
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({type: "setDistributionConfig", identity: "element-child", path: [0],
      config: expect.objectContaining({target: "child", scope: "group", groupSize: 4, permissions: ["edit", "insert"], add: [item.id], items: [item]})}))
  })

  it("saves dragged editor content as a personal snippet and reuses it on another drop", async () => {
    const {host, execute} = dropHost()
    const snippet = {label: "Reusable section", html: "<section><!--keep--><demo-widget>value</demo-widget></section>"}
    const original = execute.getMockImplementation()! as (command: any) => Promise<any>
    execute.mockImplementation(async (command: any) => command.type === "getDraggedSnippet" ? snippet : original(command))
    await host.handleDistributionInsertDrop(drop({token: "trusted-drag"}))
    await host.handleDistributionInsertDrop(drop({token: "second-drag"}))
    expect(host.settings.userSnippets).toHaveLength(1)
    const saved = host.settings.userSnippets[0]
    expect(saved).toMatchObject(snippet)
    expect(host.distributionGeneral.local).toMatchObject({permissions: ["insert"], add: [`user-snippet:${saved.id}`],
      items: [{id: `user-snippet:${saved.id}`, ...snippet}]})
    expect(localStorage.length).toBeGreaterThan(0)
  })

  it("preserves intervening permission changes while resolving an editor drag", async () => {
    const {host, execute} = dropHost()
    let finish!: (value: unknown) => void
    const original = execute.getMockImplementation()! as (command: any) => Promise<any>
    execute.mockImplementation((command: any) => command.type === "getDraggedSnippet" ? new Promise(resolve => { finish = resolve }) : original(command))
    const pending = host.handleDistributionInsertDrop(drop({token: "token"}))
    host.distributionGeneral = host.projectDistributionState({...state(), local: {...state().local!, permissions: ["edit"]}})
    finish({html: "<p>content</p>", label: "Content"})
    await pending
    expect(host.distributionGeneral.local.permissions).toEqual(["edit", "insert"])
  })

  it("ignores a stale target and does not save a snippet when a policy write fails", async () => {
    const {host, execute} = dropHost()
    execute.mockImplementation(async (command: any) => command.type === "getDraggedSnippet" ? {html: "<p>content</p>", label: "Content"} : false)
    await host.handleDistributionInsertDrop(drop({target: "stale", token: "token"}))
    expect(execute).not.toHaveBeenCalled()
    await host.handleDistributionInsertDrop(drop({token: "token"}))
    expect(host.settings.userSnippets).toEqual([])
    expect(host.distributionGeneral.local.permissions).toEqual([])
  })

  it("abandons an asynchronous drop when the selection changes", async () => {
    const {host, execute} = dropHost()
    let finish!: (value: unknown) => void
    execute.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = host.handleDistributionInsertDrop(drop({token: "token"}))
    host.distributionGeneral = {...state(), identity: "new-document"}
    finish({html: "<p>content</p>", label: "Content"})
    await pending
    expect(execute).toHaveBeenCalledTimes(1)
    expect(host.settings.userSnippets).toEqual([])
  })

  it("resolves a package drag to a specific member and saves its policy before installing", async () => {
    const {host, execute} = dropHost()
    const member = {id: "widget", label: "Widget", insertable: true, kind: "widget", tagName: "sample-widget", packageName: "sample"}
    const pkg = {name: "sample", members: [member]}
    host.packages = [pkg]
    const install = vi.spyOn(host, "setPackageInstalled").mockImplementation(async () => {
      expect(execute).toHaveBeenCalledWith(expect.objectContaining({type: "setDistributionConfig"}))
      return pkg
    })
    await host.handleDistributionInsertDrop(drop({action: "package:sample"}))
    expect(host.distributionGeneral.local.permissions).toEqual(["insert"])
    expect(host.distributionGeneral.local.items[0].html).toBe("<sample-widget></sample-widget>")
    expect(install).toHaveBeenCalledWith(pkg, true)
  })

  it("keeps the permission cards checked and enabled while the frame saves", async () => {
    const host = new DomEditor() as any
    const initial = state()
    host.distributionGeneral = host.projectDistributionState(initial)
    let finish!: (value: boolean) => void
    vi.spyOn(host, "execute").mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve }))
    const controls = new DistributionControls()
    controls.general = true; controls.state = initial
    document.body.append(controls)
    await controls.updateComplete
    const card = controls.shadowRoot!.querySelector(".permission")!
    const checkbox = card.querySelector<HTMLInputElement>("input")!
    controls.addEventListener("distribution-config-change", event => {
      host.handleDistributionConfigChange(event)
      controls.state = host.distributionGeneral
      controls.pending = host.distributionPending
    })
    checkbox.click()
    await controls.updateComplete
    await tick()
    expect(controls.shadowRoot!.querySelector(".permission")).toBe(card)
    expect(card.querySelector("input")).toBe(checkbox)
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(false)
    expect(host.distributionPending).toBe(false)
    const committed = {...initial, local: host.distributionGeneral.local, effective: host.distributionGeneral.local}
    host.distributionGeneral = host.projectDistributionState(committed)
    finish(true)
    await host.distributionWriteQueue
    controls.state = host.distributionGeneral
    await controls.updateComplete
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(false)
  })

  it("serializes rapid toggles and keeps newer choices through an older acknowledgement", async () => {
    const host = new DomEditor() as any
    const initial = state()
    host.distributionGeneral = host.projectDistributionState(initial)
    const pending: ((value: boolean) => void)[] = []
    const execute = vi.spyOn(host, "execute").mockImplementation(() => new Promise<boolean>(resolve => pending.push(resolve)))
    const edit = {...initial.local!, permissions: ["edit"] as DistributionConfig["permissions"]}
    const move = {...edit, permissions: ["edit", "move"] as DistributionConfig["permissions"]}
    host.handleDistributionConfigChange(change(edit))
    host.handleDistributionConfigChange(change(move))
    await tick()
    expect(execute).toHaveBeenCalledTimes(1)
    host.distributionGeneral = host.projectDistributionState({...initial, local: edit, effective: edit})
    expect(host.distributionGeneral.local.permissions).toEqual(["edit", "move"])
    pending[0](true)
    await tick()
    expect(execute).toHaveBeenCalledTimes(2)
    host.distributionGeneral = host.projectDistributionState({...initial, local: move, effective: move})
    pending[1](true)
    await host.distributionWriteQueue
    expect(host.distributionGeneral.local.permissions).toEqual(["edit", "move"])
  })

  it("restores the accepted configuration and reports a failed write", async () => {
    const host = new DomEditor() as any
    const initial = state()
    host.distributionGeneral = host.projectDistributionState(initial)
    vi.spyOn(host, "execute").mockRejectedValue(new Error("Disconnected"))
    host.handleDistributionConfigChange(change({...initial.local!, permissions: ["edit"]}))
    await host.distributionWriteQueue
    expect(host.distributionGeneral.local.permissions).toEqual([])
    expect(host.distributionGeneral.error).toBe("Disconnected")
    expect(host.distributionPending).toBe(false)
  })
})
