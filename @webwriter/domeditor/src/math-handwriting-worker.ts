import rendererURL from "temml/dist/temml.mjs?url"
import {getSession, predictLatexFromStrokes, type Stroke} from "./math-handwriting-ocr"

export type HandwritingRequest = {id: number, strokes?: Stroke[]}
export type HandwritingResponse = {id: number, mathml?: string, error?: string}

// Keep Temml's published module intact: bundling it corrupts the Unicode
// surrogate ranges in its lexer and splits commands such as \sum into \s + um.
let renderer: Promise<typeof import("temml").default> | undefined
const loadRenderer = () => renderer ??= import(/* @vite-ignore */ new URL(rendererURL, import.meta.url).href)
  .then(module => module.default as typeof import("temml").default)

// Model loading, inference and TeX conversion all stay off the UI thread.
globalThis.addEventListener("message", async (event: MessageEvent<HandwritingRequest>) => {
  const {id, strokes} = event.data
  try {
    let mathml: string | undefined
    if(strokes) {
      const latex = await predictLatexFromStrokes(strokes)
      if(!latex.trim()) throw new Error("No formula recognized. Try writing it again.")
      const temml = await loadRenderer()
      mathml = temml.renderToString(latex, {throwOnError: true, trust: false, annotate: false, xml: true})
    }
    else await Promise.all([getSession(), loadRenderer()])
    globalThis.postMessage({id, mathml} satisfies HandwritingResponse)
  }
  catch(error) {
    globalThis.postMessage({id, error: error instanceof Error ? error.message : String(error)} satisfies HandwritingResponse)
  }
})
