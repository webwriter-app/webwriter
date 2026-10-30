// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {FloatInfo} from "./float-info"

afterEach(() => {document.body.replaceChildren(); vi.useRealTimers()})

it("shows the explanation on hover and hides it on leave", async () => {
  const info = new FloatInfo()
  document.body.append(info)
  await info.updateComplete
  const badge = info.shadowRoot!.querySelector(".info")!
  badge.dispatchEvent(new MouseEvent("mouseenter"))
  await info.updateComplete
  expect(info.shadowRoot!.querySelector<HTMLElement>('[role="tooltip"]')!.hidden).toBe(false)
  expect(info.textContent).toBe("")
  badge.dispatchEvent(new MouseEvent("mouseleave"))
  await info.updateComplete
  expect(info.open).toBe(false)
})

it("keeps the clicked explanation for five seconds and dismisses on other interaction", async () => {
  vi.useFakeTimers()
  const info = new FloatInfo()
  document.body.append(info)
  await info.updateComplete
  info.showBriefly()
  await info.updateComplete
  info.shadowRoot!.querySelector(".info")!.dispatchEvent(new MouseEvent("mouseleave"))
  vi.advanceTimersByTime(4999)
  expect(info.open).toBe(true)
  vi.advanceTimersByTime(1)
  expect(info.open).toBe(false)
  for(const type of ["pointerdown", "click", "keydown", "input", "focusin", "wheel"]) {
    info.showBriefly()
    document.dispatchEvent(new Event(type))
    expect(info.open).toBe(false)
  }
  info.showBriefly()
  info.remove()
  expect(info.open).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it("opens breadcrumb explanations with CSS anchors and releases anchor markers on hide", async () => {
  const info = new FloatInfo()
  info.placement = "right"
  document.body.append(info)
  await info.updateComplete
  const popup = info.shadowRoot!.querySelector<HTMLElement>(".popup")!
  info.shadowRoot!.querySelector(".info")!.dispatchEvent(new MouseEvent("mouseenter"))
  await info.updateComplete
  expect(popup.style.left).toBe("")
  expect(popup.style.top).toBe("")
  expect(getComputedStyle(popup).width).toBe("max-content")
  info.hide()
  expect(popup.className).not.toMatch(/◆anchor-/)
})


it("does not assign pixel coordinates when a side placement is requested", async () => {
  const info = new FloatInfo()
  info.placement = "right"
  document.body.append(info)
  await info.updateComplete
  const popup = info.shadowRoot!.querySelector<HTMLElement>(".popup")!
  info.shadowRoot!.querySelector(".info")!.dispatchEvent(new MouseEvent("mouseenter"))
  await info.updateComplete
  expect(popup.style.left).toBe("")
  expect(popup.style.top).toBe("")
  expect(getComputedStyle(popup).width).toBe("max-content")
})
