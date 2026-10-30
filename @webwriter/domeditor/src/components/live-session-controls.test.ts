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
  it("renders a time scrubber, viewing position, and Preview without a stop button", async () => {
    const controls = await mountControls()
    controls.playing = true
    controls.currentTime = 65
    controls.duration = 65
    await controls.updateComplete

    const buttons = controls.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")
    const range = controls.shadowRoot!.querySelector<HTMLInputElement>("input[type=range]")!
    expect(buttons).toHaveLength(2)
    expect(buttons[0].getAttribute("aria-label")).toBe("Pause playback")
    expect(buttons[1].textContent).toBe("Jump to latest")
    expect(buttons[1].disabled).toBe(true)
    expect(range.min).toBe("0")
    expect(range.max).toBe("1")
    expect(range.value).toBe("1")
    expect(range.getAttribute("aria-valuetext")).toBe("01:05 of 01:05")
    expect(controls.shadowRoot!.querySelector(".time")?.textContent).toBe("01:05")
    expect(controls.shadowRoot!.querySelector(".status")?.textContent).toBe("Preview")
    expect(controls.shadowRoot!.querySelector(".endpoint")?.textContent).toBe("Now")
    expect(controls.shadowRoot!.querySelector(".controls")!.firstElementChild)
      .toBe(controls.shadowRoot!.querySelector(".status"))
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
    for(const type of ["live-session-play", "live-session-pause", "live-session-seek", "live-session-return-to-live"]) {
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
    controls.playing = false
    await controls.updateComplete
    controls.shadowRoot!.querySelector<HTMLButtonElement>(".return")!.click()
    expect(events).toEqual([
      {type: "live-session-play"},
      {type: "live-session-pause"},
      {type: "live-session-seek", time: 3.5},
      {type: "live-session-return-to-live"},
    ])
    controller.abort()
  })

  it("distinguishes watching live, paused, and replaying and clamps invalid times", async () => {
    const controls = await mountControls()
    controls.currentTime = 2
    controls.duration = 5
    controls.live = true
    await controls.updateComplete
    expect(controls.shadowRoot!.querySelector(".status")?.textContent).toBe("Paused")
    expect(controls.shadowRoot!.querySelector(".lag")?.textContent).toBe("00:03 behind")
    expect(controls.shadowRoot!.querySelector(".return")?.textContent).toBe("Return to live")
    expect(controls.shadowRoot!.querySelector(".controls")!.firstElementChild)
      .toBe(controls.shadowRoot!.querySelector(".status"))
    const range = controls.shadowRoot!.querySelector<HTMLInputElement>("input[type=range]")!
    expect(range.value).toBe("0.4")
    expect(range.style.getPropertyValue("--position")).toBe("40%")
    controls.playing = true
    await controls.updateComplete
    expect(controls.shadowRoot!.querySelector(".status")?.textContent).toBe("Replaying")
    controls.currentTime = 9
    await controls.updateComplete
    expect(range.value).toBe("1")
    expect(controls.shadowRoot!.querySelector(".status")?.textContent).toBe("Watching live")
    controls.duration = NaN
    await controls.updateComplete
    expect(range.value).toBe("1")
    expect(controls.shadowRoot!.querySelector(".time")?.textContent).toBe("00:00")
  })

  it("holds the paused scale and seek mapping while new activity arrives", async () => {
    const controls = await mountControls()
    Object.assign(controls, {live: true, playing: true, currentTime: 18, duration: 30})
    await controls.updateComplete
    controls.playing = false
    await controls.updateComplete
    controls.duration = 42
    await controls.updateComplete
    const range = controls.shadowRoot!.querySelector<HTMLInputElement>("input[type=range]")!
    expect(range.value).toBe("0.6")
    expect(range.style.getPropertyValue("--position")).toBe("60%")
    expect(controls.shadowRoot!.querySelector(".time")?.textContent).toBe("00:18")
    expect(controls.shadowRoot!.querySelector(".endpoint")?.textContent).toBe("00:30")
    expect(controls.shadowRoot!.querySelector(".lag")?.textContent).toBe("00:24 behind")
    expect(range.getAttribute("aria-valuetext")).toBe("00:18 of 00:30 shown; latest 00:42")
    const seeks: number[] = []
    controls.addEventListener("live-session-seek", event => seeks.push((event as CustomEvent).detail.time))
    range.value = "0.5"
    range.dispatchEvent(new Event("input"))
    expect(seeks).toEqual([15])
    controls.currentTime = 15
    await controls.updateComplete
    expect(range.value).toBe("0.5")
    controls.playing = true
    await controls.updateComplete
    expect(Number(range.value)).toBeCloseTo(15 / 42)
    expect(controls.shadowRoot!.querySelector(".endpoint")?.textContent).toBe("Now")
  })

  it("resets a frozen scale when the session resets or switches modes", async () => {
    const controls = await mountControls()
    Object.assign(controls, {live: true, playing: true, currentTime: 5, duration: 10})
    await controls.updateComplete
    controls.playing = false
    await controls.updateComplete
    Object.assign(controls, {currentTime: 0, duration: 0})
    await controls.updateComplete
    const range = controls.shadowRoot!.querySelector<HTMLInputElement>("input[type=range]")!
    expect(range.getAttribute("aria-valuetext")).toBe("00:00 of 00:00")
    Object.assign(controls, {live: false, currentTime: 2, duration: 4})
    await controls.updateComplete
    expect(range.value).toBe("0.5")
    expect(controls.shadowRoot!.querySelector(".lag")?.textContent).toBe("00:02 behind")
  })
})
