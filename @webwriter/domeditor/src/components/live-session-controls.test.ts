// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {LiveSessionControls} from "./live-session-controls"

afterEach(() => {
  document.body.replaceChildren()
})

async function mountControls() {
  const controls = new LiveSessionControls()
  document.body.append(controls)
  await controls.updateComplete
  return controls
}

describe("live session controls", () => {
  it("renders accessible transport controls and shows LIVE at the end", async () => {
    const controls = await mountControls()
    controls.playing = true
    controls.step = 4
    controls.stepCount = 4
    controls.live = true
    await controls.updateComplete

    const play = controls.shadowRoot!.querySelector<HTMLButtonElement>("button")!
    const range = controls.shadowRoot!.querySelector<HTMLInputElement>("input[type=range]")!
    const status = controls.shadowRoot!.querySelector<HTMLElement>(".status")!
    const buttons = controls.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")

    expect(play.getAttribute("aria-label")).toBe("Pause")
    expect(range.min).toBe("0")
    expect(range.max).toBe("4")
    expect(range.value).toBe("4")
    expect(range.getAttribute("aria-valuetext")).toBe("LIVE")
    expect(status.textContent).toBe("LIVE")
    expect(buttons[1]?.getAttribute("aria-label")).toBe("Stop")
  })

  it("dispatches bubbling composed playback, seek, and stop events", async () => {
    const controls = await mountControls()
    controls.stepCount = 8
    await controls.updateComplete
    const events: Array<{type: string, step?: number}> = []
    document.body.addEventListener("live-session-play", event => {
      events.push({type: event.type})
    })
    document.body.addEventListener("live-session-seek", event => {
      events.push({type: event.type, step: (event as CustomEvent<{step: number}>).detail.step})
    })
    document.body.addEventListener("live-session-stop", event => {
      events.push({type: event.type})
    })

    const buttons = controls.shadowRoot!.querySelectorAll<HTMLButtonElement>("button")
    buttons[0]!.click()
    const range = controls.shadowRoot!.querySelector<HTMLInputElement>("input[type=range]")!
    range.value = "3"
    range.dispatchEvent(new Event("input", {bubbles: true}))
    buttons[1]!.click()

    expect(events).toEqual([
      {type: "live-session-play"},
      {type: "live-session-seek", step: 3},
      {type: "live-session-stop"},
    ])
  })

  it("reports a numeric status before the live edge and clamps the range", async () => {
    const controls = await mountControls()
    controls.step = 9
    controls.stepCount = 5
    controls.live = true
    await controls.updateComplete

    const range = controls.shadowRoot!.querySelector<HTMLInputElement>("input[type=range]")!
    expect(range.value).toBe("5")
    expect(controls.shadowRoot!.querySelector(".status")?.textContent).toBe("LIVE")

    controls.live = false
    await controls.updateComplete
    expect(controls.shadowRoot!.querySelector(".status")?.textContent).toBe("5 / 5")
  })
})
