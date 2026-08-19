// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {
  AI_KEYS_STORAGE_KEY,
  AI_PROVIDERS_STORAGE_KEY,
  AIProviderStore,
  DEFAULT_AI_INSTRUCTIONS,
  createAIProvider,
} from "./ai-provider"

afterEach(() => localStorage.clear())

describe("AIProviderStore", () => {
  it("defaults new providers to document-editing instructions", () => {
    expect(createAIProvider("openai").customInstructions).toBe(DEFAULT_AI_INSTRUCTIONS)
  })

  it("persists provider metadata without persisting a tab-only API key", () => {
    const store = new AIProviderStore(localStorage)
    const provider = createAIProvider("openai")
    store.vault.setMemory(provider.id, "test-secret-value")
    store.upsert(provider)

    expect(localStorage.getItem(AI_PROVIDERS_STORAGE_KEY)).toContain("api.openai.com")
    expect(localStorage.getItem(AI_PROVIDERS_STORAGE_KEY)).not.toContain("test-secret-value")
    expect(localStorage.getItem(AI_KEYS_STORAGE_KEY)).toBeNull()

    const reloaded = new AIProviderStore(localStorage)
    expect(reloaded.providers).toHaveLength(1)
    expect(reloaded.keyFor(reloaded.providers[0])).toBeUndefined()
  })

  it("persists only encrypted key material and requires the passphrase after locking", async () => {
    const store = new AIProviderStore(localStorage)
    const provider = {...createAIProvider("openai"), keyMode: "encrypted" as const}
    await store.vault.setEncrypted(provider.id, "encrypted-test-secret", "correct horse battery")
    store.upsert(provider)

    const serialized = localStorage.getItem(AI_KEYS_STORAGE_KEY)!
    expect(serialized).not.toContain("encrypted-test-secret")
    expect(serialized).not.toContain("correct horse battery")
    expect(serialized).toContain("AES-GCM")

    store.vault.lock(provider.id)
    expect(store.credentialStatus(provider)).toBe("locked")
    await expect(store.vault.unlock(provider.id, "wrong passphrase")).rejects.toThrow("incorrect")
    await expect(store.vault.unlock(provider.id, "correct horse battery")).resolves.toBe("encrypted-test-secret")
    expect(store.credentialStatus(provider)).toBe("available")
  })

  it("creates, updates, selects, and deletes compatible endpoints", () => {
    const store = new AIProviderStore(localStorage)
    const local = store.upsert({...createAIProvider("ollama"), models: ["local-model"], defaultModel: "local-model"})
    const custom = store.upsert({...createAIProvider("custom"), name: "Lab", baseUrl: "https://ai.example/v1"})

    expect(store.providers.map(provider => provider.name)).toEqual(["Ollama", "Lab"])
    expect(store.activeProviderId).toBe(custom.id)

    store.setActive(local.id)
    expect(store.activeProviderId).toBe(local.id)
    store.upsert({...local, name: "Local Ollama"})
    expect(store.provider(local.id)?.name).toBe("Local Ollama")

    store.remove(local.id)
    expect(store.providers).toEqual([expect.objectContaining({id: custom.id})])
  })

  it("rolls back in-memory selection when provider persistence fails", () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error("storage full") },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } as unknown as Storage
    const store = new AIProviderStore(storage)
    const provider = createAIProvider("openai")
    expect(() => store.upsert(provider)).toThrow("storage full")
    expect(store.providers).toEqual([])
    expect(store.activeProviderId).toBeNull()
  })

  it("uses backend provider management without copying credentials into browser storage", async () => {
    const provider = {
      ...createAIProvider("openai"),
      id: "server-openai",
      managed: "backend" as const,
      inferenceUrl: "http://localhost:1234/api/inference/providers/server-openai",
      credentialStatus: "available" as const,
    }
    const backend = {
      listAIProviders: async () => ({providers: [provider], activeProviderId: provider.id}),
      createAIProvider: async () => ({provider, activeProviderId: provider.id}),
      updateAIProvider: async (updated: typeof provider) => ({provider: updated, activeProviderId: updated.id}),
      deleteAIProvider: async () => undefined,
      setActiveAIProvider: async () => undefined,
    }
    const store = new AIProviderStore(localStorage)

    await store.connectBackend(backend)
    expect(store.activeProvider).toEqual(expect.objectContaining({managed: "backend"}))
    expect(store.credentialStatus(provider)).toBe("available")
    expect(store.keyFor(provider)).toBe("")

    await store.save({...provider, name: "Server OpenAI"}, "server-secret")
    expect(store.activeProvider?.name).toBe("Server OpenAI")
    expect(localStorage.getItem(AI_PROVIDERS_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(AI_KEYS_STORAGE_KEY)).toBeNull()
  })

  it("keeps the prior backend provider active when activation fails", async () => {
    const first = {...createAIProvider("openai"), id: "first", managed: "backend" as const}
    const second = {...createAIProvider("custom"), id: "second", managed: "backend" as const}
    const backend = {
      listAIProviders: async () => ({providers: [first, second], activeProviderId: first.id}),
      createAIProvider: async () => ({provider: first, activeProviderId: first.id}),
      updateAIProvider: async () => ({provider: first, activeProviderId: first.id}),
      deleteAIProvider: async () => undefined,
      setActiveAIProvider: async () => { throw new Error("backend unavailable") },
    }
    const store = new AIProviderStore(localStorage)
    await store.connectBackend(backend)

    await expect(store.activate(second.id)).rejects.toThrow("backend unavailable")
    expect(store.activeProviderId).toBe(first.id)
  })
})
