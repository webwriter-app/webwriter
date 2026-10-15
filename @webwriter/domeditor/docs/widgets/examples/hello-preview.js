import {loadExample} from "./example-loader.js"

const requested = new URLSearchParams(location.search).get("library")
const library = ["vanilla", "lit", "react", "vue", "angular", "svelte"].includes(requested) ? requested : "lit"
await loadExample(library, "hello")
