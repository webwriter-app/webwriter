// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {cloudSignInRedirectURL, isCloudSignInCallback} from "./cloud-sign-in"

describe("cloud sign-in callback", () => {
  it("returns to the editor of the app's own origin", () => {
    expect(cloudSignInRedirectURL("https://webwriter.example")).toBe("https://webwriter.example/editor/")
  })

  it("recognizes the provider's return with a code or an error on the editor page only", () => {
    const at = (path: string) => new URL(path, "https://webwriter.example")
    expect(isCloudSignInCallback(at("/editor/?code=abc&state=xyz&session_state=s"))).toBe(true)
    expect(isCloudSignInCallback(at("/editor/?error=access_denied&state=xyz"))).toBe(true)
    expect(isCloudSignInCallback(at("/editor/?code=abc"))).toBe(false)
    expect(isCloudSignInCallback(at("/editor/?open=doc&state=xyz"))).toBe(false)
    expect(isCloudSignInCallback(at("/?code=abc&state=xyz"))).toBe(false)
  })
})
