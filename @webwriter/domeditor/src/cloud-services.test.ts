// @vitest-environment node
import {describe, expect, it} from "vitest"
import {
  EDUMIX_URL,
  cloudServiceExpired,
  cloudServiceURL,
  storedCloudServices,
  tokenExpiresAt,
} from "./cloud-services.js"

describe("cloudServiceURL", () => {
  it("accepts HTTPS providers and loopback HTTP, normalizing a trailing slash", () => {
    expect(cloudServiceURL("https://cloud.example/path/")).toBe("https://cloud.example/path")
    expect(cloudServiceURL("http://localhost:8080/api/")).toBe("http://localhost:8080/api")
    expect(cloudServiceURL("http://127.0.0.1:1234")).toBe("http://127.0.0.1:1234")
    expect(cloudServiceURL("http://[::1]:1234/")).toBe("http://[::1]:1234")
  })

  it.each([
    "http://cloud.example/api",
    "http://localhost.evil.example/api",
    "ftp://localhost/api",
    "javascript:alert(1)",
    "https://user:password@cloud.example/api",
    "https://user@cloud.example/api",
    "https://cloud.example/api?tenant=one",
    "https://cloud.example/api#section",
  ])("rejects unsafe provider URL %s", value => {
    expect(() => cloudServiceURL(value)).toThrow(TypeError)
  })
})

describe("storedCloudServices", () => {
  it("persists only allowed fields, strips passwords and unknown secrets, and normalizes the Edumix preset", () => {
    const stored = storedCloudServices([
      {
        id: "edumix",
        type: "edumix",
        url: "https://attacker.example/override",
        username: "ada",
        password: "never-store-this",
        refreshToken: "also-secret",
        extra: {privateKey: "secret"},
        accessToken: "opaque-access-token",
        expiresAt: 1_800_000_000_000,
        authentication: "none",
      },
      {id: "custom", type: "url", url: "https://docs.example/api/", username: "grace", apiKey: "secret"},
    ])

    expect(stored).toEqual([
      {
        id: "edumix",
        type: "edumix",
        url: EDUMIX_URL,
        username: "ada",
        accessToken: "opaque-access-token",
        expiresAt: 1_800_000_000_000,
        authentication: "none",
      },
      {id: "custom", type: "url", url: "https://docs.example/api", username: "grace"},
    ])
    expect(JSON.stringify(stored)).not.toMatch(/password|refreshToken|privateKey|apiKey|attacker/)
  })

  it("filters invalid providers and keeps only the first occurrence of each ID", () => {
    expect(storedCloudServices([
      null,
      {id: "", type: "url", url: "https://ok.example", username: "ada"},
      {id: "bad-type", type: "other", url: "https://ok.example", username: "ada"},
      {id: "bad-url", type: "url", url: "http://remote.example", username: "ada"},
      {id: "missing-user", type: "url", url: "https://ok.example"},
      {id: "duplicate", type: "url", url: "https://first.example", username: "first"},
      {id: "duplicate", type: "url", url: "https://second.example", username: "second"},
      {id: "valid", type: "url", url: "https://ok.example", username: "ada", accessToken: "", expiresAt: Number.NaN},
    ])).toEqual([
      {id: "duplicate", type: "url", url: "https://first.example", username: "first"},
      {id: "valid", type: "url", url: "https://ok.example", username: "ada"},
    ])
    expect(storedCloudServices({})).toEqual([])
  })
})

const jwtWithPayload = (payload: object) => {
  const encoded = btoa(JSON.stringify(payload)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
  return `header.${encoded}.signature`
}

describe("cloud service token expiry", () => {
  it("reads finite JWT exp values and ignores opaque or malformed tokens", () => {
    expect(tokenExpiresAt(jwtWithPayload({exp: 1_800_000_000}))).toBe(1_800_000_000_000)
    expect(tokenExpiresAt("opaque-token")).toBeUndefined()
    expect(tokenExpiresAt(jwtWithPayload({exp: "1800000000"}))).toBeUndefined()
    expect(tokenExpiresAt(jwtWithPayload({exp: Number.POSITIVE_INFINITY}))).toBeUndefined()
    expect(tokenExpiresAt("header.not-json.signature")).toBeUndefined()
  })

  it("uses the explicit expiry when present and treats the expiry boundary as expired", () => {
    const token = jwtWithPayload({exp: 100})
    expect(cloudServiceExpired({id: "one", type: "url", url: "https://x.example", username: "u", accessToken: token}, 99_999)).toBe(false)
    expect(cloudServiceExpired({id: "one", type: "url", url: "https://x.example", username: "u", accessToken: token}, 100_000)).toBe(true)
    expect(cloudServiceExpired({id: "one", type: "url", url: "https://x.example", username: "u", accessToken: token, expiresAt: 200_000}, 100_000)).toBe(false)
    expect(cloudServiceExpired({id: "one", type: "url", url: "https://x.example", username: "u", accessToken: "opaque"}, 100_000)).toBe(false)
  })
})
