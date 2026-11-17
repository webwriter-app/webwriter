// Builds the WebWriter package of the examples: webwriter/dist/<tag>.js for every
// `./widgets/<tag>.js` export of webwriter/package.json, from its `source` to its
// `default`, the way @webwriter/build reads a package.
//
//   node scripts/build-webwriter.mjs
//
// Each module is one self-contained ES module (lit, @webwriter/lit, @webwriter/widget
// and pixi.js included). WebWriter links the scripts of a local package into an import
// map against jsDelivr; a module without imports needs no mapping and no network.
// The catalogs of module text, which a module imports on demand, are part of the file too.
//
// @webwriter/widget and @webwriter/lit come from the sibling folders of this package
// (scripts/libraries.mjs): from their sources, or with LIBRARIES=built from the
// files that are published.
//
// The manifest, its editing configuration, the entry modules in webwriter/src and
// the snippets are source. Only webwriter/dist is generated, and git-ignored.
import { build } from "esbuild";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { built, bundleProblems, libraryVersions, repositoryLibraries, root } from "./libraries.mjs";

const pkg = join(root, "webwriter");
const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
const versions = libraryVersions();
const problems = [];

/** The key the editor gives an export and its editing configuration: the subpath without its extension. */
const keyOf = (name) => name.replace(/\.\*$/, "").replace(/\.(?:html?|m?js|css|ts)$/i, "");
const exportsOf = (prefix) => Object.entries(manifest.exports ?? {}).filter(([name]) => name.startsWith(prefix));

// 1. The widget modules.
const widgets = exportsOf("./widgets/").map(([name, target]) => ({
    tag: keyOf(name).split("/").at(-1),
    source: target?.source && join(pkg, target.source),
    output: target?.default && join(pkg, target.default),
}));
const entries = [];
for (const { tag, source, output } of widgets) {
    if (!source || !output) problems.push(`exports["./widgets/${tag}.js"] needs a "source" and a "default"`);
    else if (!existsSync(source)) problems.push(`${relative(root, source)} does not exist`);
    else if (!output.endsWith(".js") || !output.startsWith(join(pkg, "dist"))) problems.push(`${tag}: "default" must be a .js file in ./dist`);
    else entries.push({ tag, in: source, out: relative(join(pkg, "dist"), output).replace(/\.js$/, "") });
}

rmSync(join(pkg, "dist"), { recursive: true, force: true });
if (problems.length === 0 && entries.length) {
    const result = await build({
        absWorkingDir: root,
        entryPoints: entries.map(({ in: source, out }) => ({ in: source, out })),
        outdir: join(pkg, "dist"),
        bundle: true,
        format: "esm",
        target: "es2022",
        sourcemap: true,
        metafile: true,
        logLevel: "warning",
        plugins: [repositoryLibraries()],
    });
    problems.push(...bundleProblems(result.metafile, root));
    for (const [file, output] of Object.entries(result.metafile.outputs)) {
        if (file.endsWith(".map")) continue;
        // An import that is left would have to be resolved by the editor's import map or by a file beside the module.
        for (const { path, external } of output.imports) problems.push(`${file} still imports "${path}"${external ? " (external)" : ""}`);
    }
}

// 2. The snippets: each file exists and uses only elements of this package.
const tags = new Set(widgets.map(({ tag }) => tag));
for (const [name, target] of exportsOf("./snippets/")) {
    const file = typeof target === "string" && join(pkg, target);
    if (!file || !existsSync(file)) {
        problems.push(`exports["${name}"]: ${target} does not exist`);
        continue;
    }
    for (const [, tag] of readFileSync(file, "utf8").matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]*)/g)) {
        if (!tags.has(tag)) problems.push(`${relative(root, file)} uses <${tag}>, which is no widget export of the package`);
    }
}

// 3. The editing configuration: every entry belongs to an export, every member has a label, and a
// content expression names only HTML elements, the editor's groups and widgets or groups of this package.
const keys = new Set(Object.keys(manifest.exports ?? {}).map(keyOf));
const config = manifest.editingConfig ?? {};
const groups = new Set(["flow", "phrasing", "heading", "sectioning", "widget", "widgetinline", ...Object.values(config).flatMap((entry) => (entry.group ?? "").split(/\s+/))]);
for (const [key, entry] of Object.entries(config)) {
    if (key !== "." && !keys.has(key)) problems.push(`editingConfig["${key}"] matches no export`);
    for (const name of (entry.content ?? "").match(/[a-z][a-z0-9-]*/gi) ?? []) {
        if (name.includes("-") && !tags.has(name) && !groups.has(name)) problems.push(`editingConfig["${key}"].content names <${name}>, which is no widget export of the package`);
    }
}
for (const key of keys) if (!config[key]?.label) problems.push(`editingConfig["${key}"] has no label`);

for (const { tag, out } of entries) {
    const file = join(pkg, "dist", `${out}.js`);
    if (existsSync(file)) console.log(`  ${`<${tag}>`.padEnd(22)} ${relative(root, file).padEnd(38)} ${(statSync(file).size / 1024).toFixed(0).padStart(5)} kB`);
    else problems.push(`${relative(root, file)} was not written`);
}
if (problems.length) {
    for (const problem of problems) console.error(`error: ${problem}`);
    process.exit(1);
}
const from = Object.entries(versions).map(([name, version]) => `${name} ${version}`).join(" and ");
console.log(`built ${entries.length} widget modules into ${relative(root, join(pkg, "dist"))}/ (${exportsOf("./snippets/").length} snippets, ${manifest.name}@${manifest.version}) with the ${built ? "built files" : "sources"} of ${from}`);
