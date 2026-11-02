import {SharedDOMDoc} from "../src/domdoc"
import {LiveSession} from "../src/live-session"

const html = `<!doctype html><html><head><title>Planning a community garden</title></head><body>
<h1>Planning a community garden</h1>
<p>Our neighborhood is turning an unused courtyard into a shared garden. We need ideas, volunteers, and a plan that works throughout the year.</p>
<h2>What should we grow?</h2>
<p>Choose plants that suit the available light and are easy for new gardeners to care for. Herbs and vegetables could share the sunny beds.</p>
<ul><li>Herbs: mint, parsley, and rosemary</li><li>Vegetables: tomatoes, beans, and lettuce</li><li>Flowers for pollinators</li></ul>
<h2>Work together</h2>
<p>Each group can suggest one improvement and explain who will look after it. Discuss the suggestions before making a final decision.</p>
<table><caption>First month</caption><thead><tr><th>Week</th><th>Activity</th><th>Team</th></tr></thead><tbody><tr><td>1</td><td>Measure the space</td><td>Planning</td></tr><tr><td>2</td><td>Prepare the soil</td><td>Gardeners</td></tr><tr><td>3</td><td>Plant seeds</td><td>Everyone</td></tr></tbody></table>
<details><summary>Questions to consider</summary><p>Where will we keep tools? How will we share watering when someone is away?</p></details>
<h2>Next steps</h2><p>Write down the tasks that need a volunteer and decide when to meet again.</p>
</body></html>`
const names = ["Alex", "Sam", "Taylor", "Morgan", "Riley", "Jordan", "Casey", "Avery"]
const colors = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#4d7c0f"]
type Kind = "collaboration" | "classroom"
type Action = "random" | "insert" | "delete" | "format" | "pointer" | "click" | "scroll"
type Identity = {id: string, name: string, color: string}
type Participant = {identity: Identity, peer?: SharedDOMDoc, learner?: LiveSession, disconnected: boolean}
const choose = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)]

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {headers: {"Content-Type": "application/json"}, ...init})
  if(response.status === 204) return null
  const result = await response.json()
  if(!response.ok) throw new Error(result.error?.message ?? `Request failed (${response.status})`)
  return result
}

export function parseInvitation(value: string, origin = location.origin) {
  let url: URL, server: URL
  try { url = new URL(value); server = new URL(url.searchParams.get("liveServer") ?? "") }
  catch { throw new Error("Paste a valid live-session invitation from this development server.") }
  const expected = new URL(origin)
  expected.protocol = expected.protocol === "https:" ? "wss:" : "ws:"
  const id = url.searchParams.get("liveSession") ?? ""
  const token = url.searchParams.get("liveToken") ?? ""
  if(server.origin !== expected.origin || server.username || server.password || server.pathname !== "/" || server.search || server.hash
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || !/^[A-Za-z0-9_-]{24,256}$/.test(token)) {
    throw new Error("Use a live-session invitation from this development server.")
  }
  return {id, token, serverUrl: server.origin}
}

export class ScenarioRunner {
  documentId: string | null = null
  kind: Kind | null = null
  participants: Participant[] = []
  private nextId = 0
  private invitation: ReturnType<typeof parseInvitation> | null = null

  async start(kind: Kind) {
    await this.reset()
    const result = await request("/api/documents", {method: "POST", body: JSON.stringify({title: `Scenario: ${kind}`, format: "html", content: html})})
    this.documentId = result.document.id
    this.kind = kind
    try {
      if(kind === "collaboration") await request(`/api/documents/${encodeURIComponent(this.documentId!)}/sharing`, {method: "PUT", body: JSON.stringify({enabled: true})})
    }
    catch(error) { await this.reset(); throw error }
    const url = new URL("/editor/", location.origin)
    url.searchParams.set("open", new URL(`/api/documents/${encodeURIComponent(this.documentId!)}`, location.origin).href)
    return url.href
  }

  async add(invitation: string) {
    if(!this.documentId || !this.kind) throw new Error("Start a scenario first.")
    if(this.participants.length >= 20) throw new Error("A scenario can have at most 20 participants.")
    const index = this.nextId
    const identity = {id: `scenario-${crypto.randomUUID()}`, name: index < names.length ? names[index] : `Participant ${index + 1}`, color: colors[index % colors.length]}
    const participant: Participant = {identity, disconnected: true}
    if(this.kind === "classroom") {
      const parsed = parseInvitation(invitation)
      if(this.invitation && (parsed.id !== this.invitation.id || parsed.token !== this.invitation.token)) throw new Error("Reset before connecting participants to a different session.")
      this.invitation = parsed
    }
    await this.connect(participant)
    this.nextId++
    this.participants.push(participant)
    return participant
  }

