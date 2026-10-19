import {LiveSession, liveSessionLearnerIdentity} from "./live-session"
import {connectLiveLearner} from "./live-learner"

export function startLiveLearner() {
  try {
    const parameters = new URL(location.href).searchParams
    const id = parameters.get("liveSession") ?? ""
    const token = parameters.get("liveToken") ?? ""
    const serverUrl = new URL(parameters.get("liveServer") ?? "")
    if(!["ws:", "wss:"].includes(serverUrl.protocol) || serverUrl.username || serverUrl.password) {
      throw new Error("This learner link has an invalid collaboration server")
    }
    if(!/^[A-Za-z0-9_-]{24,256}$/.test(token)) throw new Error("This learner link is missing its access token")
    const session = new LiveSession({id, role: "learner", serverUrl: serverUrl.href, token,
      learner: liveSessionLearnerIdentity(id)})
    return connectLiveLearner(session, document, {rendered: Boolean(document.getElementById("webwriter-live-learner"))})
  }
  catch(error) {
    const alert = document.createElement("p")
    alert.setAttribute("role", "alert")
    alert.textContent = error instanceof Error ? error.message : String(error)
    document.body.replaceChildren(alert)
  }
}

if(import.meta.env.MODE !== "test") startLiveLearner()
