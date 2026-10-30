import type {DomEditor} from "../src/components/dom-editor"
import type {ProofreadingState} from "../src/editor-bridge"

export async function checkSavedDocumentChecker() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:1000px;height:700px;max-width:none"
  frame.src = "/editor/"
  document.querySelector("#fixture")!.append(frame)
  try {
    let app: DomEditor | null = null
    for(let attempt = 0; attempt < 200; attempt++) {
      app = frame.contentDocument?.querySelector<DomEditor>("dom-editor") ?? null
      if((app as any)?.editorWindow) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert(app && (app as any).editorWindow, "editor did not initialize")
    const host = app as any
    await host.waitForEditorWindow()
    // Opening a saved document enables accessibility review automatically.
    await host.reloadDocument('<!doctype html><html lang="en"><head><title>Saved lesson</title></head><body><main><h1>Lesson</h1><p>This is teh first lesson.</p><img></main></body></html>', false, null, true)
    const editorFrame = app!.shadowRoot!.querySelector("iframe.editor-frame")
    await app!.execute({type: "setProofreadingEnabled", enabled: true})
    await app!.execute({type: "checkProofreading"})
    let state: ProofreadingState | undefined
    for(let attempt = 0; attempt < 300; attempt++) {
      state = await app!.execute({type: "getProofreadingState"}) as ProofreadingState
      if(state.error || state.ready && !state.loading && !state.checking) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert(state?.ready && !state.error, `saved-document checker failed: ${state?.error ?? "timed out"}`)
    assert(state!.issues.some(issue => issue.kind === "spelling" && issue.text === "teh"), "saved-document checker missed spelling")
    assert(state!.issues.some(issue => issue.kind === "accessibility" && issue.helpUrl?.includes("image-alt")), "saved-document checker did not run accessibility review")
    assert(app!.shadowRoot!.querySelector("iframe.editor-frame") === editorFrame, "loading the checker replaced the editor frame")
  }
  finally { frame.remove() }
}
