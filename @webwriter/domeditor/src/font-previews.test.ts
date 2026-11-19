import {readFileSync} from "node:fs"
import {describe, expect, it} from "vitest"
import metadata from "./assets/font-previews/metadata.json"
import {fontPreview} from "./font-previews"

describe("bundled font preview sprites", () => {
  it("shares chunk URLs and crops adjacent families to different rows", () => {
    const first = fontPreview(metadata.families[0])!, next = fontPreview(metadata.families[1])!
    expect(first.url).toBe(next.url)
    expect(first.offset).toBe(0)
    expect(next.offset).toBe(24)
    const boundary = fontPreview(metadata.families[metadata.chunkSize])!
    expect(boundary.url).not.toBe(first.url)
    expect(boundary.offset).toBe(0)
    expect(fontPreview("Future Font")).toBeUndefined()
  })

  it("ships complete two-times-resolution WebP chunks for the catalog", () => {
    expect(new Set(metadata.families).size).toBe(metadata.families.length)
    for(let chunk = 0; chunk * metadata.chunkSize < metadata.families.length; chunk++) {
      const bytes = readFileSync(new URL(`./assets/font-previews/chunk-${chunk}.webp`, import.meta.url))
      expect(bytes.subarray(0, 4).toString()).toBe("RIFF")
      expect(bytes.subarray(8, 12).toString()).toBe("WEBP")
      expect(bytes.subarray(12, 16).toString()).toBe("VP8X")
      expect(bytes.readUIntLE(24, 3) + 1).toBe(metadata.width)
      expect(bytes.readUIntLE(27, 3) + 1).toBe(Math.min(metadata.chunkSize, metadata.families.length - chunk * metadata.chunkSize) * metadata.rowHeight)
    }
    expect(fontPreview(metadata.families.at(-1)!)?.url).toBeTruthy()
  })
})
