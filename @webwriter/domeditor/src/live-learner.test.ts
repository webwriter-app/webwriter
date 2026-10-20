// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {LiveSession} from "./live-session"
import {connectLiveLearner} from "./live-learner"
import {bunnyFontStylesheet} from "./fonts"

vi.mock("./frame-origins", () => ({editorHostOrigin: () => "https://app.test"}))

const sessionPair = (html: string, previewDependencies?: any) => {
  const host = new LiveSession({id: "learner-test", role: "host", baseHTML: html, previewDependencies})
  const learner = new LiveSession({id: "learner-test", role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}})
  return {host, learner}
}

afterEach(() => {
  // HappyDOM keeps a body's shadow root when replaceChildren() runs. Remove
  // only the learner notice/style so one test cannot leak it into the next.
  document.body.shadowRoot?.replaceChildren()
  document.head.replaceChildren()
  document.body.replaceChildren()
  for(const attribute of Array.from(document.documentElement.attributes)) document.documentElement.removeAttributeNode(attribute)
  for(const attribute of Array.from(document.body.attributes)) document.body.removeAttributeNode(attribute)
  document.title = ""
  vi.restoreAllMocks()
})

describe("connectLiveLearner", () => {
  it("includes Bunny font stylesheets and font usage in the participant snapshot", () => {
    const href = bunnyFontStylesheet({familyName: "Alegreya", category: "serif", weights: [400], styles: ["normal"]})
    const {host, learner} = sessionPair(`<!doctype html><html><head><link rel="stylesheet" href="${href}"></head><body><p style="font-family: Alegreya, serif">Lesson</p></body></html>`)
    const disconnect = connectLiveLearner(learner)
    try {
      expect(document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')!.href).toBe(href)
      expect(document.querySelector("p")!.style.fontFamily).toBe("Alegreya, serif")
      const policy = document.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy"]')!.content
      expect(policy).toContain("style-src * data: 'unsafe-inline'")
      expect(policy).toContain("font-src * data:")
    }
    finally { disconnect(); host.destroy(); learner.destroy() }
  })

  const flushMicrotasks = async () => {
    await Promise.resolve()
    await Promise.resolve()
  }

  it("tracks the HTTP-rendered document without waiting for initial Yjs HTML or replacing widget instances", async () => {
    const {host, learner} = sessionPair("")
    document.body.innerHTML = '<article><!--keep--><x-card answer="1"></x-card></article>'
    const card = document.querySelector("x-card")!
    const shadow = card.attachShadow({mode: "open"})
    shadow.innerHTML = "<button>Ready</button>"
    const disconnect = connectLiveLearner(learner, document, {rendered: true})
    try {
      expect(document.querySelector("x-card")).toBe(card)
      expect(card.shadowRoot).toBe(shadow)
      card.setAttribute("answer", "2")
      await flushMicrotasks()
      await flushMicrotasks()
      expect(host.states.some(state => state.widgets?.some(widget => widget.html?.includes('answer="2"')))).toBe(true)
      host.stop()
      await flushMicrotasks()
      expect(document.querySelector("x-card")).toBe(card)
      expect(document.body.shadowRoot?.querySelector('[role="status"]')?.textContent).toContain("Session ended")
    }
    finally { disconnect(); host.destroy(); learner.destroy() }
  })

  it("renders authored markup at top level while preserving document structure and inert assets", () => {
    const packageScript = "https://app.test/host-widget.js"
    const hostPackage = {name: "host-package", version: "1.0.0", label: "Host", authors: [], keywords: [], links: {},
      members: [{id: "x-card", packageName: "host-package", packageVersion: "1.0.0", exportName: "Card", kind: "widget",
        label: "Card", insertable: true, tagName: "x-card", scriptUrl: packageScript, styleUrl: "https://app.test/host-widget.css"}],
      scripts: [packageScript], styles: ["https://app.test/host-widget.css"]}
    const {host, learner} = sessionPair(`<!doctype html><html lang="fr" data-host="yes"><head><title>Lesson</title>
      <style>body { color: red }</style><script>window.authoredScriptRan = true</script>
      </head><body class="lesson" data-view="student"><!--keep--><x-card data-extra="yes"><span>Ready</span></x-card></body></html>`,
    {packages: [hostPackage], importMap: {imports: {"host-widget": packageScript}}})
    try {
      const disconnect = connectLiveLearner(learner)
      expect(document.title).toBe("Lesson")
      expect(document.documentElement.lang).toBe("fr")
      expect(document.documentElement.dataset.host).toBe("yes")
      expect(document.body.className).toBe("lesson")
      expect(document.body.dataset.view).toBe("student")
      expect(document.body.innerHTML).toContain("<!--keep-->")
      expect(document.querySelector("x-card")?.getAttribute("data-extra")).toBe("yes")
      expect(document.querySelector("dom-editor, app-ribbon, iframe, [name='webwriter-preview-bridge']")).toBeNull()
      expect(document.querySelector("style")?.textContent).toContain("color: red")
      expect(document.querySelector<HTMLScriptElement>("script#webwriter-package-importmap")?.textContent).toContain("host-widget")
      expect(document.querySelector("link[rel='stylesheet'][href*='host-widget.css']")).not.toBeNull()
      expect(document.querySelector<HTMLScriptElement>("script[src*='host-widget.js']")?.type).toBe("application/json")
      expect(Array.from(document.scripts).some(script => script.textContent?.includes("authoredScriptRan"))).toBe(false)
      expect((window as any).authoredScriptRan).toBeUndefined()
      disconnect()
    }
    finally {host.destroy(); learner.destroy()}
  })

  it("tracks learner clicks and authored mutations without rerendering on session events", async () => {
    const {host, learner} = sessionPair("<!doctype html><html><head><title>Lesson</title></head><body><button>Go</button></body></html>")
    try {
      const disconnect = connectLiveLearner(learner)
      const button = document.querySelector("button")!
      const body = document.body
      button.dispatchEvent(new MouseEvent("click", {bubbles: true, clientX: 10, clientY: 12, button: 0}))
      expect(host.steps.some(step => step.kind === "click")).toBe(true)
      button.textContent = "Updated by learner"
      await new Promise<void>(resolve => queueMicrotask(resolve))
      await new Promise<void>(resolve => queueMicrotask(resolve))
      expect(host.steps.some(step => step.kind === "document" && step.html?.includes("Updated by learner"))).toBe(true)
      host.publish({kind: "pointer", pointer: {x: 0.2, y: 0.3}})
      await new Promise<void>(resolve => queueMicrotask(resolve))
      expect(document.body).toBe(body)
      expect(document.querySelector("button")).toBe(button)
      disconnect()
    }
    finally {host.destroy(); learner.destroy()}
  })

  it("shows a persistent appendix notice after host stop while retaining rendered authored DOM", async () => {
    const learner = new LiveSession({id: "late-host", role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}})
    const disconnect = connectLiveLearner(learner)
    const host = new LiveSession({id: "late-host", role: "host", baseHTML: "<!doctype html><html><head><title>Late</title></head><body><p>Here</p></body></html>"})
    try {
      await flushMicrotasks()
      expect(document.title).toBe("Late")
      const authored = document.querySelector("p")!
      const bodyHTML = document.body.innerHTML
      expect(document.body.shadowRoot?.querySelector("[role=status]") ?? null).toBeNull()
      host.stop()
      await flushMicrotasks()
      const shadow = document.body.shadowRoot
      const notice = shadow?.querySelector("[role=status]")
      expect(notice ?? null).not.toBeNull()
      expect(notice?.getAttribute("aria-live")).toBe("polite")
      expect(notice?.getAttribute("aria-atomic")).toBe("true")
      expect(notice?.classList.contains("◆live-session-ended")).toBe(true)
      expect(notice?.textContent).toContain("Session ended")
      expect(notice?.textContent).toMatch(/host.*stopped.*no longer.*shared/is)
      expect(document.body.innerHTML).toBe(bodyHTML)
      expect(document.querySelector("p")).toBe(authored)
      expect(document.body.textContent).toContain("Here")
      expect(host.steps.some(step => step.kind === "document" && step.html?.includes("live-session-ended"))).toBe(false)
      expect(shadow?.querySelectorAll(".◆live-session-ended")).toHaveLength(1)
      expect(() => document.body.append(document.createElement("span"))).not.toThrow()
      expect(host.steps.some(step => step.kind === "document" && step.html?.includes("<span"))).toBe(false)
    }
    finally {disconnect(); host.destroy()}
    expect(document.body.shadowRoot?.querySelector(".◆live-session-ended") ?? null).toBeNull()
  })

  it("reuses the reader appendix slot and controls and removes only the notice on disconnect", async () => {
    const {host, learner} = sessionPair("<p>Lesson</p>")
    const shadow = document.body.shadowRoot ?? document.body.attachShadow({mode: "open"})
    const slot = document.createElement("slot")
    const controls = document.createElement("aside")
    controls.id = "reader-controls"
    shadow.append(slot, controls)
    const disconnect = connectLiveLearner(learner)
    try {
      host.stop()
      await flushMicrotasks()
      expect(document.body.shadowRoot).toBe(shadow)
      expect(shadow.querySelector("slot")).toBe(slot)
      expect(shadow.querySelector("#reader-controls")).toBe(controls)
      expect(shadow.querySelector("[role=status]")).not.toBeNull()
      disconnect()
      expect(shadow.querySelector("[role=status]")).toBeNull()
      expect(Array.from(shadow.querySelectorAll("style")).some(style => style.textContent?.includes(".◆live-session-ended"))).toBe(false)
      expect(shadow.querySelector("slot")).toBe(slot)
      expect(shadow.querySelector("#reader-controls")).toBe(controls)
    }
    finally {disconnect(); host.destroy(); learner.destroy()}
  })

  it("dismisses the ended-session notice without changing the document or reader controls", async () => {
    const {host, learner} = sessionPair("<article><!--keep--><p>Lesson</p><x-question answer='42'></x-question></article>")
    const shadow = document.body.shadowRoot ?? document.body.attachShadow({mode: "open"})
    const slot = document.createElement("slot")
    const controls = document.createElement("aside")
    shadow.append(slot, controls)
    const disconnect = connectLiveLearner(learner)
    try {
      const article = document.querySelector("article")
      const bodyHTML = document.body.innerHTML
      host.stop()
      await flushMicrotasks()
      const dismiss = shadow.querySelector<HTMLButtonElement>(".◆live-session-ended button")!
      expect(dismiss.textContent).toBe("Dismiss")
      expect(dismiss.type).toBe("button")
      dismiss.click()
      expect(shadow.querySelector(".◆live-session-ended")).toBeNull()
      expect(Array.from(shadow.querySelectorAll("style")).some(style => style.textContent?.includes(".◆live-session-ended"))).toBe(false)
      expect(document.body.innerHTML).toBe(bodyHTML)
      expect(document.querySelector("article")).toBe(article)
      expect(slot.isConnected && controls.isConnected).toBe(true)
      expect(learner.status).toBe("stopped")
      await flushMicrotasks()
      expect(shadow.querySelector(".◆live-session-ended")).toBeNull()
    }
    finally {disconnect(); host.destroy(); learner.destroy()}
  })

  it("keeps the initial ended-session message when the host stops before sending content", async () => {
    const learner = new LiveSession({id: "early-stop", role: "learner", learner: {id: "ada", name: "Ada", color: "#f00"}})
    const disconnect = connectLiveLearner(learner)
    const host = new LiveSession({id: "early-stop", role: "host"})
    host.stop()
    await flushMicrotasks()
    expect(document.body.textContent).toContain("This live session has ended.")
    expect(document.body.shadowRoot?.querySelector(".◆live-session-ended")).toBeNull()
    disconnect()
    host.destroy()
  })

  it("does not show an ended-session notice on manual disconnect", () => {
    const {host, learner} = sessionPair("<p>Lesson</p>")
    const disconnect = connectLiveLearner(learner)
    disconnect()
    expect(document.body.shadowRoot?.querySelector(".◆live-session-ended")).toBeNull()
    host.destroy()
  })

  it("disconnects listeners and destroys the learner session", () => {
    const {host, learner} = sessionPair("<!doctype html><html><head></head><body><button>Go</button></body></html>")
    const destroy = vi.spyOn(learner, "destroy")
    const disconnect = connectLiveLearner(learner)
    disconnect()
    expect(destroy).toHaveBeenCalledOnce()
    const count = host.steps.length
    document.querySelector("button")!.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    expect(host.steps).toHaveLength(count)
    host.destroy()
  })

  it("requires browser confirmation before leaving and releases it when the session ends", async () => {
    const {host, learner} = sessionPair("<p>Live lesson</p>")
    const disconnect = connectLiveLearner(learner)
    const prevented = () => {
      const event = new Event("beforeunload", {cancelable: true})
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    try {
      expect(prevented()).toBe(true)
      expect(learner.status).toBe("connected")
      host.stop()
      await Promise.resolve()
      expect(prevented()).toBe(false)
    }
    finally {disconnect(); host.destroy()}
    expect(prevented()).toBe(false)
  })
})
