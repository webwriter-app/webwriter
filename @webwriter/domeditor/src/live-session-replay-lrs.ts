import {LiveSessionReplayReader} from "./live-session-replay"
import {createLrsConnection, type LrsConfiguration} from "./live-session-lrs"
import {createXapiMapper} from "./live-session-xapi"

export type ReplayLrsProgress = {state: "sending" | "retrying", confirmed: number, message?: string}

/** Conservative comparison of the statement shapes emitted by WebWriter.
 * Ignore only LRS-assigned fields and xAPI representation differences. */
function comparableStatement(value: unknown) {
  if(!value || typeof value !== "object" || Array.isArray(value)) return ""
  const statement = JSON.parse(JSON.stringify(value))
  delete statement.stored; delete statement.authority; delete statement.version
  if(statement.verb && typeof statement.verb === "object") delete statement.verb.display
  if(statement.actor?.objectType === "Agent") delete statement.actor.objectType
  if(typeof statement.timestamp === "string") {
    const time = Date.parse(statement.timestamp)
    if(Number.isFinite(time)) statement.timestamp = time
  }
  const activity = (item: any) => {
    if(item && typeof item === "object" && !Array.isArray(item)) {
      if(item.objectType === "Activity") delete item.objectType
      delete item.definition
    }
  }
  activity(statement.object)
  const activities = statement.context?.contextActivities
  if(activities && typeof activities === "object") for(const group of Object.values(activities)) {
    if(Array.isArray(group)) group.forEach(activity)
    else activity(group)
  }
  const canonical = (item: any): any => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === "object" ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item
  return JSON.stringify(canonical(statement))
}

function waitForRetry(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if(signal.aborted) { reject(new DOMException("Delivery stopped", "AbortError")); return }
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve() }, milliseconds)
    const abort = () => { clearTimeout(timer); reject(new DOMException("Delivery stopped", "AbortError")) }
    signal.addEventListener("abort", abort, {once: true})
  })
}

/** Stream a replay to an LRS with idempotent single-statement PUT requests.
 * Restarting rereads the replay and resends the same IDs; no credentials or
 * delivery state need to be persisted. An LRS conflict is never ignored. */
export async function sendReplayToLrs(file: Blob, config: LrsConfiguration, signal: AbortSignal,
  progress: (value: ReplayLrsProgress) => void, send: typeof fetch = fetch) {
  const connection = createLrsConnection(config)
  const reader = await LiveSessionReplayReader.open(file)
  let confirmed = 0
  try {
    const map = await createXapiMapper(reader.metadata)
    let steps
    while((steps = await reader.readNext())) {
      for(const step of steps) {
        if(signal.aborted) throw new DOMException("Delivery stopped", "AbortError")
        const statement = await map(step) as {id: string} | null
        if(!statement) continue
        const url = new URL(connection.endpoint)
        url.searchParams.set("statementId", statement.id)
        const body = JSON.stringify(statement)
        let failures = 0
        while(true) {
          if(signal.aborted) throw new DOMException("Delivery stopped", "AbortError")
          const controller = new AbortController()
          const abort = () => controller.abort()
          signal.addEventListener("abort", abort, {once: true})
          const timeout = setTimeout(abort, 30000)
          let response: Response | undefined, error: unknown
          try {
            response = await send(url.href, {method: "PUT", redirect: "error", credentials: "omit", referrerPolicy: "no-referrer",
              headers: {"Content-Type": "application/json", "X-Experience-API-Version": "1.0.3", Authorization: connection.authorization},
              body, signal: controller.signal})
          }
          catch(caught) { error = caught }
          finally { clearTimeout(timeout); signal.removeEventListener("abort", abort) }
          if(signal.aborted) throw new DOMException("Delivery stopped", "AbortError")
          if(response?.status === 204) break
          if(response?.ok) {
            progress({state: "sending", confirmed})
            throw new Error(`The LRS returned an unexpected response (HTTP ${response.status}); the statement was not confirmed.`)
          }
          if(response && response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
            progress({state: "sending", confirmed})
            if(response.status === 409) {
              // Some LRSs return 409 even for an identical stored statement.
              // Confirm by reading it back; write-only keys cannot verify it.
              const lookup = new URL(url); lookup.searchParams.set("format", "exact")
              const verify = new AbortController(), abortVerify = () => verify.abort()
              signal.addEventListener("abort", abortVerify, {once: true})
              const verifyTimeout = setTimeout(abortVerify, 30000)
              let matches = false
              try {
                const existing = await send(lookup.href, {method: "GET", redirect: "error", credentials: "omit", referrerPolicy: "no-referrer",
                  headers: {"X-Experience-API-Version": "1.0.3", Authorization: connection.authorization}, signal: verify.signal})
                if(existing.ok) matches = comparableStatement(await existing.json()) === comparableStatement(statement)
              }
              catch { /* Report an unverifiable conflict below. */ }
              finally { clearTimeout(verifyTimeout); signal.removeEventListener("abort", abortVerify) }
              if(signal.aborted) throw new DOMException("Delivery stopped", "AbortError")
              if(matches) break
              throw new Error("The LRS reported a statement ID conflict that could not be verified. Delivery stopped.")
            }
            throw new Error(`LRS rejected the statement (HTTP ${response.status}). Check the endpoint and credentials.`)
          }
          failures++
          const message = response ? `LRS unavailable (HTTP ${response.status}). Retrying.`
            : `${error instanceof Error ? error.message : "LRS unavailable"}. Retrying.`
          progress({state: "retrying", confirmed, message})
          await waitForRetry(Math.min(30000, 1000 * 2 ** Math.min(failures - 1, 5)), signal)
        }
        confirmed++
        if(confirmed % 25 === 0) progress({state: "sending", confirmed})
      }
    }
    return confirmed
  }
  finally { reader.close() }
}
