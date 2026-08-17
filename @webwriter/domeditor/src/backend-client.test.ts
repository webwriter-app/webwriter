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

  it("ignores unrelated JSON services while probing", async () => {
    const fetch = vi.fn().mockResolvedValue(response({name: "some other server"}))

    await expect(probeDevelopmentBackend(undefined, fetch)).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
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
})
