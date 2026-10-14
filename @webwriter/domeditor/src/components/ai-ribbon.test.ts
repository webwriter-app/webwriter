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

it("keeps template indentation out of message content while preserving reply line breaks", async () => {
  const ribbon = await mountRibbon()
  const text = "First line.\n\nSecond paragraph."
  ribbon.appendAIResponse(text)
  ribbon.aiChatOpen = true
  await ribbon.updateComplete
  const message = ribbon.aiToolboxTarget!.querySelector<HTMLElement>(".ai-chat-message")!
  const content = message.querySelector<HTMLElement>(".ai-chat-message-content")!
  expect(content.textContent).toBe(text)
  expect(getComputedStyle(message).whiteSpace).toBe("normal")
  expect(getComputedStyle(content).whiteSpace).toBe("pre-wrap")
})

it("shows replies beside the closed AI bar and dismisses them without losing the conversation", async () => {
  const ribbon = await mountRibbon()
  ribbon.appendAIResponse("Here is the answer.\nA second line.")
  await ribbon.updateComplete
  const bubble = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-bar-reply")!
  expect(bubble.getAttribute("popover")).toBe("manual")
  expect(bubble.querySelector(".ai-bar-reply-content")!.textContent).toBe("Here is the answer.\nA second line.")
  expect(ribbon.aiChatOpen).toBe(false)
  bubble.querySelector<HTMLButtonElement>(".ai-bar-reply-close")!.click()
  await ribbon.updateComplete
  expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply")).toBeNull()
  ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!.click()
  await ribbon.updateComplete
  expect(ribbon.aiToolboxTarget!.textContent).toContain("Here is the answer.")
  expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply")).toBeNull()
  ribbon.appendAIResponse("Another answer while the toolbox is open.")
  await ribbon.updateComplete
  expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply")).toBeNull()
  ribbon.aiChatOpen = false
  await ribbon.updateComplete
  expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply")).toBeNull()
})

