// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {APP_SETTINGS_STORAGE_KEY, defaultAppSettings, loadAppSettings} from "./app-settings"

afterEach(() => localStorage.removeItem(APP_SETTINGS_STORAGE_KEY))

describe("app settings layout persistence", () => {
  it("loads Board as a saved default layout", () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({defaultLayout: "board"}))
    expect(loadAppSettings().defaultLayout).toBe("board")
  })

  it("accepts Board as a legacy template fallback", () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({defaultTemplate: "board"}))
    expect(loadAppSettings().defaultLayout).toBe("board")
  })

  it("keeps Document as the default layout", () => {
    expect(defaultAppSettings().defaultLayout).toBe("document")
  })
})
