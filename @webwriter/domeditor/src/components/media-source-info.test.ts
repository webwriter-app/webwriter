// @vitest-environment happy-dom
import {afterEach, expect, it} from "vitest"
import {MediaSourceInfo} from "./media-source-info"
import {embeddablePlatformNames} from "../media"

afterEach(() => document.body.replaceChildren())

it("shows the supported sources on hover and keyboard focus and cleans up on removal", async () => {
  const info = new MediaSourceInfo()
  document.body.append(info)
  await info.updateComplete
  const button = info.shadowRoot!.querySelector("button")!
  const popup = info.shadowRoot!.querySelector<HTMLElement>('[role="tooltip"]')!
  expect(button.getAttribute("aria-describedby")).toBe(popup.id)
  expect(popup.hidden).toBe(true)
  for(const [show, hide] of [["mouseenter", "mouseleave"], ["focus", "blur"]]) {
    button.dispatchEvent(new Event(show))
    await info.updateComplete
    expect(popup.hidden).toBe(false)
    for(const name of embeddablePlatformNames) expect(popup.textContent).toContain(name)
    button.dispatchEvent(new Event(hide))
    await info.updateComplete
    expect(popup.hidden).toBe(true)
  }
  info.remove()
  expect(info.open).toBe(false)
})
