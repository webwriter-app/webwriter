// @vitest-environment node
import {afterAll, beforeAll, beforeEach, expect, it, vi} from "vitest"
import type {HandwritingRequest} from "./math-handwriting-worker"

const ocr = vi.hoisted(() => ({getSession: vi.fn(), predictLatexFromStrokes: vi.fn()}))
vi.mock("./math-handwriting-ocr", () => ocr)
vi.mock("temml/dist/temml.mjs?url", async () => {
  const {createRequire} = await import("node:module")
  const {pathToFileURL} = await import("node:url")
  return {default: pathToFileURL(createRequire(import.meta.url).resolve("temml/dist/temml.mjs")).href}
})

let receive: (event: MessageEvent<HandwritingRequest>) => Promise<void>
const post = vi.fn()
beforeAll(async () => {
  vi.stubGlobal("addEventListener", (_type: string, listener: typeof receive) => receive = listener)
  vi.stubGlobal("postMessage", post)
  await import("./math-handwriting-worker")
})
beforeEach(() => vi.clearAllMocks())
afterAll(() => vi.unstubAllGlobals())

it("loads the model and intact renderer when the worker is initialized", async () => {
  await receive({data: {id: 1}} as MessageEvent<HandwritingRequest>)
  expect(ocr.getSession).toHaveBeenCalledOnce()
  expect(ocr.predictLatexFromStrokes).not.toHaveBeenCalled()
  expect(post).toHaveBeenCalledWith({id: 1, mathml: undefined})
})

it.each([
  [String.raw`\sum_{n=1}\lambda+1`, ["<msub>", ">∑</mo>", ">λ</mi>"]],
  [String.raw`\frac{x}{\sqrt{y}}`, ["<mfrac>", "<msqrt>", ">x</mi>", ">y</mi>"]],
  [String.raw`\alpha+\beta\times\Gamma`, [">α</mi>", ">β</mi>", ">×</mo>", ">Γ</mi>"]],
  [String.raw`𝑥+\lambda`, [">𝑥</mi>", ">λ</mi>"]],
])("converts recognized %s to mathematical elements rather than command text", async (latex, expected) => {
  ocr.predictLatexFromStrokes.mockResolvedValue(latex)
  const strokes = [[{x: 1, y: 2, t: 0}, {x: 2, y: 3, t: 1}]]
  await receive({data: {id: 2, strokes}} as MessageEvent<HandwritingRequest>)
  expect(ocr.predictLatexFromStrokes).toHaveBeenCalledWith(strokes)
  const result = post.mock.calls[0][0]
  expect(result.error).toBeUndefined()
  expect(result.mathml).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML">')
  for(const markup of expected) expect(result.mathml).toContain(markup)
  expect(result.mathml).not.toContain("<mtext")
  expect(result.mathml).not.toContain("\\")
})
