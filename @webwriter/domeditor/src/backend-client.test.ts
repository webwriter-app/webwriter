// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {BackendClient, probeDevelopmentBackend, type BackendSession} from "./backend-client"

const session: BackendSession = {
  kind: "webwriter-dev-server",
  version: 1,
  authentication: "none",
  user: {id: "local-development", name: "Local developer"},
  apiBaseUrl: "http://localhost:1234/api",
  collaborationUrl: "ws://localhost:1234",
  adminUrl: "http://localhost:1234/admin",
  capabilities: ["documents", "collaboration", "inference", "providers"],
}

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {"Content-Type": "application/json"},
})

describe("development backend client", () => {
  it("recognizes the no-auth development server as an automatic login", async () => {
    const fetch = vi.fn().mockResolvedValue(response(session))

    await expect(probeDevelopmentBackend(undefined, fetch)).resolves.toEqual(session)
    expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      credentials: "omit",
      cache: "no-store",
    }))
  })

  it("binds the browser fetch method to its global object", async () => {
    const fetch = vi.fn(function(this: unknown) {
      if(this !== globalThis) throw new TypeError("Illegal invocation")
      return Promise.resolve(response(session))
    })
    vi.stubGlobal("fetch", fetch)
    try {
      await expect(probeDevelopmentBackend()).resolves.toEqual(session)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it("ignores unrelated JSON services while probing", async () => {
    const fetch = vi.fn().mockResolvedValue(response({name: "some other server"}))

    await expect(probeDevelopmentBackend(undefined, fetch)).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("rejects non-loopback session endpoints before making API calls", async () => {
    const unsafe = {...session, apiBaseUrl: "https://attacker.example/api"}
    await expect(probeDevelopmentBackend(undefined, vi.fn().mockResolvedValue(response(unsafe)))).resolves.toBeNull()
    expect(() => new BackendClient(unsafe, vi.fn())).toThrow("unsafe URL")
    expect(() => new BackendClient({...session, collaborationUrl: "ws://attacker.example"}, vi.fn())).toThrow("unsafe URL")
  })

  it("propagates cancellation instead of probing another backend candidate", async () => {
    const abort = new DOMException("The operation was aborted", "AbortError")
    const fetch = vi.fn().mockRejectedValue(abort)

    await expect(probeDevelopmentBackend(undefined, fetch)).rejects.toBe(abort)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("uses REST document endpoints", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({documents: [{id: "one", title: "One"}]}))
      .mockResolvedValueOnce(response({document: {id: "one", title: "Updated"}}))
    const client = new BackendClient(session, fetch)

    await expect(client.listDocuments()).resolves.toEqual([{id: "one", title: "One"}])
    await client.updateDocument("one", {title: "Updated"})

    expect(fetch.mock.calls[1]).toEqual([
      "http://localhost:1234/api/documents/one",
      expect.objectContaining({method: "PATCH", body: JSON.stringify({title: "Updated"})}),
    ])
  })

  it("reports network failures and invalid JSON with backend context", async () => {
    const networkClient = new BackendClient(session, vi.fn().mockRejectedValue(new TypeError("fetch failed")))
    await expect(networkClient.listDocuments()).rejects.toThrow(
      "Could not reach the development server. fetch failed",
    )

    const invalidJSON = new Response("not json", {status: 502})
    const invalidJSONClient = new BackendClient(session, vi.fn().mockResolvedValue(invalidJSON))
    await expect(invalidJSONClient.listDocuments()).rejects.toThrow(
      "The development server returned invalid JSON (502)",
    )
  })

  it("surfaces nested API errors and safely encodes document ids", async () => {
    const fetch = vi.fn().mockResolvedValue(response({error: {message: "Document not found"}}, 404))
    const client = new BackendClient(session, fetch)

    await expect(client.getDocument("folder/item")).rejects.toThrow("Document not found")
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:1234/api/documents/folder%2Fitem",
      expect.any(Object),
    )
  })
})
