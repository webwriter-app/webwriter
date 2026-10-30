import {resolve} from "node:path"

const prefix = "virtual:app-entry/"
const entries = new Set(["editor-entry", "preview-entry", "live-learner-entry", "gallery-preview-entry"])

/** Reference executable chunks without importing them into the host window. */
export function appEntryUrlsPlugin() {
  let config
  return {
    name: "app-entry-urls",
    configResolved(value) { config = value },
    resolveId(id) {
      if(id.startsWith(prefix) && entries.has(id.slice(prefix.length))) return `\0${id}`
    },
    load(id) {
      if(!id.startsWith(`\0${prefix}`)) return
      const name = id.slice(prefix.length + 1)
      if(!entries.has(name)) return
      if(config.command !== "build") return `export default ${JSON.stringify(`${config.base}src/${name}.ts`)}`
      const reference = this.emitFile({type: "chunk", id: resolve(config.root, `src/${name}.ts`), name})
      // Keep the path origin-relative: callers load it on the isolated frame origin.
      return `export default new URL(import.meta.ROLLUP_FILE_URL_${reference}).pathname`
    },
  }
}
