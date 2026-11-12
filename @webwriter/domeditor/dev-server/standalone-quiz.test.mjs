import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {expect, it} from "vitest"
import {createDevServer} from "./server.mjs"

it("serves the demo result with conditional writes on the local app origin", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "standalone-quiz-test-"))
  const server = await createDevServer({port: 0, vite: false, dataDirectory, appOrigin: "", editorOrigin: ""})
  try {
    const {url} = await server.listen()
    const endpoint = `${url}/api/demos/standalone-quiz/result`
    const put = (body, precondition) => fetch(endpoint, {
      method: "PUT",
      headers: {"Content-Type": "application/json", ...precondition},
      body,
    })

    expect((await fetch(endpoint)).status).toBe(404)
    expect((await fetch(endpoint, {headers: {Origin: "http://localhost:1234"}})).status).toBe(403)
    expect((await put('{"choice":"invalid"}', {"If-None-Match": "*"})).status).toBe(400)
    expect((await put('{"choice":"true"}', {})).status).toBe(412)

    const firstBody = ' { "choice": "true" }\n'
    const first = await put(firstBody, {"If-None-Match": "*"})
    expect(first.status).toBe(201)
    const revision = first.headers.get("ETag")
    expect(revision).toMatch(/^".+"$/)
    const loaded = await fetch(endpoint)
    expect(loaded.headers.get("ETag")).toBe(revision)
    expect(loaded.headers.get("Cache-Control")).toBe("no-store")
    expect(await loaded.text()).toBe(firstBody)

    const updates = await Promise.all([
      put('{"choice":"false"}', {"If-Match": revision}),
      put('{"choice":""}', {"If-Match": revision}),
    ])
    expect(updates.map(response => response.status).sort()).toEqual([204, 412])
    const accepted = updates.find(response => response.status === 204)
    const updated = await fetch(endpoint)
    expect(updated.headers.get("ETag")).toBe(accepted.headers.get("ETag"))
    expect(updated.headers.get("ETag")).not.toBe(revision)
    expect((await updated.json()).choice).toBe(updates[0] === accepted ? "false" : "")
  }
  finally {
    await server.close()
    await rm(dataDirectory, {recursive: true, force: true})
  }
})
