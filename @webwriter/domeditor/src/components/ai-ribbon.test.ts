// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import {DomEditorToolbox} from "./toolbox"
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
  const toolbox = new DomEditorToolbox()
  document.body.append(toolbox)
  await toolbox.updateComplete
  ribbon.aiToolboxTarget = toolbox.shadowRoot!.querySelector<HTMLElement>(".ai-toolbox-content")!
  ribbon.addEventListener("ai-toolbox-change", () => toolbox.selectTool(ribbon.aiChatOpen ? "AI" : null))
  toolbox.addEventListener("toolbox-change", () => {ribbon.aiChatOpen = toolbox.activeTool === "AI"})
  await ribbon.updateComplete
  return ribbon
}

const configureProvider = async (ribbon: AppRibbon) => {
  ribbon.aiDocumentToolHandler = async () => ({html: "", text: "", target: "body"})
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
  it("hides AI and stops a running request when disabled", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    const fetch = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}))
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!.click()
    const input = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    input.value = "Explain this document"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await ribbon.updateComplete
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!.click()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    ribbon.settings = {...ribbon.settings, disableAI: true}
    await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector(".ai-chat-panel")).toBeNull()
    expect(ribbon.shadowRoot!.querySelector(".ai-bar-slot")).toBeNull()
    expect(ribbon.aiToolboxTarget!.textContent).toBe("")
    expect(ribbon.aiChatOpen).toBe(false)
    expect((fetch.mock.calls[0][1] as RequestInit).signal!.aborted).toBe(true)
    ribbon.settings = {...ribbon.settings, disableAI: false}
    await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector(".ai-chat-panel")).not.toBeNull()
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-panel")).not.toBeNull()
  })

  it("clears busy state when Stop cancels a provider that never settles", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    const fetch = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}))
    const input = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    input.value = "Add a paragraph"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!.click()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector(".ai-chat-working")!.textContent).toContain("Waiting for test-model (step 1 of 8)")
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Stop AI request"]')!.click()
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector('[aria-label="Stop AI request"]')).toBeNull())
    expect(ribbon.shadowRoot!.textContent).toContain("Request stopped.")
    expect(ribbon.shadowRoot!.querySelector(".ai-chat-working")).toBeNull()
    expect((fetch.mock.calls[0][1] as RequestInit).signal!.aborted).toBe(true)
  })

  it("releases a cancelled preview and rejects a late result", async () => {
    const ribbon = await mountRibbon()
    let finishPreview!: (value: unknown) => void
    const review = vi.fn().mockImplementation((action: string) => action === "preview"
      ? new Promise(resolve => { finishPreview = resolve }) : Promise.resolve({status: "rejected"}))
    ribbon.aiEditReviewHandler = review
    const controller = new AbortController()
    const call = {id: "stalled-preview", name: "queue_document_change", arguments: {summary: "Add content.", operations: []}}
    const pending = (ribbon as any).handleAIDocumentTool(call, "chat-1", controller.signal)
    controller.abort()
    await expect(pending).resolves.toMatchObject({status: "error"})
    expect((ribbon as any).pendingAIEdit).toBeNull()
    finishPreview({status: "previewing"})
    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("reject", call))
    expect((ribbon as any).pendingAIEdit).toBeNull()
  })

  it("renders a self-contained 24px–600px AI bar without an AI ribbon tab", async () => {
    const ribbon = await mountRibbon()
    const brand = ribbon.shadowRoot!.querySelector<HTMLElement>(".brand")!
    const slot = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-bar-slot")!
    const panel = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-chat-panel")!
    const input = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    const submit = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!

    expect(getComputedStyle(slot).minWidth).toBe("24px")
    expect(getComputedStyle(slot).maxWidth).toBe("600px")
    expect(slot.parentElement?.classList.contains("ribbon-navigation")).toBe(true)
    expect(getComputedStyle(slot).marginLeft).toBe("auto")
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
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-expand")).toBeNull()
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
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!
    const panel = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-chat-panel")!
    const collapsedInput = panel.querySelector<HTMLTextAreaElement>("textarea.ai-prompt-input")!

    expect(enter.closest(".ai-composer-surface")?.nextElementSibling).toBeNull()
    expect(expand.getAttribute("aria-expanded")).toBe("false")
    expect(getComputedStyle(panel).maxHeight).toBe("24px")
    expect(collapsedInput.getAttribute("rows")).toBe("1")

    expand.click()
    await ribbon.updateComplete

    const docked = ribbon.aiToolboxTarget!.querySelector<HTMLElement>(".ai-chat-panel")!
    const textarea = docked.querySelector<HTMLTextAreaElement>("textarea.ai-chat-input")!
    const send = docked.querySelector<HTMLButtonElement>(".ai-chat-send")!
    expect(textarea).not.toBe(collapsedInput)
    expect(panel.hasAttribute("data-open")).toBe(false)
    expect(getComputedStyle(panel).maxHeight).toBe("24px")
    expect(expand.getAttribute("aria-expanded")).toBe("true")
    expect(textarea.getAttribute("rows")).toBe("3")
    expect(send.disabled).toBe(true)
    expect(docked.querySelector(".ai-chat-header")!.firstElementChild).toBe(
      docked.querySelector(".ai-chat-switcher"),
    )
    expect(docked.firstElementChild?.classList.contains("ai-chat-brand-button")).toBe(true)
    expect(docked.querySelector('[aria-label="AI settings"]')).not.toBeNull()
    expect(docked.querySelector('[aria-label="Add attachments"]')).not.toBeNull()
    expect(docked.querySelector<HTMLSelectElement>('[aria-label="AI model and effort"]')!.selectedOptions[0].textContent).toBe("test-model · Medium")
    expect(send.parentElement?.classList.contains("ai-composer-surface")).toBe(true)
    expect(getComputedStyle(send).position).toBe("absolute")

    textarea.value = "Explain the selection without editing"
    textarea.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    send.click()
    await vi.waitFor(() => expect(docked.querySelectorAll(".ai-chat-message")).toHaveLength(2))

    const messages = Array.from(docked.querySelectorAll<HTMLElement>(".ai-chat-message"))
    expect(messages.map(message => message.dataset.role)).toEqual(["user", "assistant"])
    expect(messages[0].textContent).toContain("Explain the selection")
    expect(messages[1].textContent).toContain("Here is the explanation.")

    docked.querySelector<HTMLButtonElement>('[aria-label="New chat"]')!.click()
    await ribbon.updateComplete
    const switcher = docked.querySelector<HTMLSelectElement>(".ai-chat-switcher")!
    expect(switcher.options).toHaveLength(2)
    expect(docked.querySelector(".ai-chat-empty")).not.toBeNull()

    switcher.value = "chat-1"
    switcher.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    expect(docked.querySelectorAll(".ai-chat-message")).toHaveLength(2)
  })

  it("selects a model and effort together and submits both from the combined picker", async () => {
    const ribbon = await mountRibbon()
    const first = await configureProvider(ribbon)
    const store = (ribbon as unknown as {aiProviderStore: AIProviderStore}).aiProviderStore
    const second = store.upsert({...createAIProvider("ollama"), name: "Other provider", models: ["other-model"], defaultModel: "other-model"})
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!.click()
    await ribbon.updateComplete
    const docked = ribbon.aiToolboxTarget!
    const picker = docked.querySelector<HTMLSelectElement>('[aria-label="AI model and effort"]')!
    expect(docked.querySelectorAll(".ai-composer-select")).toHaveLength(1)
    expect(picker.options).toHaveLength(6)

    for(const [provider, model, effort] of [[second, "other-model", "high"], [first, "test-model", "low"]] as const) {
      picker.value = JSON.stringify([provider.id, model, effort])
      picker.dispatchEvent(new Event("change", {bubbles: true}))
      await ribbon.updateComplete
      expect(store.activeProvider?.id).toBe(provider.id)
      expect(picker.value).toBe(JSON.stringify([provider.id, model, effort]))
      expect(docked.querySelector(".ai-composer-model-label")!.textContent).toContain(model)
      expect(docked.querySelector(".ai-composer-model-label")!.textContent).toContain(effort === "high" ? "High" : "Low")
    }

    let finish!: (response: Response) => void
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(resolve => {finish = resolve}))
    const listener = vi.fn()
    ribbon.addEventListener("ai-prompt-submit", listener)
    const input = docked.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    input.value = "Explain this"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await ribbon.updateComplete
    docked.querySelector<HTMLButtonElement>(".ai-chat-send")!.click()
    await vi.waitFor(() => expect(picker.disabled).toBe(true))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({
      providerId: first.id, model: "test-model", effort: "low",
    })}))
    finish(assistantResponse("Explanation"))
    await vi.waitFor(() => expect(picker.disabled).toBe(false))
  })

  it("keeps both prompt inputs in sync and leaves the sidebar open on document interaction", async () => {
    const ribbon = await mountRibbon()
    const bar = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    bar.value = "Draft a lesson"
    bar.dispatchEvent(new InputEvent("input", {bubbles: true}))
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!.click()
    await ribbon.updateComplete
    const input = ribbon.aiToolboxTarget!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    expect(input.value).toBe("Draft a lesson")
    input.value = "Draft a quiz"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await ribbon.updateComplete
    expect(bar.value).toBe("Draft a quiz")
    document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}))
    await ribbon.updateComplete
    expect(ribbon.aiChatOpen).toBe(true)
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    await ribbon.updateComplete
    expect(ribbon.aiChatOpen).toBe(false)
    expect(bar.value).toBe("Draft a quiz")
  })

  it("opens provider settings and offers simplified provider presets", async () => {
    const ribbon = await mountRibbon()
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!
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
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!
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
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!
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
    const review = vi.fn(async (action: string) => ({status: action === "undo" ? "undone" : action === "accept" ? "applied" : "previewing"}))
    ribbon.aiEditReviewHandler = review
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({choices: [{message: {
        content: null,
        tool_calls: [{id: "read", function: {name: "read_current_document", arguments: "{}"}}, {
          id: "edit-1",
          type: "function",
          function: {
            name: "queue_document_change",
            arguments: JSON.stringify({summary: "Add a heading", operations: [{type: "replace_document", target: "body", html: "<h1>New heading</h1>"}]}),
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
    expect(review).toHaveBeenCalledWith("preview", expect.objectContaining({name: "queue_document_change"}), {signal: expect.any(AbortSignal)})
    await vi.waitFor(() => expect(ribbon.shadowRoot!.textContent).toContain("Queued: Add a heading."))
    expect((ribbon as any).aiBusy).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!.disabled).toBe(true)
    expect(ribbon.shadowRoot!.querySelectorAll(".ai-prompt-review-actions button")).toHaveLength(3)
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-submit")).toBeNull()
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-review-actions")?.closest(".ai-composer-surface")?.nextElementSibling).toBeNull()

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('.ai-edit-action[data-kind="approve"]')!.click()
    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("accept", expect.objectContaining({id: expect.stringContaining("/edit-1")})))
    await vi.waitFor(() => expect(ribbon.shadowRoot!.textContent).toContain("Accepted: Add a heading"))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((ribbon as any).conversationFor("chat-1")).toContainEqual(expect.objectContaining({content: expect.stringContaining("accepted")}))

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('.ai-edit-action[data-kind="undo"]')!.click()
    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("undo", expect.objectContaining({id: expect.stringContaining("/edit-1")})))
    await vi.waitFor(() => expect(ribbon.shadowRoot!.textContent).toContain("Undone: Add a heading"))
  })

  it("rejects a preview from the collapsed bar and records the decision", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    const review = vi.fn(async (action: string) => ({status: action === "preview" ? "previewing" : "rejected"}))
    ribbon.aiEditReviewHandler = review
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({choices: [{message: {
        content: null,
        tool_calls: [{id: "read", function: {name: "read_current_document", arguments: "{}"}}, {
          id: "edit-reject",
          type: "function",
          function: {
            name: "queue_document_change",
            arguments: JSON.stringify({summary: "Remove the introduction", operations: [{type: "replace_document", target: "body", html: "<main></main>"}]}),
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

    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("reject", expect.objectContaining({id: expect.stringContaining("/edit-reject")})))
    await vi.waitFor(() => expect(ribbon.shadowRoot!.textContent).toContain("Rejected: Remove the introduction"))
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-review-actions")).toBeNull()
  })

  it("queues an in-document choice made while the preview bridge is still completing", async () => {
    const ribbon = await mountRibbon()
    let finishPreview!: (value: {status: string}) => void
    const preview = new Promise<{status: string}>(resolve => { finishPreview = resolve })
    const review = vi.fn((action: string) => action === "preview"
      ? preview
      : Promise.resolve({status: "applied"}))
    ribbon.aiEditReviewHandler = review
    const call = {
      id: "edit-early-choice",
      name: "replace_current_document",
      arguments: {summary: "Change the title", html: "<h1>New title</h1>"},
    } as const

    const result = (ribbon as any).handleAIDocumentTool(call, "chat-1") as Promise<unknown>
    expect((ribbon as any).handleAIDocumentTool(call, "chat-1")).toBe(result)
    ribbon.reviewPendingAIEdit("accept", call.id)
    expect(review).toHaveBeenCalledTimes(1)

    finishPreview({status: "previewing"})
    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("accept", call))
    await expect(result).resolves.toMatchObject({status: "queued", proposalId: call.id})
  })

  it("settles cancelled preview requests and rejects late previews", async () => {
    const ribbon = await mountRibbon()
    let finish!: (value: {status: string}) => void
    const review = vi.fn((action: string) => action === "preview"
      ? new Promise<{status: string}>(resolve => { finish = resolve }) : Promise.resolve({status: "rejected"}))
    ribbon.aiEditReviewHandler = review
    const call = {id: "cancel", name: "replace_current_document", arguments: {summary: "Add title", html: "<h1>Title</h1>"}}
    const result = (ribbon as any).handleAIDocumentTool(call, "chat-1")
    await ribbon.cancelAIWork()
    await expect(result).resolves.toMatchObject({status: "error"})
    finish({status: "previewing"})
    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("reject", call))
    expect((ribbon as any).pendingAIEdit).toBeNull()
  })

  it("does not record acceptance when the editor cannot apply a proposal", async () => {
    const ribbon = await mountRibbon()
    ribbon.aiEditReviewHandler = vi.fn(async action => ({status: action === "preview" ? "previewing" : "unavailable"}))
    await (ribbon as any).handleAIDocumentTool({id: "failed", name: "replace_current_document", arguments: {summary: "Add title", html: "<h1>Title</h1>"}}, "chat-1")
    ribbon.reviewPendingAIEdit("accept", "failed")
    await vi.waitFor(() => expect((ribbon as any).aiError).toContain("could not be accepted"))
    expect((ribbon as any).conversationFor("chat-1")).toEqual([])
  })
})
