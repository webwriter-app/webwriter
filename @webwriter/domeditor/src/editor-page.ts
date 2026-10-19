import {discoverHostBackend, probeDevelopmentBackend} from "./backend-client"
import {editorFrameOrigin} from "./frame-origins"
import {liveLearnerURL} from "./page-routing"

function showStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const alert = document.createElement("p")
  alert.setAttribute("role", "alert")
  alert.textContent = message
  document.body.replaceChildren(alert)
}

export async function startEditorPage() {
  const current = new URL(location.href)
  if(current.searchParams.has("liveSession")) {
    try {
      let serverUrl = current.searchParams.get("liveServer") ?? undefined
      if(!serverUrl) {
        const signal = AbortSignal.timeout(5000)
        const session = await discoverHostBackend(signal) ?? await probeDevelopmentBackend(signal)
        serverUrl = session?.collaborationUrl
      }
      if(!serverUrl) throw new Error("Could not find the collaboration server for this learner link.")
      location.replace(liveLearnerURL(current, editorFrameOrigin(), import.meta.env.BASE_URL, serverUrl).href)
    }
    catch(error) {showStartupError(error)}
    return
  }
  try {
    await import("./components/dom-editor")
    document.body.append(document.createElement("dom-editor"))
  }
  catch(error) {showStartupError(error)}
}

if(import.meta.env.MODE !== "test") void startEditorPage()