  private async connect(participant: Participant) {
    if(this.kind === "collaboration") {
      const root = document.createElement("div")
      root.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML
      const peer = participant.peer ?? new SharedDOMDoc(location.origin.replace(/^http/, "ws"), `document-${this.documentId}`, [], ["◆"], {root, user: participant.identity})
      participant.peer = peer
      try {
        if(!peer.provider!.shouldConnect) peer.provider!.connect()
        await new Promise<void>((resolve, reject) => {
          const provider = peer.provider!
          if(provider.synced && provider.wsconnected) return resolve()
          const timer = setTimeout(() => { provider.off("sync", sync); reject(new Error("Participant could not connect. Check the server and retry.")) }, 10000)
          const sync = (ready: boolean) => { if(ready) { clearTimeout(timer); provider.off("sync", sync); resolve() } }
          provider.on("sync", sync)
        })
        if(!peer.root.querySelector("p")) throw new Error("Open the scenario document in the editor and wait for it to load before adding participants.")
        const text = peer.root.querySelector("p")?.firstChild
        if(text) {
          const position = peer.relativePositionFromDOMPoint(text, Math.min(3, text.textContent?.length ?? 0))
          if(position) peer.awareness.setLocalStateField("selection", {anchor: position, focus: position})
        }
      } catch(error) { peer.destroy(); participant.peer = undefined; throw error }
    } else {
      if(!this.invitation) throw new Error("Paste the host’s learner invitation first.")
      const learner = new LiveSession({...this.invitation, role: "learner", learner: participant.identity})
      participant.learner = learner
      try {
        await new Promise<void>((resolve, reject) => {
          if(learner.status === "connected") return resolve()
          const timer = setTimeout(() => { unsubscribe(); reject(new Error("Learner could not connect. Check that the host session is running.")) }, 10000)
          const unsubscribe = learner.onChange(() => { if(learner.status === "connected") { clearTimeout(timer); unsubscribe(); resolve() } })
        })
      } catch(error) { learner.destroy(); participant.learner = undefined; throw error }
    }
    participant.disconnected = false
  }

  disconnect(participant: Participant) {
    if(!this.participants.includes(participant) || participant.disconnected) return
    if(participant.peer) participant.peer.disconnectCollaboration()
    if(participant.learner) { participant.learner.destroy(); participant.learner = undefined }
    participant.disconnected = true
  }

  async reconnect(participant: Participant) {
    if(!this.participants.includes(participant) || !participant.disconnected) return
    await this.connect(participant)
  }

  remove(participant: Participant) {
    if(!this.participants.includes(participant)) return
    participant.peer?.destroy(); participant.learner?.destroy()
    this.participants = this.participants.filter(item => item !== participant)
  }

  act(participant: Participant, action: Action) {
    if(!this.participants.includes(participant) || participant.disconnected) throw new Error("Choose a connected participant.")
    if(participant.peer) {
      if(participant.peer.connectionStatus !== "connected") throw new Error("The participant is not connected yet.")
      const kind = action === "random" ? choose(["insert", "delete", "format"] as const) : action
      if(kind !== "insert" && kind !== "delete" && kind !== "format") throw new Error("Choose an editing action.")
      const walker = document.createTreeWalker(participant.peer.root, NodeFilter.SHOW_TEXT)
      const nodes: Text[] = []
      while(walker.nextNode()) {
        const node = walker.currentNode as Text
        // Only edit ordinary paragraph text; leave widgets and unfamiliar content intact.
        if(node.data.trim() && node.parentElement?.closest("p") && !node.parentElement.closest('[contenteditable="false"]')) {
          let parent = node.parentElement
          let custom = false
          while(parent && parent !== participant.peer.root) { if(parent.localName.includes("-")) custom = true; parent = parent.parentElement }
          if(!custom) nodes.push(node)
        }
      }
      if(!nodes.length) throw new Error("No editable paragraph text is available. Add a paragraph or reset the scenario.")
      const node = choose(nodes)
      const start = Math.floor(Math.random() * node.length)
      if(kind === "insert") node.insertData(start, choose([" together", " curious", " revised", " note"]))
      else if(kind === "delete") node.deleteData(start, Math.min(3, node.length - start))
      else {
        const range = node.ownerDocument.createRange()
        range.setStart(node, start); range.setEnd(node, Math.min(node.length, start + 3))
        const strong = node.ownerDocument.createElement("strong")
        range.surroundContents(strong)
      }
      participant.peer.syncFromDOM()
      return `${participant.identity.name}: ${kind} in a randomly selected paragraph.`
    }
    const learner = participant.learner
    if(!learner || learner.status !== "connected") throw new Error("The learner is not connected yet.")
    const kind = action === "random" ? choose(["pointer", "click", "scroll"] as const) : action
    const point = {x: Math.round(Math.random() * 400), y: Math.round(Math.random() * 300)}
    if(kind === "pointer") learner.publish({kind, pointer: point})
    else if(kind === "click") learner.publish({kind, click: {...point, button: 0}})
    else if(kind === "scroll") learner.publish({kind, scroll: {top: Math.round(Math.random() * 400), left: 0, height: 900, viewport: 500}})
    else throw new Error("Choose a learner activity.")
    return `${participant.identity.name}: ${kind} activity published.`
  }

