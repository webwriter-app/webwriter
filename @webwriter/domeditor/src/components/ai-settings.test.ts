// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {AIProviderStore, createAIProvider} from "../ai-provider"
import {listAIModels} from "../ai-client"
import {AISettingsDialog} from "./ai-settings"

vi.mock("../ai-client", () => ({listAIModels: vi.fn()}))

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("AI provider settings", () => {
  it("shows collapsed provider cards, activates by radio, and preserves other cards' edits when saving or deleting", async () => {
    const store = new AIProviderStore(null)
    const first = store.upsert({...createAIProvider("custom"), name: "First provider", auth: "none", models: ["first-model"]})
    const second = store.upsert({...createAIProvider("custom"), name: "Second provider", auth: "none", models: ["second-model"]})
    await store.activate(first.id)
    const settings = new AISettingsDialog()
    settings.embedded = true
    settings.store = store
    settings.open = true
    document.body.append(settings)
    await settings.updateComplete
    const cards = [...settings.shadowRoot!.querySelectorAll<HTMLDetailsElement>(".provider-card")]
    expect(cards).toHaveLength(2)
    expect(cards.every(card => !card.open)).toBe(true)
    expect(cards[0].querySelector<HTMLInputElement>('input[type="radio"]')!.checked).toBe(true)
    const editors = cards.map(card => card.querySelector("ai-settings-dialog")!)
    for(const [index, card] of cards.entries()) {
      card.open = true
      card.dispatchEvent(new Event("toggle"))
      await settings.updateComplete
      await editors[index].updateComplete
      expect(editors[index].shadowRoot!.querySelector("form")).not.toBeNull()
    }
    const nameInput = (editor: AISettingsDialog) => editor.shadowRoot!.querySelector<HTMLInputElement>('input:not([inputmode="url"])')!
    nameInput(editors[1]).value = "Unsaved second name"
    nameInput(editors[1]).dispatchEvent(new InputEvent("input", {bubbles: true}))
    cards[1].querySelector<HTMLInputElement>('input[type="radio"]')!.click()
    await vi.waitFor(() => expect(store.activeProviderId).toBe(second.id))
    expect(nameInput(editors[1]).value).toBe("Unsaved second name")
    nameInput(editors[0]).value = "Saved first name"
    nameInput(editors[0]).dispatchEvent(new InputEvent("input", {bubbles: true}))
    await (editors[0] as any).save({preventDefault() {}})
    await settings.updateComplete
    expect(store.provider(first.id)!.name).toBe("Saved first name")
    expect(store.activeProviderId).toBe(second.id)
    expect(nameInput(editors[1]).value).toBe("Unsaved second name")
    vi.mocked(listAIModels).mockResolvedValue(["refreshed-model"])
    await (editors[0] as any).fetchModels()
    expect(store.activeProviderId).toBe(second.id)
    await (editors[0] as any).removeProvider()
    await (editors[0] as any).removeProvider()
    await settings.updateComplete
    expect(settings.shadowRoot!.querySelectorAll(".provider-card")).toHaveLength(1)
    expect(settings.shadowRoot!.querySelector(".provider-card ai-settings-dialog")).toBe(editors[1])
    expect(nameInput(editors[1]).value).toBe("Unsaved second name")
  })

  it("restores the active radio when provider activation fails", async () => {
    const store = new AIProviderStore(null)
    const first = store.upsert({...createAIProvider("custom"), name: "First"})
    store.upsert({...createAIProvider("custom"), name: "Second"})
    await store.activate(first.id)
    const settings = new AISettingsDialog()
    settings.embedded = true
    settings.store = store
    settings.open = true
    document.body.append(settings)
    await settings.updateComplete
    vi.spyOn(store, "activate").mockRejectedValue(new Error("Could not activate provider"))
    const radios = [...settings.shadowRoot!.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    radios[1].click()
    await vi.waitFor(() => expect(settings.shadowRoot!.textContent).toContain("Could not activate provider"))
    expect(radios[0].checked).toBe(true)
    expect(radios[1].checked).toBe(false)
    expect(settings.shadowRoot!.querySelectorAll<HTMLDetailsElement>(".provider-card[open]")).toHaveLength(0)
  })

  it("preserves Name and key storage edits made while model discovery is pending", async () => {
    vi.useFakeTimers()
    let resolveModels!: (models: string[]) => void
    vi.mocked(listAIModels).mockReturnValue(new Promise(resolve => {resolveModels = resolve}))

    const store = new AIProviderStore(null)
    const provider = store.upsert({...createAIProvider("openai"), name: "Initial name"})
    const settings = new AISettingsDialog()
    settings.store = store
    document.body.append(settings)
    settings.show()
    await settings.updateComplete
    const close = settings.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Close AI settings"]')!
    expect(close.textContent?.trim()).toBe("")
    expect(close.querySelector("svg")).not.toBeNull()

    const fetch = (settings as unknown as {fetchModels: () => Promise<void>}).fetchModels()
    await Promise.resolve()
    const name = settings.shadowRoot!.querySelector<HTMLInputElement>('input:not([inputmode="url"])')!
    name.value = "Updated name"
    name.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
    const keyMode = settings.shadowRoot!.querySelector<HTMLSelectElement>('select option[value="encrypted"]')!.parentElement as HTMLSelectElement
    keyMode.value = "encrypted"
    keyMode.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    resolveModels(["model-new"])
    await fetch
    await settings.updateComplete

    const draft = (settings as unknown as {draft: typeof provider}).draft
    expect(draft.name).toBe("Updated name")
    expect(draft.keyMode).toBe("encrypted")
    expect(draft.models).toEqual(["model-new"])
  })

  it("preserves edits made while a backend saves the fetched model list", async () => {
    vi.useFakeTimers()
    let finishFinalSave!: () => void
    const finalSave = new Promise<void>(resolve => {finishFinalSave = resolve})
    const provider = {...createAIProvider("openai"), name: "Backend provider", managed: "backend" as const}
    let saveCount = 0
    const backend = {
      listAIProviders: async () => ({providers: [provider], activeProviderId: provider.id}),
      createAIProvider: async (value: typeof provider) => ({provider: value, activeProviderId: provider.id}),
      updateAIProvider: async (value: typeof provider) => {
        saveCount++
        if(saveCount === 2) await finalSave
        return {provider: value, activeProviderId: provider.id}
      },
      deleteAIProvider: async () => {},
      setActiveAIProvider: async () => {},
    }
    const store = new AIProviderStore(null)
    await store.connectBackend(backend)
    vi.mocked(listAIModels).mockResolvedValue(["backend-model"])

    const settings = new AISettingsDialog()
    settings.store = store
    document.body.append(settings)
    settings.show()
    await settings.updateComplete

    const fetch = (settings as unknown as {fetchModels: () => Promise<void>}).fetchModels()
    await vi.waitFor(() => expect(saveCount).toBe(2))
    const name = settings.shadowRoot!.querySelector<HTMLInputElement>('input:not([inputmode="url"])')!
    name.value = "Edited during save"
    name.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
    ;(settings as unknown as {updateDraft: (key: string, value: string) => void}).updateDraft("keyMode", "encrypted")

    finishFinalSave()
    await fetch
    const draft = (settings as unknown as {draft: typeof provider}).draft
    expect(draft.name).toBe("Edited during save")
    expect(draft.keyMode).toBe("encrypted")
  })
})
