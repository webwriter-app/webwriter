// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {
  createLocalPackageRequestHandler,
  localPackageFetchResponse,
  localPackageMimeType,
  localPackageRoutePrefix,
  localPackageUrl,
  type LocalPackageDirectoryHandle,
} from "./local-package-worker"

const namedError = (name: string) => Object.assign(new Error(name), {name})

function mockDirectory(files: Record<string, Blob>, failure?: {path?: string, error: Error}): LocalPackageDirectoryHandle {
  const descend = (prefix: string): LocalPackageDirectoryHandle => ({
    async getDirectoryHandle(name) {
      const path = `${prefix}${name}/`
      if(failure?.path === path) throw failure.error
      if(!Object.keys(files).some(file => file.startsWith(path))) throw namedError("NotFoundError")
      return descend(path)
    },
    async getFileHandle(name) {
      const path = `${prefix}${name}`
      if(failure?.path === path) throw failure.error
      const file = files[path]
      if(!file) throw namedError("NotFoundError")
      return {getFile: async() => file}
    },
  })
  return descend("")
}

describe("local package HTTP resource handler", () => {
  it("serves nested GET resources with a useful MIME type", async () => {
    const root = mockDirectory({"dist/widgets/widget.js": new Blob(["export {}"], {type: "text/plain"})})
    const handle = createLocalPackageRequestHandler(new Map([["demo", root]]))
    const response = await handle(new Request(localPackageUrl("demo", "dist/widgets/widget.js", 3)))

    expect(response?.status).toBe(200)
    expect(response?.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8")
    expect(response?.headers.get("Cache-Control")).toBe("no-store")
    expect(await response?.text()).toBe("export {}")
  })

  it("supports HEAD without returning a body", async () => {
    const root = mockDirectory({"dist/widget.css": new Blob([".widget{}"], {type: "text/css"})})
    const handle = createLocalPackageRequestHandler(new Map([["demo", root]]))
    const response = await handle(new Request(localPackageUrl("demo", "dist/widget.css"), {method: "HEAD"}))

    expect(response?.status).toBe(200)
    expect(response?.headers.get("Content-Type")).toBe("text/css; charset=utf-8")
    expect(response?.body).toBeNull()
  })

  it("rejects traversal and malformed reserved routes", async () => {
    const handle = createLocalPackageRequestHandler(new Map())
    const response = await handle(new Request(new URL("/__webwriter/local-packages/demo/%2e%2e/secrets.js", location.origin)))

    expect(response?.status).toBe(400)
  })

  it("maps permission, missing-file, and read failures to HTTP errors", async () => {
    const permissionRoot = mockDirectory({}, {path: "dist/", error: namedError("NotAllowedError")})
    const missingRoot = mockDirectory({})
    const readFailureRoot = mockDirectory({}, {path: "broken.js", error: new Error("disk error")})
    const handle = createLocalPackageRequestHandler(new Map([
      ["permission", permissionRoot],
      ["missing", missingRoot],
      ["broken", readFailureRoot],
    ]))

    expect((await handle(new Request(localPackageUrl("permission", "dist/widget.js"))))?.status).toBe(403)
    expect((await handle(new Request(localPackageUrl("missing", "dist/widget.js"))))?.status).toBe(404)
    expect((await handle(new Request(localPackageUrl("broken", "broken.js"))))?.status).toBe(500)
  })

  it("passes unrelated requests through to the normal fetch handler", async () => {
    const handle = createLocalPackageRequestHandler(new Map())
    expect(await handle(new Request("https://example.com/ordinary.js"))).toBeNull()
    expect(await handle(new Request("https://example.com/__webwriter/local-packages/demo/private.js"))).toBeNull()
  })

  it("only opts the service worker into reserved local-package requests", async () => {
    const handle = vi.fn(async () => new Response("local package"))
    const ordinaryRequest = new Request(new URL("/api/chat/completions", location.origin))
    const externalAIRequest = new Request("https://example.com/v1/chat/completions")

    expect(localPackageFetchResponse(ordinaryRequest, handle)).toBeNull()
    expect(localPackageFetchResponse(externalAIRequest, handle)).toBeNull()
    expect(handle).not.toHaveBeenCalled()

    const localResponse = localPackageFetchResponse(
      new Request(localPackageUrl("demo", "dist/widget.js")),
      handle,
    )
    expect(localResponse).not.toBeNull()
    expect(await localResponse).toMatchObject({status: 200})
    expect(handle).toHaveBeenCalledTimes(1)
  })
})

describe("local package URL and MIME helpers", () => {
  it("resolves app-relative routes when running inside an about:srcdoc iframe", () => {
    expect(localPackageRoutePrefix("/webwriter/", ["about:srcdoc"])).toBe("/webwriter/__webwriter/local-packages/")
  })

  it("keeps nested path segments and revision query values URL-safe", () => {
    const url = localPackageUrl("@scope/demo", "./dist/widgets/widget.js", 7, "https://editor.test")
    expect(url).toBe("https://editor.test/__webwriter/local-packages/%40scope%2Fdemo/dist/widgets/widget.js?revision=7")
  })

  it("falls back to the file MIME type or octet-stream", () => {
    expect(localPackageMimeType("asset.bin", "application/custom")).toBe("application/custom")
    expect(localPackageMimeType("asset.bin")).toBe("application/octet-stream")
  })
})
