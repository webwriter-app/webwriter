// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {TextKeyboard, type TextKeyboardCommand} from "./text-keyboard"

async function mount(platform = "iPad") {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform)
  const keyboard = new TextKeyboard()
  document.body.append(keyboard)
  await keyboard.updateComplete
  const commands: TextKeyboardCommand[] = []
  keyboard.addEventListener("text-keyboard-command", event => commands.push((event as CustomEvent<TextKeyboardCommand>).detail))
  const key = (label: string) => Array.from(keyboard.shadowRoot!.querySelectorAll("button")).find(button =>
    (button.getAttribute("aria-label") ?? button.textContent.trim()) === label)!
  return {keyboard, commands, key}
}

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })

it("preserves touch focus and dispatches shifted text, space, return and deletion", async () => {
  const {keyboard, key, commands} = await mount()
  expect(key("Shift").dispatchEvent(new PointerEvent("pointerdown", {cancelable: true, bubbles: true}))).toBe(false)
  key("Shift").click()
  await keyboard.updateComplete
  key("A").click()
  await keyboard.updateComplete
  key("a").click()
  key("Space").click()
  key("Return").click()
  key("Backspace").click()
  expect(commands).toEqual([{command: "insert", text: "A"}, {command: "insert", text: "a"},
    {command: "insert", text: " "}, {command: "enter"}, {command: "backspace"}])
})

it("supports both symbol pages and returning to the letters", async () => {
  const {keyboard, key, commands} = await mount("Linux armv8l")
  expect(keyboard.shadowRoot!.querySelector("section")?.classList.contains("android")).toBe(true)
  key("Numbers and symbols").click()
  await keyboard.updateComplete
  key("3").click()
  key("More symbols").click()
  await keyboard.updateComplete
  key("[").click()
  key("Letters").click()
  await keyboard.updateComplete
  expect(key("q")).toBeDefined()
  expect(commands).toEqual([{command: "insert", text: "3"}, {command: "insert", text: "["}])
})

it("offers device input and dismissal as separate keyboard controls", async () => {
  const {keyboard, key} = await mount()
  expect(keyboard.shadowRoot!.querySelector("section")?.classList.contains("apple")).toBe(true)
  const close = vi.fn(), native = vi.fn()
  document.addEventListener("text-keyboard-close", close, {once: true})
  document.addEventListener("text-keyboard-native", native, {once: true})
  key("Use device keyboard").click()
  expect(native).toHaveBeenCalledOnce()
  expect(close).not.toHaveBeenCalled()
  key("Hide text keyboard").click()
  expect(close).toHaveBeenCalledOnce()
})

it("offers dismissal on desktop when the device has no software keyboard", async () => {
  const {keyboard, key} = await mount("Win32")
  keyboard.deviceKeyboardAvailable = false
  await keyboard.updateComplete
  expect(key("Use device keyboard")).toBeUndefined()
  expect(key("Hide text keyboard")).toBeDefined()
})
