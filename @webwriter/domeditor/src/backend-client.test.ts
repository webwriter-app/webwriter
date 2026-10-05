// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {BackendClient, probeDevelopmentBackend, connectCloudService, discoverHostBackend, type BackendSession} from "./backend-client"

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

  it("probes the exact linked endpoint without falling back to another server", async () => {
    const linked = {...session, apiBaseUrl: "http://localhost:5678/nested/api"}
    const fetch = vi.fn().mockResolvedValue(response(linked))
    await expect(probeDevelopmentBackend(undefined, fetch, linked.apiBaseUrl)).resolves.toEqual(linked)
    expect(fetch.mock.calls[0][0].href).toBe("http://localhost:5678/nested/api/session")
    fetch.mockResolvedValue(response(session))
    await expect(probeDevelopmentBackend(undefined, fetch, linked.apiBaseUrl)).resolves.toBeNull()
    await expect(probeDevelopmentBackend(undefined, fetch, "https://attacker.example/api")).rejects.toThrow("unsafe URL")
    expect(fetch).toHaveBeenCalledTimes(2)
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

  it("recognizes AbortError by name across realms and error types", async () => {
    const abort = {name: "AbortError", message: "The operation was aborted"}
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

const cloudSession: BackendSession = {
  ...session, kind: "webwriter-cloud-service", authentication: "bearer",
  apiBaseUrl: "https://cloud.example/api", collaborationUrl: "wss://cloud.example",
  adminUrl: "https://cloud.example/admin", signInUrl: "https://cloud.example/api/sign-in",
  user: {id: "ada", name: "Ada"}, capabilities: ["documents"],
}
const cloudService = {id: "cloud", type: "url" as const, url: "https://cloud.example", username: "ada"}

describe("authenticated cloud services", () => {
  it("discovers sign-in, submits credentials once, and restores using only a bearer token", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({...cloudSession, user: null}))
      .mockResolvedValueOnce(response({session: cloudSession, accessToken: "opaque-token", expiresIn: 3600}))
      .mockResolvedValueOnce(response(cloudSession))
    const before = Date.now()
    const result = await connectCloudService(cloudService, {password: "password-never-saved", fetchImplementation: fetch})
    expect(result.service.accessToken).toBe("opaque-token")
    expect(result.service.expiresAt).toBeGreaterThanOrEqual(before + 3600000)
    expect(result.service).not.toHaveProperty("password")
    expect(fetch.mock.calls[1]).toEqual([cloudSession.signInUrl, expect.objectContaining({
      method: "POST", body: JSON.stringify({username: "ada", password: "password-never-saved"}),
      credentials: "omit", redirect: "error",
    })])
    await connectCloudService(result.service, {fetchImplementation: fetch})
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe("Bearer opaque-token")
    expect(fetch.mock.calls[2][1].body).toBeUndefined()
  })

  it("sends bearer authorization for documents and flags 401 even without JSON", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("Expired", {status: 401}))
    const unauthorized = vi.fn()
    const client = new BackendClient(cloudSession, fetch, "token", unauthorized)
    await expect(client.listDocuments()).rejects.toThrow("Sign in again")
    expect(unauthorized).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer token")
  })

  it("does not send credentials to an advertised sign-in endpoint on another origin", async () => {
    const fetch = vi.fn().mockResolvedValue(response({...cloudSession, signInUrl: "https://other.example/login"}))
    await expect(connectCloudService(cloudService, {password: "secret", fetchImplementation: fetch})).rejects.toThrow("sign-in endpoint")
    expect(fetch).toHaveBeenCalledOnce()
    expect(() => new BackendClient({...cloudSession, collaborationUrl: "wss://other.example"})).toThrow("provider origin")
  })

  it("requires a new access token after password sign-in and rejects expired saved tokens before fetching", async () => {
    const fetch = vi.fn().mockImplementation(async() => response(cloudSession))
    await expect(connectCloudService({...cloudService, accessToken: "old"}, {password: "secret", fetchImplementation: fetch})).rejects.toThrow("Sign in")
    fetch.mockClear()
    await expect(connectCloudService({...cloudService, accessToken: "old", expiresAt: Date.now() - 1}, {fetchImplementation: fetch})).rejects.toThrow("Sign in")
    expect(fetch).not.toHaveBeenCalled()
  })

  it("validates saved tokens against the service and supports the no-auth dev server", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response(session))
    await expect(connectCloudService({...cloudService, accessToken: "revoked"}, {fetchImplementation: fetch})).rejects.toThrow("Sign in")
    const dev = await connectCloudService({...cloudService, url: session.apiBaseUrl}, {fetchImplementation: fetch})
    expect(dev.service.authentication).toBe("none")
    expect(fetch.mock.calls[1][0]).toBe("http://localhost:1234/api/session")
  })

  it("discovers public metadata on the current host and ignores a different advertised origin", async () => {
    const origin = location.origin
    const metadata = {...cloudSession, apiBaseUrl: `${origin}/api`, user: null,
      signInUrl: `${origin}/api/sign-in`, adminUrl: `${origin}/admin`, collaborationUrl: origin.replace(/^http/, "ws")}
    const fetch = vi.fn().mockResolvedValueOnce(response(metadata)).mockResolvedValueOnce(response(cloudSession))
    expect(await discoverHostBackend(undefined, fetch)).toMatchObject({kind: "webwriter-cloud-service"})
    expect(new URL(fetch.mock.calls[0][0]).origin).toBe(origin)
    expect(await discoverHostBackend(undefined, fetch)).toBeNull()
  })
})
