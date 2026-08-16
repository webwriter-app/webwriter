export type AIKeyMode = "memory" | "encrypted"
export type AIProviderAuth = "bearer" | "api-key" | "x-api-key" | "none"
export type AIProviderPreset = "openai" | "ollama" | "lm-studio" | "custom"

export type AIProviderConfig = {
  id: string
  name: string
  preset: AIProviderPreset
  baseUrl: string
  auth: AIProviderAuth
  keyMode: AIKeyMode
  models: string[]
  defaultModel: string
  customInstructions?: string
}

export type AIProviderCredentialStatus = "not-required" | "available" | "locked" | "missing"

type PersistedProviders = {
  version: 1
  activeProviderId: string | null
  providers: AIProviderConfig[]
}

type EncryptedSecret = {
  version: 1
  algorithm: "AES-GCM"
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

type PersistedSecrets = Record<string, EncryptedSecret>

export const AI_PROVIDERS_STORAGE_KEY = "webwriter.ai.providers.v1"
export const AI_KEYS_STORAGE_KEY = "webwriter.ai.keys.v1"

const encryptionIterations = 310_000
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const arrayBuffer = (bytes: Uint8Array) => bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
) as ArrayBuffer

const safeLocalStorage = () => {
  try {
    return globalThis.localStorage ?? null
  }
  catch {
    return null
  }
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ""
  for(const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const base64ToBytes = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for(let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const parseStorage = <T>(storage: Storage | null, key: string, fallback: T): T => {
  if(!storage) return fallback
  try {
    const serialized = storage.getItem(key)
    return serialized ? JSON.parse(serialized) as T : fallback
  }
  catch {
    return fallback
  }
}

const writeStorage = (storage: Storage | null, key: string, value: unknown) => {
  if(!storage) return
  storage.setItem(key, JSON.stringify(value))
}

const randomId = () => globalThis.crypto?.randomUUID?.()
  ?? `ai-provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

const uniqueModels = (models: Iterable<string>) => [...new Set(
  [...models].map(model => model.trim()).filter(Boolean),
)]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const validBaseUrl = (value: string) => {
  const url = new URL(value)
  if(url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("The endpoint must use HTTP or HTTPS")
  }
  if(url.username || url.password) throw new TypeError("Endpoint URLs cannot contain credentials")
  url.hash = ""
  url.search = ""
  return url.toString().replace(/\/$/, "")
}

export const normalizeAIProvider = (value: AIProviderConfig): AIProviderConfig => {
  const id = value.id.trim() || randomId()
  const name = value.name.trim()
  if(!name) throw new TypeError("Enter a provider name")
  const baseUrl = validBaseUrl(value.baseUrl.trim())
  const models = uniqueModels(value.models)
  const defaultModel = value.defaultModel.trim() || models[0] || ""
  if(defaultModel && !models.includes(defaultModel)) models.unshift(defaultModel)
  const customInstructions = value.customInstructions?.trim()
  return {
    id,
    name,
    preset: ["openai", "ollama", "lm-studio", "custom"].includes(value.preset)
      ? value.preset
      : "custom",
    baseUrl,
    auth: value.auth === "none" || value.auth === "api-key" || value.auth === "x-api-key"
      ? value.auth
      : "bearer",
    keyMode: value.keyMode === "encrypted" ? "encrypted" : "memory",
    models,
    defaultModel,
    ...(customInstructions ? {customInstructions} : {}),
  }
}

const storedProvider = (value: unknown): AIProviderConfig | null => {
  if(!isRecord(value)) return null
  try {
    return normalizeAIProvider({
      id: typeof value.id === "string" ? value.id : "",
      name: typeof value.name === "string" ? value.name : "",
      preset: typeof value.preset === "string" ? value.preset as AIProviderPreset : "custom",
      baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
      auth: value.auth === "none" || value.auth === "api-key" || value.auth === "x-api-key"
        ? value.auth
        : "bearer",
      keyMode: value.keyMode === "encrypted" ? "encrypted" : "memory",
      models: Array.isArray(value.models) ? value.models.filter(model => typeof model === "string") : [],
      defaultModel: typeof value.defaultModel === "string" ? value.defaultModel : "",
      customInstructions: typeof value.customInstructions === "string" ? value.customInstructions : undefined,
    })
  }
  catch {
    return null
  }
}

export function createAIProvider(preset: AIProviderPreset): AIProviderConfig {
  const shared = {
    id: randomId(),
    preset,
    keyMode: "memory" as const,
    customInstructions: "",
  }
  if(preset === "openai") return {
    ...shared,
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    auth: "bearer",
    models: ["gpt-5.6-luna"],
    defaultModel: "gpt-5.6-luna",
  }
  if(preset === "ollama") return {
    ...shared,
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    auth: "none",
    models: [],
    defaultModel: "",
  }
  if(preset === "lm-studio") return {
    ...shared,
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    auth: "none",
    models: [],
    defaultModel: "",
  }
  return {
    ...shared,
    name: "Custom endpoint",
    baseUrl: "http://localhost:8080/v1",
    auth: "bearer",
    models: [],
    defaultModel: "",
  }
}

export class AIKeyVault {
  private readonly unlocked = new Map<string, string>()

  constructor(private readonly storage: Storage | null = safeLocalStorage()) {}

  private records() {
    const parsed = parseStorage<unknown>(this.storage, AI_KEYS_STORAGE_KEY, {})
    if(!isRecord(parsed)) return {} as PersistedSecrets
    return Object.fromEntries(Object.entries(parsed).filter(([, record]) => {
      if(!isRecord(record)) return false
      return record.version === 1
        && record.algorithm === "AES-GCM"
        && typeof record.iterations === "number"
        && typeof record.salt === "string"
        && typeof record.iv === "string"
        && typeof record.ciphertext === "string"
    })) as PersistedSecrets
  }

  private writeRecords(records: PersistedSecrets) {
    writeStorage(this.storage, AI_KEYS_STORAGE_KEY, records)
  }

  private async deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
    if(!globalThis.crypto?.subtle) throw new Error("Encrypted key storage is unavailable in this browser")
    const material = await globalThis.crypto.subtle.importKey(
      "raw",
      textEncoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    )
    return globalThis.crypto.subtle.deriveKey(
      {name: "PBKDF2", hash: "SHA-256", salt: arrayBuffer(salt), iterations},
      material,
      {name: "AES-GCM", length: 256},
      false,
      ["encrypt", "decrypt"],
    )
  }

  get(providerId: string) {
    return this.unlocked.get(providerId)
  }

  hasEncrypted(providerId: string) {
    return providerId in this.records()
  }

  setMemory(providerId: string, secret: string) {
    const value = secret.trim()
    if(value) this.unlocked.set(providerId, value)
    else this.unlocked.delete(providerId)
  }

  async setEncrypted(providerId: string, secret: string, passphrase: string) {
    const value = secret.trim()
    if(!value) throw new TypeError("Enter an API key")
    if(passphrase.length < 8) throw new TypeError("Use a passphrase with at least 8 characters")
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
    const key = await this.deriveKey(passphrase, salt, encryptionIterations)
    const encrypted = await globalThis.crypto.subtle.encrypt(
      {name: "AES-GCM", iv: arrayBuffer(iv)},
      key,
      arrayBuffer(textEncoder.encode(value)),
    )
    const records = this.records()
    records[providerId] = {
      version: 1,
      algorithm: "AES-GCM",
      iterations: encryptionIterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    }
    this.writeRecords(records)
    this.unlocked.set(providerId, value)
  }

  async unlock(providerId: string, passphrase: string) {
    const record = this.records()[providerId]
    if(!record) throw new Error("No encrypted API key is stored for this provider")
    try {
      const salt = base64ToBytes(record.salt)
      const iv = base64ToBytes(record.iv)
      const ciphertext = base64ToBytes(record.ciphertext)
      const key = await this.deriveKey(passphrase, salt, record.iterations)
      const decrypted = await globalThis.crypto.subtle.decrypt(
        {name: "AES-GCM", iv: arrayBuffer(iv)},
        key,
        arrayBuffer(ciphertext),
      )
      const value = textDecoder.decode(decrypted)
      this.unlocked.set(providerId, value)
      return value
    }
    catch {
      throw new Error("The passphrase is incorrect or the stored key is damaged")
    }
  }

  lock(providerId: string) {
    this.unlocked.delete(providerId)
  }

  removeEncrypted(providerId: string) {
    const records = this.records()
    if(!(providerId in records)) return
    delete records[providerId]
    this.writeRecords(records)
  }

  remove(providerId: string) {
    this.unlocked.delete(providerId)
    this.removeEncrypted(providerId)
  }
}

export class AIProviderStore extends EventTarget {
  readonly vault: AIKeyVault
  private providerList: AIProviderConfig[] = []
  private selectedProviderId: string | null = null

  constructor(private readonly storage: Storage | null = safeLocalStorage()) {
    super()
    this.vault = new AIKeyVault(storage)
    this.load()
  }

  private load() {
    const parsed = parseStorage<unknown>(this.storage, AI_PROVIDERS_STORAGE_KEY, {})
    if(!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.providers)) return
    this.providerList = parsed.providers.flatMap(provider => {
      const normalized = storedProvider(provider)
      return normalized ? [normalized] : []
    })
    const active = typeof parsed.activeProviderId === "string" ? parsed.activeProviderId : null
    this.selectedProviderId = this.providerList.some(provider => provider.id === active)
      ? active
      : this.providerList[0]?.id ?? null
  }

  private persist() {
    const value: PersistedProviders = {
      version: 1,
      activeProviderId: this.selectedProviderId,
      providers: this.providerList,
    }
    writeStorage(this.storage, AI_PROVIDERS_STORAGE_KEY, value)
  }

  private notify() {
    this.dispatchEvent(new Event("change"))
  }

  get providers() {
    return this.providerList.map(provider => ({...provider, models: [...provider.models]}))
  }

  get activeProviderId() {
    return this.selectedProviderId
  }

  get activeProvider() {
    return this.providerList.find(provider => provider.id === this.selectedProviderId)
  }

  provider(providerId: string) {
    return this.providerList.find(provider => provider.id === providerId)
  }

  upsert(provider: AIProviderConfig) {
    const normalized = normalizeAIProvider(provider)
    const index = this.providerList.findIndex(candidate => candidate.id === normalized.id)
    this.providerList = index < 0
      ? [...this.providerList, normalized]
      : this.providerList.map(candidate => candidate.id === normalized.id ? normalized : candidate)
    this.selectedProviderId = normalized.id
    this.persist()
    this.notify()
    return normalized
  }

  remove(providerId: string) {
    if(!this.providerList.some(provider => provider.id === providerId)) return
    this.providerList = this.providerList.filter(provider => provider.id !== providerId)
    this.vault.remove(providerId)
    if(this.selectedProviderId === providerId) this.selectedProviderId = this.providerList[0]?.id ?? null
    this.persist()
    this.notify()
  }

  setActive(providerId: string) {
    if(!this.providerList.some(provider => provider.id === providerId)) return
    this.selectedProviderId = providerId
    this.persist()
    this.notify()
  }

  credentialStatus(provider: AIProviderConfig): AIProviderCredentialStatus {
    if(provider.auth === "none") return "not-required"
    if(this.vault.get(provider.id)) return "available"
    if(this.vault.hasEncrypted(provider.id)) return "locked"
    return "missing"
  }

  keyFor(provider: AIProviderConfig) {
    return provider.auth === "none" ? "" : this.vault.get(provider.id)
  }
}
