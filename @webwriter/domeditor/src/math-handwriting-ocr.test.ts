import {expect, it, vi} from "vitest"
import vocab from "./math-handwriting-vocab.json"

const runtime = vi.hoisted(() => ({create: vi.fn(), run: vi.fn(), tensors: [] as {type: string, data: unknown, dims: number[]}[]}))
vi.mock("onnxruntime-web/wasm", () => ({
  env: {wasm: {}},
  InferenceSession: {create: runtime.create},
  Tensor: class {
    constructor(type: string, data: unknown, dims: number[]) { runtime.tensors.push({type, data, dims}) }
  },
}))

it("reuses the attached recognizer's seven-feature ONNX contract and CTC decoding", async () => {
  const {getSession, predictLatexFromStrokes, validateStrokes} = await import("./math-handwriting-ocr")
  expect(runtime.create).not.toHaveBeenCalled()
  runtime.create.mockResolvedValue({run: runtime.run})
  await getSession()
  const ids = [vocab.tokens['\\alpha'], vocab.tokens['\\alpha'], 0, vocab.tokens.x]
  const size = Object.keys(vocab.tokens).length + 1
  const data = new Float32Array(ids.length * size).fill(-10)
  ids.forEach((id, index) => data[index * size + id] = 0)
  runtime.run.mockResolvedValue({log_probs: {data, dims: [1, ids.length, size]}, output_lengths: {data: [ids.length]}})
  const result = await predictLatexFromStrokes([[{x: 0, y: 0, t: 0}, {x: 10, y: 20, t: 10}]])
  expect(result).toBe('\\alpha x')
  expect(runtime.create).toHaveBeenCalledOnce()
  expect(runtime.create.mock.calls[0][1].executionProviders).toEqual(["wasm"])
  expect(runtime.tensors[0].dims).toEqual([1, 2, 7])
  expect(Array.from(runtime.tensors[0].data as Float32Array)).toEqual([
    -.25, -.5, 0, 0, 0, 1, 0,
    .25, .5, .5, 1, expect.closeTo(Math.log(2)), 0, 1,
  ])
  expect(() => validateStrokes([])).toThrow("Nothing drawn")
  expect(() => validateStrokes([Array(2049).fill({x: 0, y: 0, t: 0})])).toThrow("Too much drawn")
})
