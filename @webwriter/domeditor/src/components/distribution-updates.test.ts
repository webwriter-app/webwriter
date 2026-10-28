// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DomEditor} from "./dom-editor"
import {DistributionControls} from "./distribution-controls"
import {emptyDistributionConfig, type DistributionConfig} from "../distribution.js"
import type {DistributionSelection} from "../features/distribution"

const state = (): DistributionSelection => {
  const config = emptyDistributionConfig("document")
  return {target: "document", path: null, identity: "element-document", local: config, effective: config, inheritedFrom: null}
}
const change = (config: DistributionConfig) => new CustomEvent("distribution-config-change", {
  detail: {target: "document", general: true, config},
})
const tick = async () => { await Promise.resolve(); await Promise.resolve() }

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })

describe("distribution updates", () => {
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
