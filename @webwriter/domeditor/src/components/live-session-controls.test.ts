// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {LiveSessionControls} from "./live-session-controls"

afterEach(() => document.body.replaceChildren())

async function mountControls() {
  const controls = new LiveSessionControls()
  document.body.append(controls)
  await controls.updateComplete
  return controls
}

describe("live session controls", () => {
  it("renders a time scrubber, running time, and PREVIEW without a stop button", async () => {
    const controls = await mountControls()
    controls.playing = true
    controls.currentTime = 65
    controls.duration = 65
    await controls.updateComplete

    const buttons = controls.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")
    const range = controls.shadowRoot!.querySelector<HTMLInputElement>("input[type=range]")!
    expect(buttons).toHaveLength(1)
    expect(buttons[0].getAttribute("aria-label")).toBe("Pause")
    expect(range.min).toBe("0")
    expect(range.max).toBe("1")
    expect(range.value).toBe("1")
    expect(range.getAttribute("aria-valuetext")).toBe("01:05 of 01:05")
    expect(controls.shadowRoot!.querySelector(".time")?.textContent).toBe("01:05")
    expect(controls.shadowRoot!.querySelector(".status")?.textContent).toBe("PREVIEW")
  })

  it("pins the scrubber exactly to the edge as the timeline grows between whole seconds", async () => {
    const controls = await mountControls()
    for(const time of [0, 0.027, 0.103, 1.297, 2.001, 60.048]) {
      controls.currentTime = time
      controls.duration = time
      await controls.updateComplete
      const range = controls.shadowRoot!.querySelector<HTMLInputElement>("input[type=range]")!
      expect(range.value).toBe(range.max)
      expect(range.step).toBe("any")
    }
  })

  it("dispatches bubbling composed playback, pause, and time seek events", async () => {
    const controls = await mountControls()
    controls.duration = 8
    await controls.updateComplete
    const events: Array<{type: string, time?: number}> = []
    const controller = new AbortController()
    for(const type of ["live-session-play", "live-session-pause", "live-session-seek"]) {
      document.body.addEventListener(type, event => {
        events.push({type: event.type, ...((event as CustomEvent).detail ?? {})})
      }, {signal: controller.signal})
    }
    controls.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    controls.playing = true
    await controls.updateComplete
    controls.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    const range = controls.shadowRoot!.querySelector<HTMLInputElement>("input[type=range]")!
    range.value = "0.4375"
    range.dispatchEvent(new Event("input", {bubbles: true}))
    expect(events).toEqual([
      {type: "live-session-play"},
      {type: "live-session-pause"},
      {type: "live-session-seek", time: 3.5},
    ])
    controller.abort()
  })

  it("keeps LIVE visible when rewound and clamps invalid times", async () => {
    const controls = await mountControls()
    controls.currentTime = 2
    controls.duration = 5
    controls.live = true
    await controls.updateComplete
    expect(controls.shadowRoot!.querySelector(".status")?.textContent).toBe("LIVE")
    const range = controls.shadowRoot!.querySelector<HTMLInputElement>("input[type=range]")!
    expect(range.value).toBe("0.4")
    controls.currentTime = 9
    await controls.updateComplete
    expect(range.value).toBe("1")
    controls.duration = NaN
    await controls.updateComplete
    expect(range.value).toBe("1")
    expect(controls.shadowRoot!.querySelector(".time")?.textContent).toBe("00:00")
  })
})
