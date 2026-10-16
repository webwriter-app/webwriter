// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"

vi.mock("./frame-local-packages", () => ({connectFrameLocalPackages: vi.fn()}))

describe("frame shell refresh handling without Navigation API", () => {
  afterEach(() => vi.restoreAllMocks())

  it("refuses head and body refresh while preserving ordinary and template documents in both frames", async () => {
    const win = window as Window & {happyDOM?: {setURL(url: string): Promise<void>}, navigation?: unknown}
    const navigationDescriptor = Object.getOwnPropertyDescriptor(window, "navigation")
    Object.defineProperty(window, "navigation", {value: undefined, configurable: true})
    const calls: {type: string, args: unknown[]}[] = []
    const addListener = vi.spyOn(window, "addEventListener").mockImplementation((type: string, listener: EventListenerOrEventListenerObject) => {
      if(type === "message") calls.push({type, args: [listener]})
    })
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => {})
    const writes: string[] = []
    vi.spyOn(document, "open").mockImplementation(() => window)
    vi.spyOn(document, "write").mockImplementation((...text: string[]) => { writes.push(text.join("")) })
    vi.spyOn(document, "close").mockImplementation(() => {})

    const cases = [
      {kind: "editor", html: '<!doctype html><head><meta http-equiv="refresh" content="0;url=/lost"></head><body>Head refresh</body>', refused: true},
      {kind: "editor", html: '<!doctype html><body><meta http-equiv="refresh" content="0;url=/lost">Body refresh</body>', refused: true},
      {kind: "editor", html: '<!doctype html><body><template><meta http-equiv="refresh" content="0;url=/inert"></template>Template</body>', refused: false},
      {kind: "editor", html: "<!doctype html><body>Ordinary document</body>", refused: false},
      {kind: "preview", html: '<!doctype html><head><meta http-equiv="refresh" content="0;url=/preview"></head><body>Preview</body>', refused: true},
      {kind: "package-test", html: "<!doctype html><body>Isolated package test</body>", refused: false},
    ] as const

    try {
      for(let index = 0; index < cases.length; index++) {
        const testCase = cases[index]
        const nonce = `nonce-${index}`
        const revision = String(index)
        const url = `http://localhost:5173/frame-shell.html?kind=${testCase.kind}&revision=${revision}#nonce=${nonce}`
        if(win.happyDOM) await win.happyDOM.setURL(url)
        else window.history.replaceState(null, "", url)
        vi.resetModules()
        await import("./frame-shell")
        const handler = calls.at(-1)?.args[0] as EventListener
        expect(handler).toBeTypeOf("function")
        const hostOrigin = testCase.kind === "package-test" ? location.origin
          : `${location.protocol}//${location.hostname === "localhost" ? "127.0.0.1" : "localhost"}${location.port ? `:${location.port}` : ""}`
        const before = writes.length
        const postBefore = postMessage.mock.calls.length
        handler(new MessageEvent("message", {
          source: window.parent,
          origin: hostOrigin,
          data: {type: "webwriter-frame-document", html: testCase.html},
        }))

        if(testCase.refused) {
          expect(writes).toHaveLength(before)
          expect(document.querySelector('[role="alert"]')?.textContent).toContain("automatic refresh redirects")
          expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
            type: "webwriter-frame-error", kind: testCase.kind, revision, bridgeNonce: nonce,
          }), hostOrigin)
          document.body.replaceChildren()
        }
        else {
          expect(writes.slice(before)).toEqual([testCase.html])
          expect(postMessage.mock.calls.slice(postBefore)).not.toContainEqual(expect.arrayContaining([
            expect.objectContaining({type: "webwriter-frame-error"}), hostOrigin,
          ]))
        }
      }
      expect(addListener).toHaveBeenCalled()
    }
    finally {
      if(navigationDescriptor) Object.defineProperty(window, "navigation", navigationDescriptor)
      else delete (window as Window & {navigation?: unknown}).navigation
    }
  })
})
