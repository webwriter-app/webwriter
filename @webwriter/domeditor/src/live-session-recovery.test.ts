// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {LiveSession} from "./live-session"
import {LiveSessionRecovery, listRecoveredSessions} from "./live-session-recovery"

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it("reports unavailable local recovery storage without interrupting the live session", async () => {
  vi.stubGlobal("indexedDB", undefined)
  const host = new LiveSession({id: "recovery-storage-error", role: "host", baseHTML: "<p>Start</p>"})
  const error = vi.fn()
  const recovery = new LiveSessionRecovery(host, Date.now(), "Test", error)
  try {
    await recovery.flush()
    expect(error).toHaveBeenCalledOnce()
    expect(error.mock.calls[0][0].message).toContain("unavailable")
    expect(host.publish({kind: "pointer", learner: "ada", pointer: {x: .2, y: .3}})).toMatchObject({kind: "pointer"})
    await recovery.finish()
    expect(error).toHaveBeenCalledOnce()
    await expect(listRecoveredSessions()).rejects.toThrow("unavailable")
  }
  finally { host.destroy() }
})
