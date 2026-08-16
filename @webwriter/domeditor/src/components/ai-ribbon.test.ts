// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"

afterEach(() => document.body.replaceChildren())

const mountRibbon = async () => {
  const ribbon = new AppRibbon()
  document.body.append(ribbon)
  await ribbon.updateComplete
  return ribbon
}

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
        model: "dummy-model",
        effort: "medium",
      },
    }))
  })

  it("expands into a multiline chat with history, new chats, and chat switching", async () => {
    const ribbon = await mountRibbon()
    const enter = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-submit")!
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-expand")!
    const panel = ribbon.shadowRoot!.querySelector<HTMLElement>(".ai-chat-panel")!
    const collapsedInput = panel.querySelector<HTMLTextAreaElement>("textarea.ai-prompt-input")!

    expect(enter.closest(".ai-composer-surface")?.nextElementSibling).toBe(expand)
    expect(expand.getAttribute("aria-expanded")).toBe("false")
    expect(getComputedStyle(panel).maxHeight).toBe("24px")
    expect(collapsedInput.getAttribute("rows")).toBe("1")

    expand.dispatchEvent(new PointerEvent("pointerdown", {button: 0, bubbles: true, composed: true}))
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
    expect(panel.querySelector<HTMLSelectElement>('[aria-label="AI model"]')!.value).toBe("dummy-model")
    expect(panel.querySelector<HTMLSelectElement>('[aria-label="AI effort"]')!.value).toBe("medium")
    expect(send.parentElement?.classList.contains("ai-composer-surface")).toBe(true)
    expect(getComputedStyle(send).position).toBe("absolute")

    textarea.value = "Explain the selection"
    textarea.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    send.click()
    ribbon.appendAIResponse("Here is the explanation.")
    await ribbon.updateComplete

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
})
