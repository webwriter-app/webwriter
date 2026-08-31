// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import type {DOMEditor} from "../domeditor"
import {EditorFeature, type DocumentListenerMap} from "."

class ListenerProbeFeature extends EditorFeature {
  calls: string[] = []
  private readonly sharedListener = (event: Event) => this.calls.push(event.type)
  activeListeners = {
    click: this.sharedListener,
    keydown: this.sharedListener,
  } as DocumentListenerMap
}

describe("EditorFeature listener lifecycle", () => {
  it("tracks a shared callback independently for every event type", () => {
    const feature = new ListenerProbeFeature({} as DOMEditor)
    feature.enable()
    feature.enable()

    document.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true}))
    expect(feature.calls).toEqual(["click", "keydown"])

    feature.disable()
    feature.disable()
    document.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    document.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true}))
    expect(feature.calls).toEqual(["click", "keydown"])
  })
})
