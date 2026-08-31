// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import type {DOMEditor} from "../domeditor"
import {EditorFeature, type DocumentListenerMap} from "."

class ListenerProbeFeature extends EditorFeature {
  calls: string[] = []
  private readonly sharedListener = (event: Event) => this.calls.push(event.type)
  activeListeners = {
    beforeinput: this.sharedListener,
    click: this.sharedListener,
    compositionstart: this.sharedListener,
    input: this.sharedListener,
    keydown: this.sharedListener,
    keyup: this.sharedListener,
    paste: this.sharedListener,
  } as DocumentListenerMap
}

class CaptureOwnerProbeFeature extends ListenerProbeFeature {
  protected handlesCapturedElementInteractions = true
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

  it("routes editing input only to the capture owner while preserving pointer routing", () => {
    const editor = {
      features: {selection: {isCaptureSelection: true}},
    } as unknown as DOMEditor
    const ordinary = new ListenerProbeFeature(editor)
    const captureOwner = new CaptureOwnerProbeFeature(editor)
    ordinary.enable()
    captureOwner.enable()

    const editingEvents = [
      new InputEvent("beforeinput", {bubbles: true}),
      new CompositionEvent("compositionstart", {bubbles: true}),
      new InputEvent("input", {bubbles: true}),
      new KeyboardEvent("keydown", {bubbles: true}),
      new KeyboardEvent("keyup", {bubbles: true}),
      new Event("paste", {bubbles: true}),
    ]
    editingEvents.forEach(event => document.dispatchEvent(event))
    document.dispatchEvent(new MouseEvent("click", {bubbles: true}))

    expect(ordinary.calls).toEqual(["click"])
    expect(captureOwner.calls).toEqual([
      "beforeinput",
      "compositionstart",
      "input",
      "keydown",
      "keyup",
      "paste",
      "click",
    ])

    ordinary.disable()
    captureOwner.disable()
  })
})
