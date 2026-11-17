// Bundles every examples/<name>/index.ts and examples/<name>/test.ts into dist/<name>/.
// @webwriter/widget and @webwriter/lit come from the sibling folders of this package (scripts/libraries.mjs):
// from their sources, or with LIBRARIES=built from the files that are published.
import { build } from "esbuild";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { built, bundleProblems, frameworkModules, libraryVersions, repositoryLibraries, root } from "./libraries.mjs";

// `node scripts/build.mjs sort-list scene` builds only those examples and leaves the
// rest of dist/ alone, so several people can work on different examples at once.
const only = process.argv.slice(2);
const names = readdirSync(join(root, "examples"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && (only.length === 0 || only.includes(entry.name)))
    .map((entry) => entry.name);
const entryPoints = names
    .flatMap((name) => ["index.ts", "test.ts", "test.tsx"].map((file) => join(root, "examples", name, file)))
    .filter(existsSync);

if (only.length === 0) rmSync(join(root, "dist"), { recursive: true, force: true });
else for (const name of names) rmSync(join(root, "dist", name), { recursive: true, force: true });
const versions = libraryVersions();
const { metafile } = await build({
    absWorkingDir: root,
    entryPoints,
    outdir: join(root, "dist"),
    outbase: join(root, "examples"),
    bundle: true,
    format: "esm",
    target: "es2022",
    sourcemap: true,
    metafile: true,
    logLevel: "warning",
    // The frameworks of the bindings (react, vue, svelte, @angular/*) are installed in the checkout only.
    nodePaths: [frameworkModules],
    plugins: [repositoryLibraries()],
});
// One copy of lit, of pixi.js and of each library in every bundle, and the libraries from the checkout.
const problems = bundleProblems(metafile, root);
for (const problem of problems) console.error(`error: ${problem}`);
if (problems.length) process.exit(1);
const from = Object.entries(versions).filter(([name]) => /widget$|lit$/.test(name)).map(([name, version]) => `${name} ${version}`).join(" and ");
console.log(`built ${entryPoints.length} entry points into dist/ with the ${built ? "built files" : "sources"} of ${from}`);
