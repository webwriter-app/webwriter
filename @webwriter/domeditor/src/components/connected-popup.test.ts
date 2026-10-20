// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {connectPopup} from "./popup-position"

describe("connected font dropdowns", () => {
  it.each(["below", "above"] as const)("matches the trigger's shared border when opening %s", placement => {
    const trigger = document.createElement("div"), popup = document.createElement("div")
    trigger.getBoundingClientRect = () => new DOMRect(40.25, 100.5, 90.5, 28)
    popup.getBoundingClientRect = () => new DOMRect(40.25, placement === "below" ? 127.5 : 21.5, 288, 80)
    connectPopup(trigger, popup)
    expect(trigger.dataset.connected).toBe(placement)
    expect(popup.dataset.connected).toBe(placement)
    expect(popup.style.getPropertyValue("--popup-join-left")).toBe("0px")
    expect(popup.style.getPropertyValue("--popup-join-width")).toBe("88.5px")
    expect(popup.style.getPropertyValue("--popup-border-radius")).toBe(placement === "below"
      ? "0 .35rem .35rem .35rem" : ".35rem .35rem .35rem 0")
  })

  it("aligns the border mask after viewport clamping and clears it when detached", () => {
    const trigger = document.createElement("div"), popup = document.createElement("div")
    trigger.getBoundingClientRect = () => new DOMRect(380, 100, 100, 28)
    popup.getBoundingClientRect = () => new DOMRect(192, 127, 288, 80)
    connectPopup(trigger, popup)
    expect(popup.style.getPropertyValue("--popup-join-left")).toBe("188px")
    expect(popup.style.getPropertyValue("--popup-border-radius")).toBe(".35rem 0 .35rem .35rem")
    popup.getBoundingClientRect = () => new DOMRect(192, 140, 288, 80)
    connectPopup(trigger, popup)
    expect(trigger.hasAttribute("data-connected")).toBe(false)
    expect(popup.hasAttribute("data-connected")).toBe(false)
  })
})
