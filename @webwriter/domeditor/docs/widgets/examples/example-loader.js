// Explicit lazy entries let Vite bundle every preview without fetching raw sources at runtime.
const examples = import.meta.glob([
  "./0*.js", "./hello.js",
  "./lit/0*.js", "./lit/hello.js",
  "./react/0*.jsx", "./react/hello.jsx",
  "./vue/0*.js", "./vue/hello.js",
  "./angular/0*.ts", "./angular/hello.ts",
  "./svelte/0*.svelte", "./svelte/hello.svelte",
])

export function loadExample(library, name) {
  const directory = library === "vanilla" ? "" : `${library}/`
  const extension = ({react: "jsx", angular: "ts", svelte: "svelte"})[library] ?? "js"
  return examples[`./${directory}${name}.${extension}`]()
}
