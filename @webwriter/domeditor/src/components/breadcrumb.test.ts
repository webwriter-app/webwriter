// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import "./breadcrumb"
import type {DomEditorBreadcrumb} from "./breadcrumb"

afterEach(() => {
  document.querySelectorAll("dom-editor-breadcrumb").forEach(element => element.remove())
  vi.unstubAllGlobals()
})

describe("breadcrumb resize lifecycle", () => {
  it("measures the tree panel without scheduling another Lit update", async () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight")
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("tree-panel") ? 120 : 0
      },
    })

    try {
      const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
      breadcrumb.tree = {
        path: [],
        name: "Document",
        children: [{path: [0], name: "main", children: []}],
      }
      document.body.append(breadcrumb)

      expect(await breadcrumb.updateComplete).toBe(true)
      expect(breadcrumb.shadowRoot!.querySelector<HTMLElement>(".tree-panel")!.style.maxHeight).toBe("0px")

      breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
      expect(await breadcrumb.updateComplete).toBe(true)
      expect(breadcrumb.shadowRoot!.querySelector<HTMLElement>(".tree-panel")!.style.maxHeight).toBe("120px")
      breadcrumb.remove()
    }
    finally {
      if(originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight)
      }
      else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight")
      }
    }
  })

  it("observes the navigation again when the same element reconnects", async () => {
    const observers: Array<{
      observe: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    }> = []
    class ResizeObserverStub {
      observe = vi.fn()
      disconnect = vi.fn()
      unobserve = vi.fn()
      takeRecords = () => []

      constructor(_callback: ResizeObserverCallback) {
        observers.push(this)
      }
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub)

    const breadcrumb = document.createElement("dom-editor-breadcrumb") as DomEditorBreadcrumb
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete

    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledWith(breadcrumb.shadowRoot!.querySelector("nav"))

    breadcrumb.remove()
    expect(observers[0].disconnect).toHaveBeenCalledOnce()

    document.body.append(breadcrumb)

    expect(observers).toHaveLength(2)
    expect(observers[1].observe).toHaveBeenCalledWith(breadcrumb.shadowRoot!.querySelector("nav"))
    breadcrumb.remove()
  })
})
