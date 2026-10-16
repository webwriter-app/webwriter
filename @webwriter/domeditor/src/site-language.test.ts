// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import type {ReactiveControllerHost} from "lit"
import {language, preferredLanguage, setLanguage, siteLanguageKey, SiteLanguageController, t, translateSiteTree} from "./site-language"
import {siteTranslations} from "./site-translations"
import legalNotice from "../legal_notice/index.html?raw"

beforeEach(() => {
  localStorage.clear()
  setLanguage("en", false)
})

afterEach(() => {
  setLanguage("en", false)
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("preferredLanguage", () => {
  it("uses the first supported regional browser preference", () => {
    expect(preferredLanguage(["fr-CA", "de-DE"])).toBe("fr")
    expect(preferredLanguage(["xx-ZZ", "pt-BR"])).toBe("pt")
  })

  it("gives a valid query choice precedence over saved and browser choices", () => {
    expect(preferredLanguage(["fr-CA"], "es-MX", "de-AT")).toBe("de")
  })

  it("uses a valid saved choice when the query choice is invalid", () => {
    expect(preferredLanguage(["fr-CA"], "es-MX", "xx-ZZ")).toBe("es")
  })

  it("falls back through invalid choices to browser preferences and English", () => {
    expect(preferredLanguage(["xx-ZZ", "nl-NL"], "invalid", "unknown")).toBe("nl")
    expect(preferredLanguage(["xx-ZZ"], "invalid", "unknown")).toBe("en")
  })
})

describe("site translation", () => {
  it("translates all legal notice copy while preserving contact details", () => {
    const original = new DOMParser().parseFromString(legalNotice, "text/html")
    const walker = document.createTreeWalker(original, NodeFilter.SHOW_TEXT)
    const copy = ["Footer navigation", "All rights reserved."]
    while(walker.nextNode()) {
      const node = walker.currentNode as Text
      if(node.data.trim() && !node.parentElement?.closest("script, style, [translate=no]")) copy.push(node.data.trim())
    }
    for(const locale of ["de", "fr", "nl", "es", "pt", "it"]) {
      setLanguage(locale, false)
      for(const source of copy) expect(siteTranslations[locale]?.[source], `${locale}: ${source}`).toBeTruthy()
      const translated = original.cloneNode(true) as Document
      translateSiteTree(translated)
      expect(translated.querySelector("h1")?.textContent).toBe(t("Legal notice"))
      expect(translated.querySelector("address")?.textContent).toContain("Ahornstr. 55, 52074 Aachen")
      expect(translated.querySelector('[href="mailto:contact@webwriter.app"]')?.textContent).toBe("contact@webwriter.app")
    }
  })

  it("remembers an explicit choice, even when it is already the current language", () => {
    setLanguage("en")
    expect(localStorage.getItem(siteLanguageKey)).toBe("en")

    setLanguage("de")
    expect(localStorage.getItem(siteLanguageKey)).toBe("de")
  })

  it("does not overwrite the saved choice when switching without persistence", () => {
    setLanguage("de", false)
    expect(localStorage.getItem(siteLanguageKey)).toBeNull()

    setLanguage("nl")
    setLanguage("fr", false)
    expect(language()).toBe("fr")
    expect(localStorage.getItem(siteLanguageKey)).toBe("nl")
  })

  it("restores the explicit choice on a fresh page without saving browser detection", async () => {
    const originalURL = location.href
    history.replaceState(null, "", "/")
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-CA"])
    try {
      vi.resetModules()
      const detected = await import("./site-language")
      expect(detected.language()).toBe("fr")
      expect(localStorage.getItem(siteLanguageKey)).toBeNull()

      detected.setLanguage("it")
      vi.resetModules()
      const restored = await import("./site-language")
      expect(restored.language()).toBe("it")
      expect(localStorage.getItem(siteLanguageKey)).toBe("it")
    }
    finally { history.replaceState(null, "", originalURL) }
  })

  it("keeps the home page title tagline identical to the hero heading", () => {
    for(const locale of ["de", "fr", "nl", "es", "pt", "it"]) {
      setLanguage(locale, false)
      expect(t("WebWriter · Make it interactive.")).toBe(`WebWriter · ${t("Make it interactive.")}`)
    }
  })

  it("interpolates dynamic values after translating the source phrase", () => {
    setLanguage("fr", false)
    expect(t("Try {name}", {name: "Make it interactive."})).toBe("Essayer Make it interactive.")
  })

  it("switches language even when browser storage is blocked", () => {
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("Storage is unavailable")
    })

    setLanguage("nl")

    expect(setItem).toHaveBeenCalled()
    expect(language()).toBe("nl")
  })

  it("retranslates server copy while preserving links, markup, and translate=no content", () => {
    const root = document.createElement("section")
    root.innerHTML = '<p> <a href="/gallery/">Explore the widgets</a> </p><p aria-label="Page content">Skip to content</p><p translate="no"><strong>Make it interactive.</strong></p>'
    const link = root.querySelector("a")!
    const excluded = root.querySelector("[translate=no]")!

    setLanguage("fr", false)
    translateSiteTree(root)
    expect(root.querySelector("a")).toBe(link)
    expect(link.getAttribute("href")).toBe("/gallery/")
    expect(link.textContent).toBe("Découvrir les widgets")
    expect(root.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe("Contenu de la page")
    expect(excluded.textContent).toBe("Make it interactive.")

    setLanguage("de", false)
    translateSiteTree(root)
    expect(root.querySelector("a")).toBe(link)
    expect(link.textContent).toBe("Widgets entdecken")
    expect(excluded.innerHTML).toBe("<strong>Make it interactive.</strong>")
  })
})

describe("SiteLanguageController", () => {
  it("calls its optional callback and asks its host to update on language changes", () => {
    const requestUpdate = vi.fn()
    const addController = vi.fn()
    const host = {requestUpdate, addController} as unknown as ReactiveControllerHost
    const onChange = vi.fn()
    const controller = new SiteLanguageController(host, onChange)

    expect(addController).toHaveBeenCalledWith(controller)
    controller.hostConnected()
    window.dispatchEvent(new Event("site-language-change"))
    controller.hostDisconnected()

    expect(onChange).toHaveBeenCalledOnce()
    expect(requestUpdate).toHaveBeenCalledOnce()
  })
})
