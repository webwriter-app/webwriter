import { describe, expect, it, vi } from "vitest"
import { distributionReaderPlugin } from "./distribution-reader-plugin.mjs"

const expectedSources = ["core", "edit", "move", "style", "delete", "duplicate", "insert"]

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
      expect(source, name).not.toMatch(/editor-bridge|editor-entry|app-settings|src\/components|window\.parent|parent\.postMessage/i)
    }
    expect(sources.core.length).toBeGreaterThan(10_000)
    expect(sources.core.length).toBeLessThan(500_000)
    expect(watchFile).toHaveBeenCalledWith(expect.stringMatching(/src\/distribution-reader\.ts$/))
    expect(watchFile).toHaveBeenCalledWith(expect.stringMatching(/src\/distribution-reader-actions\.ts$/))
  })

  it("keeps numeric resize controls in the style bundle and out of edit", async () => {
    const { sources } = await loadSources()
    expect(sources.edit).not.toMatch(/Apply size|Width \(px\)|Height \(px\)/i)
    expect(sources.style).toMatch(/Apply size|Width \(px\)|Height \(px\)/i)
  })
})
