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
