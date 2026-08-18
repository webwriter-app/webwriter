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

const modelsResponse = (models: string[]) => new Response(JSON.stringify({
  data: models.map(id => ({id})),
}), {headers: {"content-type": "application/json"}})

describe("AI prompt ribbon", () => {
  it("renders a self-contained 24px–600px AI bar without an AI ribbon tab", async () => {
    const ribbon = await mountRibbon()
    const brand = ribbon.shadowRoot!.querySelector<HTMLElement>(".brand")!
    const slot = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-bar-slot")!
    const panel = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-chat-panel")!
    const input = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    const submit = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!

    expect(getComputedStyle(slot).minWidth).toBe("24px")
    expect(getComputedStyle(slot).maxWidth).toBe("600px")
    expect(getComputedStyle(brand).minWidth).toBe("37px")
    expect(getComputedStyle(brand).paddingLeft).toBe("13px")
    expect(getComputedStyle(brand).justifyContent).toBe("flex-start")
    expect(getComputedStyle(brand).flexShrink).toBe(getComputedStyle(slot).flexShrink)
    expect(Number.parseFloat(getComputedStyle(slot).flexShrink)).toBeGreaterThan(
      Number.parseFloat(getComputedStyle(ribbon.shadowRoot!.querySelector(".tabs")!).flexShrink),
    )
    expect(getComputedStyle(panel).minWidth).toBe("24px")
    expect(getComputedStyle(panel).maxWidth).toBe("600px")
    expect(getComputedStyle(panel).containerType).toBe("inline-size")
    expect(getComputedStyle(panel).transition).not.toContain("width")
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
    expect(panel.hasAttribute("data-transitioning")).toBe(true)
    expect(getComputedStyle(panel).transition).toContain("width")
    expect(getComputedStyle(panel).transition).toContain("min-width")
    expect(getComputedStyle(panel).minWidth).toBe("400px")
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

  it("does not create another empty new chat", async () => {
    const ribbon = await mountRibbon()
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-expand")!
    expand.click()
    await ribbon.updateComplete

    const panel = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-chat-panel")!
    const newChat = panel.querySelector<HTMLButtonElement>('[aria-label="New chat"]')!
    const switcher = panel.querySelector<HTMLSelectElement>(".ai-chat-switcher")!

    newChat.click()
    await ribbon.updateComplete

    expect(switcher.options).toHaveLength(1)
    expect(switcher.value).toBe("chat-1")
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

  it("only transitions panel width while expanding or collapsing", async () => {
    vi.useFakeTimers()
    try {
      const ribbon = await mountRibbon()
      const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-expand")!
      const panel = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-chat-panel")!

      expect(panel.hasAttribute("data-transitioning")).toBe(false)
      expect(getComputedStyle(panel).transition).not.toContain("width")

      expand.click()
      await ribbon.updateComplete
      expect(panel.hasAttribute("data-transitioning")).toBe(true)
      expect(getComputedStyle(panel).transition).toContain("width")

      await vi.advanceTimersByTimeAsync(220)
      await ribbon.updateComplete
      expect(panel.hasAttribute("data-transitioning")).toBe(false)
      expect(getComputedStyle(panel).transition).not.toContain("width")

      expand.click()
      await ribbon.updateComplete
      expect(panel.hasAttribute("data-transitioning")).toBe(true)
      expect(getComputedStyle(panel).transition).toContain("width")

      await vi.advanceTimersByTimeAsync(220)
      await ribbon.updateComplete
      expect(panel.hasAttribute("data-transitioning")).toBe(false)
      expect(getComputedStyle(panel).transition).not.toContain("width")
    }
    finally {
      vi.useRealTimers()
    }
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
    expect(getComputedStyle(dialog).gridTemplateColumns).toContain("minmax(20rem, 1fr)")
    expect(["0", "0px"]).toContain(getComputedStyle(content).minHeight)
    expect(getComputedStyle(content).overflowY).toBe("auto")
    expect(getComputedStyle(providers).flexGrow).toBe("0")
    expect(getComputedStyle(providers).overflowY).toBe("auto")
    const presetLabels = Array.from(settings.shadowRoot!.querySelectorAll<HTMLButtonElement>(".preset-button"), button => button.textContent)
    expect(presetLabels).toEqual(["OpenAI", "Custom"])
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

  it("automatically loads models and supports refreshing and starring a default", async () => {
    const ribbon = await mountRibbon()
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(modelsResponse(["model-b", "model-a"]))
      .mockResolvedValueOnce(modelsResponse(["model-c"]))
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-expand")!
    expand.click()
    await ribbon.updateComplete

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="AI settings"]')!.click()
    const settings = ribbon.shadowRoot!.querySelector("ai-settings-dialog")!
    await settings.updateComplete

    const advanced = settings.shadowRoot!.querySelector<HTMLDetailsElement>(".advanced-options")!
    expect(advanced.open).toBe(false)
    expect(advanced.querySelector("summary")?.textContent).toBe("Advanced options")
    expect(settings.shadowRoot!.querySelector('textarea[placeholder="One model ID per line"]')).toBeNull()

    const key = settings.shadowRoot!.querySelector<HTMLInputElement>('input[type="password"]')!
    key.value = "test-key"
    key.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(settings.shadowRoot!.querySelectorAll(".model-card")).toHaveLength(2))
    expect(Array.from(settings.shadowRoot!.querySelectorAll<HTMLElement>(".model-name"), model => model.textContent)).toEqual([
      "model-a",
      "model-b",
    ])
    expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.objectContaining({
      headers: expect.objectContaining({Authorization: "Bearer test-key"}),
    }))
    expect(settings.shadowRoot!.querySelector(".icon-tabler-refresh")).not.toBeNull()
    expect(settings.shadowRoot!.querySelector(".icon-tabler-star")).not.toBeNull()
    expect(settings.shadowRoot!.querySelectorAll("article.model-card")).toHaveLength(2)
    expect(settings.shadowRoot!.querySelectorAll("details.model-card")).toHaveLength(0)
    expect(getComputedStyle(settings.shadowRoot!.querySelector<HTMLButtonElement>(".model-default")!).marginLeft).toBe("auto")

    const secondStar = settings.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Set model-b as default model"]')!
    secondStar.click()
    await settings.updateComplete
    expect(settings.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="model-b is the default model"]')?.getAttribute("aria-pressed")).toBe("true")

    settings.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Refresh models"]')!.click()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(settings.shadowRoot!.querySelector<HTMLElement>(".model-name")?.textContent).toBe("model-c"))
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

  it("previews a proposed change, blocks chat, and protocols acceptance with selective undo", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    const review = vi.fn(async (action: string) => ({status: action === "undo" ? "undone" : action}))
    ribbon.aiEditReviewHandler = review
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
    expect(review).toHaveBeenCalledWith("preview", expect.objectContaining({name: "replace_current_document"}))
    expect(ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!.disabled).toBe(true)
    expect(ribbon.shadowRoot!.querySelectorAll(".ai-prompt-review-actions button")).toHaveLength(3)
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-submit")).toBeNull()
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-review-actions")?.closest(".ai-composer-surface")?.nextElementSibling)
      .toBe(ribbon.shadowRoot!.querySelector(".ai-prompt-expand"))

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('.ai-edit-action[data-kind="approve"]')!.click()
    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("accept", expect.objectContaining({id: "edit-1"})))
    await vi.waitFor(() => expect(ribbon.shadowRoot!.textContent).toContain("The heading was added."))
    expect(ribbon.shadowRoot!.textContent).toContain("Accepted: Add a heading")

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('.ai-edit-action[data-kind="undo"]')!.click()
    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("undo", expect.objectContaining({id: "edit-1"})))
    await vi.waitFor(() => expect(ribbon.shadowRoot!.textContent).toContain("Undone: Add a heading"))
  })

  it("rejects a preview from the collapsed bar and records the decision", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    const review = vi.fn(async (action: string) => ({status: action}))
    ribbon.aiEditReviewHandler = review
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({choices: [{message: {
        content: null,
        tool_calls: [{
          id: "edit-reject",
          type: "function",
          function: {
            name: "replace_current_document",
            arguments: JSON.stringify({summary: "Remove the introduction", html: "<main></main>"}),
          },
        }],
      }}]}), {headers: {"content-type": "application/json"}}))
      .mockResolvedValueOnce(assistantResponse("I left the document unchanged."))

    const input = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    input.value = "Remove the introduction"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-send")!.click()

    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelectorAll(".ai-prompt-review-actions button")).toHaveLength(3))
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Reject AI change"]')!.click()

    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("reject", expect.objectContaining({id: "edit-reject"})))
    await vi.waitFor(() => expect(ribbon.shadowRoot!.textContent).toContain("Rejected: Remove the introduction"))
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-review-actions")).toBeNull()
  })

  it("queues an in-document choice made while the preview bridge is still completing", async () => {
    const ribbon = await mountRibbon()
    let finishPreview!: () => void
    const preview = new Promise<void>(resolve => { finishPreview = resolve })
    const review = vi.fn((action: string) => action === "preview"
      ? preview
      : Promise.resolve({status: action}))
    ribbon.aiEditReviewHandler = review
    const call = {
      id: "edit-early-choice",
      name: "replace_current_document",
      arguments: {summary: "Change the title", html: "<h1>New title</h1>"},
    } as const

    const result = (ribbon as any).handleAIDocumentTool(call, "chat-1") as Promise<unknown>
    ribbon.reviewPendingAIEdit("accept", call.id)
    expect(review).toHaveBeenCalledTimes(1)

    finishPreview()
    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("accept", call))
    await expect(result).resolves.toEqual({status: "accept"})
  })
})
