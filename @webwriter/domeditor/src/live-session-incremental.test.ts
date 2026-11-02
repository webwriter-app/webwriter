import {describe, expect, it} from "vitest"
import {IncrementalPreviewRecorder, reconstructIncrementalPreview} from "./live-session-incremental"

describe("incremental preview recording", () => {
  it("reconstructs arbitrary HTML and seeks from a later checkpoint", () => {
    const initial = '<!DOCTYPE html><html><body><!--keep--><x-quiz a="1"><svg><path /></svg></x-quiz>text</body></html>'
    const first = initial.replace('a="1"', 'a="2"').replace("text", "new text")
    const second = first.replace("<!--keep-->", "<!--changed--><p>😀</p>")
    const third = second.replace("😀", "😁").replace("<svg><path /></svg>", "")
    const recorder = new IncrementalPreviewRecorder(initial)
    try {
      const beginning = recorder.checkpoint()
      const one = recorder.capture(first)!
      const two = recorder.capture(second)!
      const middle = recorder.checkpoint()
      const three = recorder.capture(third)!
      expect(recorder.capture(third)).toBeNull()
      expect(reconstructIncrementalPreview(beginning, [])).toBe(initial)
      expect(reconstructIncrementalPreview(beginning, [one])).toBe(first)
      expect(reconstructIncrementalPreview(beginning, [one, two, three])).toBe(third)
      expect(reconstructIncrementalPreview(middle, [three])).toBe(third)
      expect(() => reconstructIncrementalPreview(beginning, [three])).toThrow("Incomplete preview updates")
    }
    finally { recorder.destroy() }
  })

  it("makes small edits substantially smaller than repeated full snapshots", () => {
    const initial = `<html><body>${"<p>Example content</p>".repeat(1000)}</body></html>`
    const recorder = new IncrementalPreviewRecorder(initial)
    try {
      const checkpoint = recorder.checkpoint()
      const changed = initial.replace("Example content", "Edited content")
      const update = recorder.capture(changed)!
      expect(reconstructIncrementalPreview(checkpoint, [update])).toBe(changed)
      expect(update.byteLength).toBeLessThan(new TextEncoder().encode(changed).byteLength / 10)
    }
    finally { recorder.destroy() }
  })
})
