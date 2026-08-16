// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import {AI_KEYS_STORAGE_KEY, AI_PROVIDERS_STORAGE_KEY, createAIProvider, type AIProviderStore} from "../ai-provider"

afterEach(() => {
  document.body.replaceChildren()
  localStorage.removeItem(AI_PROVIDERS_STORAGE_KEY)
  localStorage.removeItem(AI_KEYS_STORAGE_KEY)
  vi.restoreAllMocks()
})

const mountRibbon = async () => {
  const ribbon = new AppRibbon()
  document.body.append(ribbon)
  await ribbon.updateComplete
  return ribbon
}

const configureProvider = async (ribbon: AppRibbon) => {
  const store = (ribbon as unknown as {aiProviderStore: AIProviderStore}).aiProviderStore
  const provider = store.upsert({
    ...createAIProvider("ollama"),
    name: "Test provider",
    models: ["test-model"],
    defaultModel: "test-model",
  })
  await ribbon.updateComplete
  return provider
}

const assistantResponse = (content: string) => new Response(JSON.stringify({
  choices: [{message: {content}}],
}), {headers: {"content-type": "application/json"}})

describe("AI prompt ribbon", () => {
  it("renders a self-contained 100px–600px AI bar without an AI ribbon tab", async () => {
    const ribbon = await mountRibbon()
    const slot = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-bar-slot")!
    const panel = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-chat-panel")!
    const input = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    const submit = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!

    expect(getComputedStyle(slot).minWidth).toBe("100px")
    expect(getComputedStyle(slot).maxWidth).toBe("600px")
    expect(getComputedStyle(panel).minWidth).toBe("100px")
    expect(getComputedStyle(panel).maxWidth).toBe("600px")
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-tab")).toBeNull()
    expect(ribbon.shadowRoot!.querySelector(".icon-tabler-sparkles-2")).not.toBeNull()
    expect(submit.querySelector(".icon-tabler-arrow-back")).not.toBeNull()
    expect(getComputedStyle(submit).borderRadius).toBe("50%")
    expect(getComputedStyle(submit).width).toBe("18px")
    expect(getComputedStyle(ribbon.shadowRoot!.querySelector(".ai-chat-composer")!).alignItems).toBe("center")
    expect(submit.disabled).toBe(true)

    input.focus()
    await ribbon.updateComplete

    expect(ribbon.activeMenu).toBe("Start")
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"), drawer =>
      drawer.getAttribute("label"),
    )).not.toEqual(expect.arrayContaining(["Connect AI model", "Model settings", "Prompt history"]))
  })

  it("submits a trimmed prompt from the suffix button", async () => {
    const ribbon = await mountRibbon()
    const provider = await configureProvider(ribbon)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(assistantResponse("Rewritten."))
    const input = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    const submit = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!
    const listener = vi.fn()
    ribbon.addEventListener("ai-prompt-submit", listener)

    input.value = "  Rewrite this paragraph  "
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    expect(submit.disabled).toBe(false)

    submit.click()

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {
        prompt: "Rewrite this paragraph",
        chatId: "chat-1",
        providerId: provider.id,
        model: "test-model",
        effort: "medium",
        attachments: [],
      },
    }))
  })

  it("expands into a multiline chat with history, new chats, and chat switching", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(assistantResponse("Here is the explanation."))
    const enter = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-expand")!
    const panel = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-chat-panel")!
    const collapsedInput = panel.querySelector<HTMLTextAreaElement>("textarea.ai-prompt-input")!

    expect(enter.closest(".ai-composer-surface")?.nextElementSibling).toBe(expand)
    expect(expand.getAttribute("aria-expanded")).toBe("false")
    expect(getComputedStyle(panel).maxHeight).toBe("24px")
    expect(collapsedInput.getAttribute("rows")).toBe("1")

    expand.click()
    await ribbon.updateComplete

    const textarea = panel.querySelector<HTMLTextAreaElement>("textarea.ai-chat-input")!
    const send = panel.querySelector<HTMLButtonElement>(".ai-chat-send")!
    expect(textarea).toBe(collapsedInput)
    expect(panel.hasAttribute("data-open")).toBe(true)
    expect(getComputedStyle(panel).maxHeight).not.toBe("24px")
    expect(expand.getAttribute("aria-expanded")).toBe("true")
    expect(textarea.getAttribute("rows")).toBe("3")
    expect(send.disabled).toBe(true)
    expect(panel.querySelector(".ai-chat-header")!.firstElementChild).toBe(
      panel.querySelector(".ai-chat-switcher"),
    )
    expect(panel.firstElementChild?.classList.contains("ai-chat-brand-button")).toBe(true)
    expect(panel.querySelector('[aria-label="AI settings"]')).not.toBeNull()
    expect(panel.querySelector('[aria-label="Add attachments"]')).not.toBeNull()
    expect(panel.querySelector<HTMLSelectElement>('[aria-label="AI model"]')!.selectedOptions[0].textContent).toContain("test-model")
    expect(panel.querySelector<HTMLSelectElement>('[aria-label="AI effort"]')!.value).toBe("medium")
    expect(send.parentElement?.classList.contains("ai-composer-surface")).toBe(true)
    expect(getComputedStyle(send).position).toBe("absolute")

    textarea.value = "Explain the selection"
    textarea.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    send.click()
    await vi.waitFor(() => expect(panel.querySelectorAll(".ai-chat-message")).toHaveLength(2))

    const messages = Array.from(panel.querySelectorAll<HTMLElement>(".ai-chat-message"))
    expect(messages.map(message => message.dataset.role)).toEqual(["user", "assistant"])
    expect(messages[0].textContent).toContain("Explain the selection")
    expect(messages[1].textContent).toContain("Here is the explanation.")

    panel.querySelector<HTMLButtonElement>('[aria-label="New chat"]')!.click()
    await ribbon.updateComplete
    const switcher = panel.querySelector<HTMLSelectElement>(".ai-chat-switcher")!
    expect(switcher.options).toHaveLength(2)
    expect(panel.querySelector(".ai-chat-empty")).not.toBeNull()

    switcher.value = "chat-1"
    switcher.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    expect(panel.querySelectorAll(".ai-chat-message")).toHaveLength(2)
  })

  it("centers the expanded header controls and keeps the sparkle control icon-only", async () => {
    const ribbon = await mountRibbon()
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-expand")!
    expand.click()
    await ribbon.updateComplete

    const header = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-chat-header")!
    const brand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!
    const switcher = ribbon.shadowRoot!.querySelector<HTMLSelectElement>(".ai-chat-switcher")!

    expect(getComputedStyle(header).boxSizing).toBe("border-box")
    expect(getComputedStyle(brand).borderTopWidth).toBe("0px")
    expect(getComputedStyle(brand).backgroundColor).toBe("transparent")
    expect(getComputedStyle(switcher).appearance).toBe("none")
    expect(Number.parseFloat(getComputedStyle(switcher).paddingRight)).toBeGreaterThan(32)
  })

  it("collapses when the pointer goes outside the expanded bar", async () => {
    const ribbon = await mountRibbon()
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-expand")!
    const panel = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-chat-panel")!
    expand.click()
    await ribbon.updateComplete
    expect(panel.hasAttribute("data-open")).toBe(true)

    document.body.dispatchEvent(new PointerEvent("pointerdown", {button: 0, bubbles: true, composed: true}))
    await ribbon.updateComplete

    expect(panel.hasAttribute("data-open")).toBe(false)
  })

  it("opens provider settings and offers simplified provider presets", async () => {
    const ribbon = await mountRibbon()
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-expand")!
    expand.click()
    await ribbon.updateComplete

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="AI settings"]')!.click()
    const settings = ribbon.shadowRoot!.querySelector("ai-settings-dialog")!
    await settings.updateComplete

    expect(settings.open).toBe(true)
    const dialog = settings.shadowRoot!.querySelector<HTMLElement>(".dialog")!
    const content = settings.shadowRoot!.querySelector<HTMLElement>(".content")!
    const providers = settings.shadowRoot!.querySelector<HTMLElement>(".providers")!
    expect(getComputedStyle(dialog).gridTemplateRows).toContain("minmax(0, 1fr)")
    expect(["0", "0px"]).toContain(getComputedStyle(content).minHeight)
    expect(getComputedStyle(content).overflowY).toBe("auto")
    expect(getComputedStyle(providers).overflowY).toBe("auto")
    const presetLabels = Array.from(settings.shadowRoot!.querySelectorAll<HTMLButtonElement>(".preset-button"), button => button.textContent)
    expect(presetLabels).toEqual(["OpenAI", "Ollama", "LM Studio", "Custom"])
    expect(settings.shadowRoot!.querySelector<HTMLInputElement>('input[inputmode="url"]')!.value).toBe("https://api.openai.com/v1")
    expect(settings.shadowRoot!.textContent).not.toContain("Temperature")
    expect(settings.shadowRoot!.textContent).not.toContain("Max output tokens")

    const auth = settings.shadowRoot!.querySelector<HTMLSelectElement>("select")!
    for(const authMode of ["bearer", "api-key", "x-api-key"]) {
      auth.value = authMode
      auth.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
      await settings.updateComplete
      expect(settings.shadowRoot!.querySelector('input[type="password"]')).not.toBeNull()
    }
    auth.value = "none"
    auth.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    await settings.updateComplete
    expect(settings.shadowRoot!.querySelector('input[type="password"]')).toBeNull()
  })

  it("loads attachments and includes their metadata in the submitted prompt event", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(assistantResponse("Attached file received."))
    const listener = vi.fn()
    ribbon.addEventListener("ai-prompt-submit", listener)
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-expand")!
    expand.click()
    await ribbon.updateComplete

    const input = ribbon.shadowRoot!.querySelector<HTMLInputElement>(".ai-attachment-input")!
    const file = new File(["notes"], "notes.txt", {type: "text/plain"})
    Object.defineProperty(input, "files", {configurable: true, value: [file]})
    input.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector(".ai-pending-attachment")).not.toBeNull())

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-send")!.click()
    await vi.waitFor(() => expect(listener).toHaveBeenCalled())
    expect(listener.mock.calls[0][0]).toEqual(expect.objectContaining({
      detail: expect.objectContaining({
        prompt: "Please review the attached file(s).",
        attachments: [{name: "notes.txt", mimeType: "text/plain", size: 5}],
      }),
    }))
  })

  it("requires approval before a model-proposed document change is applied", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    const apply = vi.fn().mockResolvedValue({status: "applied"})
    ribbon.aiDocumentToolHandler = apply
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({choices: [{message: {
        content: null,
        tool_calls: [{
          id: "edit-1",
          type: "function",
          function: {
            name: "replace_current_document",
            arguments: JSON.stringify({summary: "Add a heading", html: "<h1>New heading</h1>"}),
          },
        }],
      }}]}), {headers: {"content-type": "application/json"}}))
      .mockResolvedValueOnce(assistantResponse("The heading was added."))

    const input = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    input.value = "Add a heading"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-send")!.click()

    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector(".ai-edit-approval")).not.toBeNull())
    expect(apply).not.toHaveBeenCalled()

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('.ai-edit-action[data-kind="approve"]')!.click()
    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce())
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({name: "replace_current_document"}))
    await vi.waitFor(() => expect(ribbon.shadowRoot!.textContent).toContain("The heading was added."))
  })
})
