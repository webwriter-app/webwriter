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

it("opens breadcrumb explanations to the right, vertically centered on the icon", async () => {
  const info = new FloatInfo()
  info.placement = "right"
  document.body.append(info)
  await info.updateComplete
  const popup = info.shadowRoot!.querySelector<HTMLElement>(".popup")!
  vi.spyOn(info, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 30, 12, 12))
  vi.spyOn(popup, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 280, 34))
  info.shadowRoot!.querySelector(".info")!.dispatchEvent(new MouseEvent("mouseenter"))
  await info.updateComplete
  expect(popup.style.left).toBe("120px")
  expect(popup.style.top).toBe("19px")
  expect(popup.classList.contains("above")).toBe(false)
  expect(getComputedStyle(popup).width).toBe("max-content")
  expect(popup.classList.contains("right-side")).toBe(true)
})


it.each([
  {viewport: 800, iconLeft: 770, width: 280, expectedLeft: 482, leftSide: true},
  {viewport: 400, iconLeft: 190, width: 280, expectedLeft: 112, leftSide: false},
  {viewport: 240, iconLeft: 210, width: 224, expectedLeft: 8, leftSide: false},
])("keeps the breadcrumb bubble inside a $viewport px viewport", async ({viewport, iconLeft, width, expectedLeft, leftSide}) => {
  const viewportSpy = vi.spyOn(window, "innerWidth", "get").mockReturnValue(viewport)
  try {
    const info = new FloatInfo()
    info.placement = "right"
    document.body.append(info)
    await info.updateComplete
    const popup = info.shadowRoot!.querySelector<HTMLElement>(".popup")!
    vi.spyOn(info, "getBoundingClientRect").mockReturnValue(new DOMRect(iconLeft, 30, 12, 12))
    vi.spyOn(popup, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, width, 34))
    info.shadowRoot!.querySelector(".info")!.dispatchEvent(new MouseEvent("mouseenter"))
    await info.updateComplete
    expect(Number.parseFloat(popup.style.left)).toBe(expectedLeft)
    expect(expectedLeft).toBeGreaterThanOrEqual(8)
    expect(expectedLeft + width).toBeLessThanOrEqual(viewport - 8)
    expect(popup.classList.contains("left-side")).toBe(leftSide)
    expect(popup.classList.contains("right-side")).toBe(false)
  }
  finally {viewportSpy.mockRestore()}
})
