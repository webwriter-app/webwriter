import { describe, expect, it, vi } from "vitest"
import { distributionReaderPlugin } from "./distribution-reader-plugin.mjs"

const expectedSources = ["core", "insert"]

async function loadSources() {
  const plugin = distributionReaderPlugin()
  const watchFile = vi.fn()
  const id = plugin.resolveId("virtual:distribution-reader-sources")
  const output = await plugin.load.call({ addWatchFile: watchFile }, id)
  const match = output.match(/^export default (.*)$/s)
  if (!match) throw new Error("Virtual distribution module did not export a source record")
  return { sources: JSON.parse(match[1]) as Record<string, string>, watchFile }
}

describe("distribution reader virtual sources", () => {
  it("builds separate self-contained sources without host UI references", async () => {
    const { sources, watchFile } = await loadSources()
    expect(Object.keys(sources)).toEqual(expectedSources)
    for (const [name, source] of Object.entries(sources)) {
      expect(source, name).toMatch(/\(\(\)=>|var distribution(?:Reader|Action)/)
      expect(source, name).not.toMatch(/^\s*import\s/m)
      expect(source, name).not.toMatch(/editor-entry|app-settings|domeditor-toolbox|domeditor-ribbon/i)
    }
    expect(watchFile).toHaveBeenCalledWith(expect.stringMatching(/src\/domeditor-core\.ts$/))
    expect(watchFile).toHaveBeenCalledWith(expect.stringMatching(/src\/editor\.css$/))
    expect(watchFile).toHaveBeenCalledWith(expect.stringMatching(/src\/features\/selection\.ts$/))
    expect(watchFile).toHaveBeenCalledWith(expect.stringMatching(/src\/features\/manipulation\.ts$/))
    expect(watchFile).not.toHaveBeenCalledWith(expect.stringMatching(/src\/(?:domeditor|serialization|app-settings)\.ts$/))
    expect(sources.core.length).toBeGreaterThan(10_000)
    expect(sources.core.length).toBeLessThan(1_750_000)
    expect(watchFile).toHaveBeenCalledWith(expect.stringMatching(/src\/distribution-reader\.ts$/))
    expect(watchFile).toHaveBeenCalledWith(expect.stringMatching(/src\/distribution-reader-actions\.ts$/))
  })

  it("omits the discarded text, size and movement dialogs from every permission module", async () => {
    const { sources } = await loadSources()
    for(const source of Object.values(sources)) expect(source).not.toMatch(/Apply size|Width \(px\)|Height \(px\)|Element CSS declarations|Edit text|Move earlier|Move later/)
  })
})
