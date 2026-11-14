import {build} from "esbuild-wasm"

await build({
  entryPoints: ["ww-ghost-disco.js"],
  outdir: "dist",
  bundle: true,
  splitting: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
})
