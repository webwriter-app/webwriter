import {describe, expect, it} from "vitest"
import {editorFrameOrigin, editorHostOrigin} from "./frame-origins"

const locationAt = (hostname: string) => ({hostname, protocol: "http:", port: "1234",
  origin: `http://${hostname}:1234`}) as Location

describe("dedicated editor origin", () => {
  it("pairs distinct loopback hostnames on the same port", () => {
    expect(editorFrameOrigin(locationAt("127.0.0.1"))).toBe("http://localhost:1234")
    expect(editorHostOrigin(locationAt("localhost"))).toBe("http://127.0.0.1:1234")
  })

  it("requires an explicit origin outside loopback development", () => {
    expect(() => editorFrameOrigin(locationAt("app.example"))).toThrow("VITE_EDITOR_ORIGIN")
  })
})
