import {LiveSessionRecovery, deleteRecoveredSession, listRecoveredSessions, readRecoveredSession} from "../src/live-session-recovery"
import {LiveSessionReplayClient} from "../src/live-session-replay-client"
import {LiveSession} from "../src/live-session"

/** Close a recording frame without finishing it, then recover its last commit. */
export async function checkLiveSessionRecovery() {
  const id = `recovery-test-${crypto.randomUUID()}`
  const directory = await navigator.storage.getDirectory()
  const frame = document.createElement("iframe")
  const script = `
    import {LiveSession} from ${JSON.stringify(new URL("/src/live-session.ts", location.origin).href)};
    import {LiveSessionRecovery} from ${JSON.stringify(new URL("/src/live-session-recovery.ts", location.origin).href)};
    import {IncrementalPreviewRecorder} from ${JSON.stringify(new URL("/src/live-session-incremental.ts", location.origin).href)};
    try {
      const id = ${JSON.stringify(id)};
      const host = new LiveSession({id, role: "host", baseHTML: "<html><head></head><body><p>Start</p></body></html>"});
      const learner = new LiveSession({id, role: "learner", learner: {id: "ada", name: "Ada", color: "red"}});
      const journal = new LiveSessionRecovery(host, Date.now() - 1000, "Recovery test", error => { throw error });
      const recorder = new IncrementalPreviewRecorder("<p>First</p>");
      const encode = bytes => btoa(String.fromCharCode(...bytes));
      learner.publish({kind: "document", htmlCheckpoint: encode(recorder.checkpoint())});
      learner.publish({kind: "document", htmlUpdate: encode(recorder.capture("<p>Edited</p>"))});
      learner.publish({kind: "pointer", pointer: {x: .25, y: .5}});
      if(!host.sendFeedback("ada", "Well done")) throw new Error("Feedback was not accepted");
      await new Promise(resolve => setTimeout(resolve, 10));
      await journal.flush();
      parent.postMessage({id, ok: true}, ${JSON.stringify(location.origin)});
    } catch(error) { parent.postMessage({id: ${JSON.stringify(id)}, error: String(error)}, ${JSON.stringify(location.origin)}); }
  `
  frame.srcdoc = `<!doctype html><script type="module">${script}<\/script>`
  const completion = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { window.removeEventListener("message", onMessage); reject(new Error("Recording did not commit")) }, 30000)
    const onMessage = (event: MessageEvent) => {
      if(event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.id !== id) return
      clearTimeout(timer); window.removeEventListener("message", onMessage)
      if(event.data.error) reject(new Error(event.data.error)); else resolve()
    }
    window.addEventListener("message", onMessage)
  })
  document.body.append(frame)
  const filename = `${id}.wwreplay`
  try {
    await completion
    if(navigator.locks && (await listRecoveredSessions()).some(item => item.id === id)) throw new Error("Active session was offered as a recovery")
    frame.remove()
    let record = (await listRecoveredSessions()).find(item => item.id === id)
    for(let attempt = 0; !record && attempt < 200; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      record = (await listRecoveredSessions()).find(item => item.id === id)
    }
    if(!record) throw new Error("Interrupted session was not found")
    const replay = await readRecoveredSession(record)
    if(!replay.steps.some(step => step.pointer?.x === .25) || !replay.steps.some(step => step.htmlUpdate) || replay.feedback[0]?.text !== "Well done") throw new Error("Recovered activity or feedback is missing")
    const handle = await directory.getFileHandle(filename, {create: true})
    const writer = new LiveSessionReplayClient()
    try { await writer.save(replay, handle) } finally { writer.close() }
    const reader = new LiveSessionReplayClient()
    try {
      await reader.open(await handle.getFile())
      const state = await reader.seek(Infinity, -1)
      if(state.states?.[0]?.pointer?.x !== .25 || state.states?.[0]?.html !== "<p>Edited</p>") throw new Error("Streamed replay did not play")
    }
    finally { reader.close() }

    const lateId = `${id}-late`
    const lateHost = new LiveSession({id: lateId, role: "host", baseHTML: "<p>Start</p>"})
    let lateError: Error | undefined
    const lateJournal = new LiveSessionRecovery(lateHost, Date.now(), "Late commit", error => { lateError = error })
    try {
      await lateJournal.flush()
      // Simulate a closing page releasing its lock while a later write is pending.
      if(navigator.locks) {
        for(let attempt = 0; !(lateJournal as any).releaseLock && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10))
        if(!(lateJournal as any).releaseLock) throw new Error("Recovery lock was not acquired")
        ;(lateJournal as any).releaseLock()
        await (lateJournal as any).lock
      }
      await deleteRecoveredSession(lateId)
      lateHost.publish({kind: "pointer", learner: "ada", pointer: {x: 1, y: 1}})
      await lateJournal.flush()
      if(!lateError || (await listRecoveredSessions()).some(item => item.id === lateId)) throw new Error("Deleted recovery was recreated by a late write")
    }
    finally { await lateJournal.finish(); lateHost.destroy(); await deleteRecoveredSession(lateId) }
  }
  finally {
    frame.remove()
    await deleteRecoveredSession(id)
    await directory.removeEntry(filename).catch(() => {})
  }
}
