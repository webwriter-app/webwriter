// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {cloudSignInCallbackURL} from "./cloud-sign-in"

describe("cloud sign-in window", () => {
  it("returns from the provider to the callback page of the app's own origin", () => {
    expect(cloudSignInCallbackURL("https://webwriter.example")).toBe("https://webwriter.example/sign-in-callback.html")
  })
})