it("dismisses the reply with Escape and hides it when AI is disabled", async () => {
  const ribbon = await mountRibbon()
  ribbon.appendAIResponse("First reply")
  await ribbon.updateComplete
  document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
  await ribbon.updateComplete
  expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply")).toBeNull()
  ribbon.appendAIResponse("Second reply")
  await ribbon.updateComplete
  expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply-content")!.textContent).toBe("Second reply")
  ribbon.settings = {...ribbon.settings, disableAI: true}
  await ribbon.updateComplete
  expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply")).toBeNull()
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
  it("memoizes chat templates on unrelated updates and refreshes replies and preview locks", async () => {
    const ribbon = await mountRibbon()
    const renderChat = vi.spyOn(ribbon as any, "renderAIChat")
    const prompt = ribbon.shadowRoot!.querySelector(".ai-prompt-input")!
    ribbon.undoState = {canUndo: true, canRedo: false}
    await ribbon.updateComplete
    expect(renderChat).not.toHaveBeenCalled()
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-input")).toBe(prompt)
    expect(ribbon.shadowRoot!.querySelector(".ai-chat-messages")).toBeNull()

    ribbon.appendAIResponse("A fresh reply")
    await ribbon.updateComplete
    expect(renderChat).toHaveBeenCalledTimes(2)
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-messages")!.textContent).toContain("A fresh reply")
    expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply-content")!.textContent).toBe("A fresh reply")
    ribbon.historyState = {...ribbon.historyState, preview: {checkpointId: "before", isCurrent: false, added: 1, removed: 0, modified: 0}}
    await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector(".ai-chat-panel")!.hasAttribute("inert")).toBe(true)
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-panel")!.hasAttribute("inert")).toBe(true)
  })

  it("allows navigation during Thinking and runs queued messages in their original chats without changing the selected chat", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    ribbon.aiChatOpen = true
    await ribbon.updateComplete
    const host = ribbon as any
    const replies: ((response: Response) => void)[] = []
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => replies.push(resolve)))
    const send = async (prompt: string) => {
      const input = ribbon.aiToolboxTarget!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
      input.value = prompt
      input.dispatchEvent(new InputEvent("input", {bubbles: true}))
      await ribbon.updateComplete
      ribbon.aiToolboxTarget!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!.click()
      await ribbon.updateComplete
    }
    const switchTo = async (chatId: string) => {
      const select = ribbon.aiToolboxTarget!.querySelector<HTMLSelectElement>(".ai-chat-switcher")!
      expect(select.disabled).toBe(false)
      select.value = chatId
      select.dispatchEvent(new Event("change", {bubbles: true}))
      await ribbon.updateComplete
    }
    await send("First, explain only")
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    await send("First queued, explain only")
    const newChat = ribbon.aiToolboxTarget!.querySelector<HTMLButtonElement>('[aria-label="New chat"]')!
    expect(newChat.disabled).toBe(false)
    newChat.click()
    await ribbon.updateComplete
    const secondId = host.activeAIChatId
    expect(secondId).not.toBe("chat-1")
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-working")).toBeNull()
    expect(ribbon.shadowRoot!.querySelector(".ai-bar-status")).toBeNull()
    expect(ribbon.aiToolboxTarget!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!.disabled).toBe(true)
    await send("Second queued, explain only")
    expect(fetch).toHaveBeenCalledOnce()
    await switchTo("chat-1")
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-working")).not.toBeNull()
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-messages")!.textContent).not.toContain("Second queued")
    await switchTo(secondId)
    host.aiPrompt = "Unsent second draft"
    replies[0](assistantResponse("First answer"))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(host.activeAIChatId).toBe(secondId)
    expect(host.aiPrompt).toBe("Unsent second draft")
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-working")).toBeNull()
    const context = (index: number) => JSON.parse(fetch.mock.calls[index][1]!.body as string).messages
      .filter((message: {role: string}) => ["user", "assistant"].includes(message.role))
    expect(context(1)).toEqual([
      {role: "user", content: "First, explain only"}, {role: "assistant", content: "First answer"}, {role: "user", content: "First queued, explain only"},
    ])
    replies[1](assistantResponse("First queued answer"))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(context(2)).toEqual([{role: "user", content: "Second queued, explain only"}])
    expect(host.aiPrompt).toBe("Unsent second draft")
    replies[2](assistantResponse("Second answer"))
    await vi.waitFor(() => expect(host.aiBusy).toBe(false))
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-messages")!.textContent).not.toContain("First answer")
    await switchTo("chat-1")
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-messages")!.textContent).toContain("First queued answer")
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-messages")!.textContent).not.toContain("Second answer")
  })

  it("keeps a background document review in its originating chat without selecting it", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    const host = ribbon as any
    ribbon.appendAIResponse("First chat")
    host.aiBusy = true
    host.startNewAIChat()
    const secondId = host.activeAIChatId
    ribbon.aiEditReviewHandler = vi.fn(async action => ({status: action === "preview" ? "previewing" : "rejected"}))
    await host.handleAIDocumentTool({id: "background-edit", name: "queue_document_change", arguments: {summary: "Add heading", operations: []}}, "chat-1")
    host.aiBusy = false
    await ribbon.updateComplete
    expect(host.activeAIChatId).toBe(secondId)
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-toolbox-review")).toBeNull()
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-messages")!.textContent).not.toContain("Add heading")
    host.switchAIChat({currentTarget: {value: "chat-1"}})
    await ribbon.updateComplete
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-toolbox-review")).not.toBeNull()
    ribbon.reviewPendingAIEdit("reject", "background-edit")
    await vi.waitFor(() => expect(host.pendingAIEdit).toBeNull())
  })

  it("keeps histories, request context, drafts, attachments and errors distinct between chats", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    const host = ribbon as any
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(assistantResponse("First reply"))
      .mockResolvedValueOnce(assistantResponse("Second reply"))
    await host.runAIPrompt("First message, explain only")
    host.aiPrompt = "First draft"
    host.aiAttachments = [{id: "first-file", name: "first.txt", mimeType: "text/plain", size: 1, kind: "text", data: "A"}]
    host.aiError = "First chat error"
    host.startNewAIChat()
    await ribbon.updateComplete
    const secondId = host.activeAIChatId
    expect(secondId).not.toBe("chat-1")
    expect(host.aiPrompt).toBe("")
    expect(host.aiAttachments).toEqual([])
    expect(ribbon.aiToolboxTarget!.querySelectorAll(".ai-chat-message")).toHaveLength(0)
    expect(ribbon.aiToolboxTarget!.textContent).not.toContain("First chat error")
    expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply")).toBeNull()
    await host.runAIPrompt("Second message, explain only")
    const request = JSON.parse(fetch.mock.calls[1][1]!.body as string).messages
    expect(request.filter((message: {role: string}) => message.role === "user" || message.role === "assistant"))
      .toEqual([{role: "user", content: "Second message, explain only"}])
    host.aiPrompt = "Second draft"
    const switchTo = async (id: string) => {
      const select = ribbon.aiToolboxTarget!.querySelector<HTMLSelectElement>(".ai-chat-switcher")!
      select.value = id
      select.dispatchEvent(new Event("change", {bubbles: true}))
      await ribbon.updateComplete
    }
    await switchTo("chat-1")
    expect(host.aiPrompt).toBe("First draft")
    expect(host.aiAttachments[0].name).toBe("first.txt")
    expect(ribbon.aiToolboxTarget!.textContent).toContain("First chat error")
    expect(ribbon.aiToolboxTarget!.textContent).not.toContain("Second reply")
    await switchTo(secondId)
    ribbon.appendAIResponse("Late first reply", "chat-1")
    await ribbon.updateComplete
    expect(host.aiPrompt).toBe("Second draft")
    expect(host.aiAttachments).toEqual([])
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-chat-messages")!.textContent).not.toContain("First")
    expect(ribbon.aiToolboxTarget!.textContent).not.toContain("Late first reply")
    expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply-content")!.textContent).toBe("Second reply")
    await switchTo("chat-1")
    expect(ribbon.aiToolboxTarget!.textContent).toContain("Late first reply")
  })

  it("keeps reply dismissals distinct and does not fall back to another chat for a missing ID", async () => {
    const ribbon = await mountRibbon()
    const host = ribbon as any
    ribbon.appendAIResponse("First reply")
    await ribbon.updateComplete
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-bar-reply-close")!.click()
    host.startNewAIChat()
    ribbon.appendAIResponse("Second reply")
    await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply-content")!.textContent).toBe("Second reply")
    host.switchAIChat({currentTarget: {value: "chat-1"}})
    await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply")).toBeNull()
    host.activeAIChatId = "missing-chat"
    await ribbon.updateComplete
    expect(ribbon.aiToolboxTarget!.querySelectorAll(".ai-chat-message")).toHaveLength(0)
    expect(ribbon.shadowRoot!.querySelector(".ai-bar-reply")).toBeNull()
  })

  it("returns a delayed attachment upload to the chat that selected it", async () => {
    const ribbon = await mountRibbon()
    const host = ribbon as any
    ribbon.appendAIResponse("First chat")
    let finish!: (text: string) => void
    const file = new File(["Notes"], "first.txt", {type: "text/plain"})
    vi.spyOn(file, "text").mockReturnValue(new Promise(resolve => {finish = resolve}))
    const uploading = host.addAIAttachments({currentTarget: {files: [file], value: "first.txt"}})
    host.startNewAIChat()
    finish("Notes")
    await uploading
    await ribbon.updateComplete
    expect(host.aiAttachments).toEqual([])
    expect(ribbon.aiChatOpen).toBe(false)
    host.switchAIChat({currentTarget: {value: "chat-1"}})
    await ribbon.updateComplete
    expect(host.aiAttachments).toEqual([expect.objectContaining({name: "first.txt", data: "Notes"})])
  })

  it("queues busy prompts in order, excludes future prompts from context, and preserves an unsent draft", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    const replies: ((response: Response) => void)[] = []
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => replies.push(resolve)))
    const send = async (text: string, keyboard = false) => {
      const input = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
      expect(input.readOnly).toBe(false)
      input.value = text
      input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
      await ribbon.updateComplete
      if(keyboard) input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
      else ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!.click()
      await ribbon.updateComplete
    }
    await send("First, explain only")
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const attachment = {id: "queued-file", name: "notes.txt", mimeType: "text/plain", size: 5, kind: "text" as const, data: "Notes"}
    ;(ribbon as any).aiAttachments = [attachment]
    await send("Second, explain only")
    attachment.data = "Changed after sending"
    await send("Third, explain only", true)
    expect(fetch).toHaveBeenCalledOnce()
    expect(ribbon.aiToolboxTarget!.textContent!.match(/You · Queued/g)).toHaveLength(2)
    const context = (index: number) => JSON.parse(fetch.mock.calls[index][1]!.body as string).messages
      .filter((message: {role: string}) => ["user", "assistant"].includes(message.role))
      .map((message: {content: string}) => message.content)
    expect(context(0)).toEqual(["First, explain only"])
    replies[0](assistantResponse("Answer one"))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(context(1).slice(0, 2)).toEqual(["First, explain only", "Answer one"])
    expect(JSON.stringify(context(1)[2])).toContain("Second, explain only")
    expect(JSON.stringify(context(1)[2])).toContain("Notes")
    expect(JSON.stringify(context(1)[2])).not.toContain("Changed after sending")
    const draft = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    draft.value = "Unsent draft"
    draft.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await ribbon.updateComplete
    replies[1](assistantResponse("Answer two"))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(context(2).slice(-2)).toEqual(["Answer two", "Third, explain only"])
    expect(draft.value).toBe("Unsent draft")
    replies[2](assistantResponse("Answer three"))
    await vi.waitFor(() => expect((ribbon as any).aiBusy).toBe(false))
    expect(ribbon.aiToolboxTarget!.textContent).not.toContain("You · Queued")
  })

  it("pauses queued prompts for document review and resumes after a decision", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    const host = ribbon as any
    host.aiBusy = true
    host.aiPrompt = "Explain only: next message"
    host.submitAIPrompt({preventDefault() {}})
    ribbon.aiEditReviewHandler = vi.fn(async action => ({status: action === "preview" ? "previewing" : "rejected"}))
    const call = {id: "pause-queue", name: "queue_document_change", arguments: {summary: "Change heading", operations: []}}
    await host.handleAIDocumentTool(call, "chat-1")
    host.aiBusy = false
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(assistantResponse("Next answer"))
    host.runNextQueuedAIPrompt()
    expect(fetch).not.toHaveBeenCalled()
    expect(host.queuedAIPrompts).toHaveLength(1)
    ribbon.reviewPendingAIEdit("reject", call.id)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(host.aiBusy).toBe(false))
    const messages = JSON.parse(fetch.mock.calls[0][1]!.body as string).messages
    expect(messages).toContainEqual(expect.objectContaining({content: expect.stringContaining("rejected")}))
    expect(messages).toContainEqual({role: "user", content: "Explain only: next message"})
    expect(host.queuedAIPrompts).toHaveLength(0)
  })

  it("cancels queued messages when Stop is pressed", async () => {
    const ribbon = await mountRibbon()
    await configureProvider(ribbon)
    const fetch = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}))
    const input = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    input.value = "First"
    input.dispatchEvent(new InputEvent("input"))
    await ribbon.updateComplete
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!.click()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    input.value = "Second"
    input.dispatchEvent(new InputEvent("input"))
    await ribbon.updateComplete
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Queue chat message"]')!.click()
    await ribbon.updateComplete
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Stop AI request"]')!.click()
    await vi.waitFor(() => expect((ribbon as any).aiBusy).toBe(false))
    expect(fetch).toHaveBeenCalledOnce()
    expect(ribbon.aiToolboxTarget!.textContent).toContain("You · Cancelled")
    expect((ribbon as any).conversationFor("chat-1").map((message: {content: string}) => message.content)).toEqual(["First"])
  })

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
    const working = ribbon.aiToolboxTarget!.querySelector(".ai-chat-working")!
    expect(working.textContent).toBe("Thinking...")
    expect(working.querySelector("span")!.title).toContain("Waiting for test-model (step 1 of 16)")
    expect(working.getAttribute("role")).toBe("status")
    const barStatus = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-bar-status")!
    expect(barStatus.textContent).toBe("Thinking...")
    expect(barStatus.title).toContain("Waiting for test-model")
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
    expect(getComputedStyle(panel.querySelector(".ai-chat-brand-button")!).transition).toBe("none")
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

  it("preserves a draft when the sparkles button opens and closes the toolbox chat", async () => {
    const ribbon = await mountRibbon()
    const prompt = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    prompt.value = "Continue this draft"
    prompt.dispatchEvent(new Event("input", {bubbles: true}))
    await ribbon.updateComplete
    const sparkles = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!
    sparkles.click()
    await ribbon.updateComplete
    expect(ribbon.aiToolboxTarget!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!.value).toBe("Continue this draft")
    expect(sparkles.getAttribute("aria-expanded")).toBe("true")
    sparkles.click()
    await ribbon.updateComplete
    expect(ribbon.aiChatOpen).toBe(false)
    expect(ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!.value).toBe("Continue this draft")
    expect(ribbon.shadowRoot!.activeElement).toBe(sparkles)
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
    await ribbon.updateComplete
    const settings = ribbon.shadowRoot!.querySelector("ai-settings-dialog")!
    await settings.updateComplete

    expect(settings.open).toBe(true)
    expect(ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#settings-dialog")!.open).toBe(true)
    expect(settings.embedded).toBe(true)
    expect(settings.shadowRoot!.querySelector("dialog")).toBeNull()
    const content = settings.shadowRoot!.querySelector<HTMLElement>(".content")!
    const providers = settings.shadowRoot!.querySelector<HTMLElement>(".providers")!
    expect(["0", "0px"]).toContain(getComputedStyle(content).minHeight)
    expect(getComputedStyle(content).overflow).toBe("visible")
    expect(getComputedStyle(providers).flexGrow).toBe("0")
    expect(getComputedStyle(providers).overflow).toBe("visible")
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

  it("closes the unified settings modal on cancel, clears credentials, and reopens Cloud", async () => {
    const ribbon = await mountRibbon()
    ;(ribbon as any).showAISettings()
    await ribbon.updateComplete
    const settings = ribbon.shadowRoot!.querySelector("ai-settings-dialog")!
    await settings.updateComplete
    ;(settings as any).apiKey = "unsaved-test-key"
    const dialog = ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#settings-dialog")!
    const showModal = vi.spyOn(dialog, "showModal")
    ;(ribbon as any).showAISettings()
    await ribbon.updateComplete
    expect(showModal).not.toHaveBeenCalled()
    dialog.dispatchEvent(new Event("cancel", {cancelable: true}))
    await ribbon.updateComplete
    expect(dialog.open).toBe(false)
    expect(settings.open).toBe(false)
    expect((settings as any).apiKey).toBe("")
    expect(settings.isConnected).toBe(false)
    ;(ribbon as any).showAISettings()
    await ribbon.updateComplete
    const reopened = ribbon.shadowRoot!.querySelector("ai-settings-dialog")!
    await reopened.updateComplete
    expect(dialog.open).toBe(true)
    expect(reopened.open).toBe(true)
    expect(ribbon.shadowRoot!.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toBe("Cloud")
    expect(ribbon.aiChatOpen).toBe(false)
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
    await ribbon.updateComplete
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

    await vi.waitFor(() => expect(ribbon.aiToolboxTarget!.querySelector('.ai-chat-message[data-edit-phase="review"]')).not.toBeNull())
    expect(review).toHaveBeenCalledWith("preview", expect.objectContaining({name: "queue_document_change"}), {signal: expect.any(AbortSignal)})
    await vi.waitFor(() => expect(ribbon.aiToolboxTarget!.textContent).toContain("Review document change: Add a heading"))
    expect((ribbon as any).aiBusy).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!.disabled).toBe(true)
    expect(ribbon.shadowRoot!.querySelectorAll(".ai-prompt-review-actions button")).toHaveLength(3)
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-submit")).toBeNull()
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-review-actions")?.closest(".ai-composer-surface")?.nextElementSibling).toBeNull()
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-prompt-input, .ai-composer-toolbar")).toBeNull()
    const reviewMessage = ribbon.aiToolboxTarget!.querySelector('.ai-chat-message[data-edit-phase="review"]')!
    expect(ribbon.aiToolboxTarget!.querySelectorAll('.ai-chat-message[data-role="event"]')).toHaveLength(1)
    expect(ribbon.aiToolboxTarget!.textContent).not.toContain("Queued:")
    for(const button of ribbon.aiToolboxTarget!.querySelectorAll<HTMLElement>(".ai-edit-action")) {
      expect(getComputedStyle(button).whiteSpace).toBe("nowrap")
      expect(getComputedStyle(button).flexShrink).toBe("0")
    }

    ribbon.aiToolboxTarget!.querySelector<HTMLButtonElement>('.ai-edit-action[data-kind="approve"]')!.click()
    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("accept", expect.objectContaining({id: expect.stringContaining("/edit-1")})))
    await vi.waitFor(() => expect(ribbon.aiToolboxTarget!.textContent).toContain("Accepted: Add a heading"))
    expect(ribbon.aiToolboxTarget!.querySelector('.ai-chat-message[data-edit-phase="accepted"]')).toBe(reviewMessage)
    expect(ribbon.aiToolboxTarget!.querySelectorAll('.ai-chat-message[data-role="event"]')).toHaveLength(1)
    expect(ribbon.aiToolboxTarget!.querySelector(".ai-prompt-input")).not.toBeNull()
    expect(ribbon.aiToolboxTarget!.textContent).not.toContain("Review document change:")
    for(const button of ribbon.aiToolboxTarget!.querySelectorAll<HTMLElement>(".ai-edit-action")) {
      expect(getComputedStyle(button).whiteSpace).toBe("nowrap")
      expect(getComputedStyle(button).flexShrink).toBe("0")
    }
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((ribbon as any).conversationFor("chat-1")).toContainEqual(expect.objectContaining({content: expect.stringContaining("accepted")}))

    ribbon.aiToolboxTarget!.querySelector<HTMLButtonElement>('.ai-edit-action[data-kind="undo"]')!.click()
    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("undo", expect.objectContaining({id: expect.stringContaining("/edit-1")})))
    await vi.waitFor(() => expect(ribbon.aiToolboxTarget!.textContent).toContain("Undone: Add a heading"))
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
    await vi.waitFor(() => expect(ribbon.aiToolboxTarget!.querySelector('[data-edit-phase="review"]')).not.toBeNull())
    const reviewMessage = ribbon.aiToolboxTarget!.querySelector('[data-edit-phase="review"]')!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Reject AI change"]')!.click()

    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("reject", expect.objectContaining({id: expect.stringContaining("/edit-reject")})))
    await vi.waitFor(() => expect(ribbon.aiToolboxTarget!.textContent).toContain("Rejected: Remove the introduction"))
    expect(ribbon.shadowRoot!.querySelector(".ai-prompt-review-actions")).toBeNull()
    expect(ribbon.aiToolboxTarget!.querySelector('[data-edit-phase="rejected"]')).toBe(reviewMessage)
    expect(ribbon.aiToolboxTarget!.querySelectorAll('[data-role="event"]')).toHaveLength(1)
    expect(ribbon.aiToolboxTarget!.textContent).not.toContain("Review document change:")
  })

  it("removes the queued message when previewing fails", async () => {
    const ribbon = await mountRibbon()
    ribbon.aiEditReviewHandler = vi.fn().mockRejectedValue(new Error("Preview failed"))
    const call = {id: "failed-preview", name: "replace_current_document", arguments: {summary: "Add a heading", html: "<h1>Heading</h1>"}}
    await expect((ribbon as any).handleAIDocumentTool(call, "chat-1")).resolves.toMatchObject({status: "error", message: "Preview failed"})
    await ribbon.updateComplete
    expect(ribbon.aiToolboxTarget!.querySelector('[data-edit-phase="queued"], [data-edit-phase="review"]')).toBeNull()
    expect((ribbon as any).conversationFor("chat-1")).toEqual([])
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
    await ribbon.updateComplete
    const queuedMessage = ribbon.aiToolboxTarget!.querySelector('.ai-chat-message[data-edit-phase="queued"]')!
    expect(queuedMessage.textContent).toContain("Queued: Change the title")
    expect((ribbon as any).handleAIDocumentTool(call, "chat-1")).toBe(result)
    ribbon.reviewPendingAIEdit("accept", call.id)
    expect(review).toHaveBeenCalledTimes(1)

    finishPreview({status: "previewing"})
    await vi.waitFor(() => expect(review).toHaveBeenCalledWith("accept", call))
    await expect(result).resolves.toMatchObject({status: "queued", proposalId: call.id})
    await ribbon.updateComplete
    expect(ribbon.aiToolboxTarget!.querySelector('.ai-chat-message[data-edit-phase="accepted"]')).toBe(queuedMessage)
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
    expect((ribbon as any).conversationFor("chat-1")).toEqual([])
  })

  it("does not record acceptance when the editor cannot apply a proposal", async () => {
    const ribbon = await mountRibbon()
    ribbon.aiEditReviewHandler = vi.fn(async action => ({status: action === "preview" ? "previewing" : "unavailable"}))
    await (ribbon as any).handleAIDocumentTool({id: "failed", name: "replace_current_document", arguments: {summary: "Add title", html: "<h1>Title</h1>"}}, "chat-1")
    ribbon.reviewPendingAIEdit("accept", "failed")
    await vi.waitFor(() => expect((ribbon as any).aiError).toContain("could not be accepted"))
    expect((ribbon as any).conversationFor("chat-1")).toEqual([expect.objectContaining({content: expect.stringContaining("review")})])
  })
})