  disposeParticipants() {
    this.participants.forEach(participant => { participant.peer?.destroy(); participant.learner?.destroy() })
    this.participants = []
  }

  async reset() {
    this.disposeParticipants()
    if(this.documentId) {
      await request(`/api/documents/${encodeURIComponent(this.documentId)}`, {method: "DELETE"})
      this.documentId = null
    }
    this.kind = null; this.invitation = null; this.nextId = 0
  }
}

const container = document.querySelector<HTMLElement>("#scenario-panel")
if(container) {
  const runner = new ScenarioRunner()
  container.innerHTML = `
    <h2>Test scenarios</h2>
    <p>Open a disposable document and control simulated participants. Keep this dashboard open while testing.</p>
    <label>Scenario <select id="scenario-kind"><option value="collaboration">Concurrent editing</option><option value="classroom">Live classroom</option></select></label>
    <div class="scenario-actions"><button id="scenario-start" type="button" class="primary">Start scenario</button><button id="scenario-reset" type="button" disabled>Reset scenario</button><button id="scenario-end" type="button" disabled>End and remove document</button></div>
    <p id="scenario-instructions" role="status">Choose a scenario and start it.</p>
    <p><a id="scenario-editor" target="_blank" rel="noopener" hidden>Open scenario document</a></p>
    <label id="scenario-invitation-label" hidden>Host’s live-session invitation link <input id="scenario-invitation" type="url" autocomplete="off" placeholder="Paste the learner link from the host editor"></label>
    <div id="scenario-controls" hidden>
      <div class="scenario-actions"><button id="scenario-add" type="button">Add participant</button></div>
      <div id="scenario-participants" class="list" aria-label="Simulated participants"></div>
      <div class="scenario-actions"><label>Action <select id="scenario-action"></select></label><button id="scenario-run" type="button">Run for a random participant</button></div>
    </div>`
  const kind = container.querySelector<HTMLSelectElement>("#scenario-kind")!
  const start = container.querySelector<HTMLButtonElement>("#scenario-start")!
  const reset = container.querySelector<HTMLButtonElement>("#scenario-reset")!
  const end = container.querySelector<HTMLButtonElement>("#scenario-end")!
  const add = container.querySelector<HTMLButtonElement>("#scenario-add")!
  const run = container.querySelector<HTMLButtonElement>("#scenario-run")!
  const controls = container.querySelector<HTMLElement>("#scenario-controls")!
  const list = container.querySelector<HTMLElement>("#scenario-participants")!
  const action = container.querySelector<HTMLSelectElement>("#scenario-action")!
  const message = container.querySelector<HTMLElement>("#scenario-instructions")!
  const link = container.querySelector<HTMLAnchorElement>("#scenario-editor")!
  const inviteLabel = container.querySelector<HTMLElement>("#scenario-invitation-label")!
  const invite = container.querySelector<HTMLInputElement>("#scenario-invitation")!
  let working = false
  const update = () => {
    start.disabled = working || !!runner.documentId
    reset.disabled = working || !runner.documentId || !runner.kind
    end.disabled = working || !runner.documentId
    kind.disabled = working || !!runner.documentId
    add.disabled = working || !runner.kind || runner.participants.length >= 20
    run.disabled = working || !runner.participants.some(participant => !participant.disconnected)
    action.disabled = working || !runner.kind
    list.replaceChildren()
    for(const participant of runner.participants) {
      const row = document.createElement("article")
      const label = document.createElement("span")
      const connected = !participant.disconnected && (participant.peer ? participant.peer.connectionStatus === "connected" : participant.learner?.status === "connected")
      label.textContent = `${participant.identity.name} · ${participant.disconnected ? "disconnected" : connected ? "connected" : "connecting"}`
      const button = (text: string, callback: () => Promise<void>) => {
        const element = document.createElement("button")
        element.type = "button"; element.textContent = text; element.disabled = working
        element.setAttribute("aria-label", `${text} ${participant.identity.name}`)
        element.addEventListener("click", () => void perform(callback))
        return element
      }
      row.append(label, button("Run action", async () => { message.textContent = runner.act(participant, action.value as Action) }),
        button(participant.disconnected ? "Reconnect" : "Disconnect", async () => {
          if(participant.disconnected) { await runner.reconnect(participant); message.textContent = `${participant.identity.name} reconnected.` }
          else { runner.disconnect(participant); message.textContent = `${participant.identity.name} disconnected.` }
        }), button("Remove", async () => { runner.remove(participant); message.textContent = `${participant.identity.name} removed.` }))
      ;(row.querySelector("button") as HTMLButtonElement).disabled = working || !connected
      list.append(row)
    }
  }
  const perform = async (operation: () => Promise<void>) => {
    if(working) return
    working = true; update()
    try { await operation() }
    catch(error) { message.textContent = error instanceof Error ? error.message : String(error) }
    finally { working = false; update() }
  }
  const recoveryKey = "webwriter-dev-scenario-document"
  const previous = sessionStorage.getItem(recoveryKey)
  if(previous && /^[A-Za-z0-9-]+$/.test(previous)) {
    runner.documentId = previous
    message.textContent = "A previous scenario was interrupted. End the scenario to remove its document before starting another."
  }
  update()
  const openEditor = () => {
    const opened = window.open("about:blank", "_blank")
    if(opened) opened.opener = null
    return opened
  }
  const loadScenario = async (selected: Kind, opened: Window | null) => {
    try {
      link.href = await runner.start(selected)
      sessionStorage.setItem(recoveryKey, runner.documentId!)
      link.hidden = false; controls.hidden = false
      inviteLabel.hidden = runner.kind !== "classroom"; invite.value = ""
      action.replaceChildren(...(runner.kind === "collaboration"
        ? [["random", "Random edit"], ["insert", "Insert text"], ["delete", "Delete text"], ["format", "Apply bold"]]
        : [["random", "Random activity"], ["pointer", "Move pointer"], ["click", "Click"], ["scroll", "Scroll"]]).map(([value, label]) => new Option(label, value)))
      if(opened) opened.location.href = link.href
      message.textContent = (opened ? "The scenario document is opening. " : "Open the scenario document using the link below. ") + (runner.kind === "collaboration"
        ? "Wait for it to load, then add participants here."
        : "Start a live session in its preview, paste its learner invitation below, then add participants.")
    } catch(error) {
      opened?.close()
      if(!runner.documentId) {
        sessionStorage.removeItem(recoveryKey); link.hidden = true; link.removeAttribute("href"); controls.hidden = true; inviteLabel.hidden = true
      }
      throw error
    }
  }
  start.addEventListener("click", () => {
    const opened = openEditor()
    void perform(() => loadScenario(kind.value as Kind, opened))
  })
  reset.addEventListener("click", () => {
    const selected = runner.kind
    if(!selected) return
    const opened = openEditor()
    void perform(async () => {
      message.textContent = "Resetting the scenario…"
      await loadScenario(selected, opened)
      message.textContent += " Close the previous editor tab and stop any live session in it."
    })
  })
  add.addEventListener("click", () => void perform(async () => {
    const participant = await runner.add(invite.value)
    message.textContent = `${participant.identity.name} joined.`
  }))
  run.addEventListener("click", () => void perform(async () => {
    const connected = runner.participants.filter(participant => !participant.disconnected && (participant.peer ? participant.peer.connectionStatus === "connected" : participant.learner?.status === "connected"))
    if(!connected.length) throw new Error("Add or reconnect a participant first.")
    message.textContent = runner.act(choose(connected), action.value as Action)
  }))
  end.addEventListener("click", () => void perform(async () => {
    await runner.reset(); sessionStorage.removeItem(recoveryKey); link.hidden = true; link.removeAttribute("href"); inviteLabel.hidden = true; controls.hidden = true; invite.value = ""
    message.textContent = "Scenario removed. Close the old editor tab and stop any live session you started there."
  }))
  window.addEventListener("pagehide", () => runner.disposeParticipants())
}
