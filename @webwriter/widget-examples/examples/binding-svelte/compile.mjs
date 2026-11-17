// The build of the examples has no Svelte compiler step, so the components of this folder are compiled here, with
// the compiler of the checkout, into `<name>.svelte.js` beside them. `node examples/binding-svelte/compile.mjs`,
// then `node scripts/build.mjs binding-svelte`. The imports stay as they are: the build resolves them.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const folder = dirname(fileURLToPath(import.meta.url));
const { compile } = await import(pathToFileURL("/Users/fsalmen/Projekte/webwriter/node_modules/svelte/src/compiler/index.js").href);

for (const file of readdirSync(folder).filter((name) => name.endsWith(".svelte"))) {
    const { js, warnings } = compile(readFileSync(join(folder, file), "utf8"), { filename: file, generate: "client", customElement: true, css: "injected", dev: false });
    for (const warning of warnings) console.warn(`${file}: ${warning.message}`);
    writeFileSync(join(folder, `${file}.js`), js.code);
    console.log(`compiled ${file}`);
}
