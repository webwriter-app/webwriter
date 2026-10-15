const requested = new URLSearchParams(location.search).get("library")
const library = ["vanilla", "lit", "react", "vue", "angular", "svelte"].includes(requested) ? requested : "lit"
const directory = library === "vanilla" ? "" : `${library}/`
const extension = ({react: "jsx", angular: "ts", svelte: "svelte"})[library] ?? "js"
const source = `./${directory}hello.${extension}`
await import(/* @vite-ignore */ source)
