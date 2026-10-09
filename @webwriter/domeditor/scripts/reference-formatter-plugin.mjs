import {build} from "esbuild"

/** Embed formatting and styles in standalone HTML without network imports. */
export function referenceFormatterPlugin(entry) {
  const id = "virtual:reference-formatter-source"
  return {
    name: "reference-formatter-source",
    resolveId(source) { if(source === id) return `\0${id}` },
    async load(source) {
      if(source !== `\0${id}`) return
      this.addWatchFile(entry)
      const result = await build({entryPoints: [entry], bundle: true, write: false,
        platform: "browser", format: "iife", globalName: "referenceFormatter", minify: true,
        plugins: [{name: "native-fetch", setup(builder) {
          builder.onResolve({filter: /^node-fetch$/}, () => ({path: "native-fetch", namespace: "browser"}))
          builder.onLoad({filter: /.*/, namespace: "browser"}, () => ({
            contents: "export default globalThis.fetch; export const Headers = globalThis.Headers;",
          }))
        }}]})
      return `export default ${JSON.stringify(result.outputFiles[0].text)}`
    },
  }
}
