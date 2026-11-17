// Where @webwriter/widget, @webwriter/lit and the other bindings come from: the sibling folders
// of this package in the WebWriter repository. Nothing of them is installed or copied here, so
// the next build has every change that was made there.
//
//   source (default)   the `source` target of an export, the .ts file, and inside a library the
//                      .ts beside every relative `.js` import: no build of the libraries is needed
//   LIBRARIES=built    the `default` target, the .js files `npm run build` writes in the two
//                      packages, which is what npm publishes
//
// A subpath that the package does not export does not resolve, as for a widget that installed it.
// `lit`, `@lit/*`, `@lit-labs/*` and `pixi.js` always come from this package's node_modules, also
// for a file of the checkout, so that a bundle holds one copy of each.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** The folder `@webwriter` that holds the libraries: the parent of this package. `WEBWRITER` names another one. */
export const checkout = resolve(process.env.WEBWRITER ?? join(root, ".."));
export const libraries = { "@webwriter/widget": join(checkout, "widget"), "@webwriter/lit": join(checkout, "lit") };
/** The bindings for other frameworks. They are plain .js files with no source target, and their frameworks come from the checkout's own node_modules. */
for (const name of ["react", "vue", "svelte", "angular"]) if (existsSync(join(checkout, name, "package.json"))) libraries[`@webwriter/${name}`] = join(checkout, name);
/** Where an example finds react, vue, svelte and @angular/*: the folder the bindings resolve them from. */
export const frameworkModules = join(checkout, "../node_modules");
export const built = process.env.LIBRARIES === "built";

/** The packages a bundle may hold only once, wherever the importing file is. */
const single = /^(lit|lit-html|lit-element|@lit\/[^/]+|@lit-labs\/[^/]+|pixi\.js|signal-polyfill)(\/|$)/;
const inside = (file, dir) => file.startsWith(dir + sep);
const manifest = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

/** Name and version of the two libraries, or the reason they cannot be used. */
export function libraryVersions() {
    const versions = {};
    for (const [name, dir] of Object.entries(libraries)) {
        if (!existsSync(join(dir, "package.json"))) throw new Error(`${name} was not found at ${dir}. This package needs its sibling folders in the WebWriter repository, or WEBWRITER=<an @webwriter folder>.`);
        versions[name] = manifest(dir).version;
    }
    return versions;
}

/** The file an import of a library resolves to, by the package's own `exports`. */
export function libraryFile(specifier, useBuilt = built) {
    const name = Object.keys(libraries).find((each) => specifier === each || specifier.startsWith(each + "/"));
    if (!name) return undefined;
    const subpath = "." + specifier.slice(name.length);
    const target = manifest(libraries[name]).exports?.[subpath];
    if (!target) throw new Error(`${name} does not export "${subpath}"`);
    return join(libraries[name], typeof target === "string" ? target : useBuilt ? target.default : target.source ?? target.default);
}

/** The esbuild plugin that resolves the two libraries as described at the top. */
export function repositoryLibraries() {
    return {
        name: "repository-libraries",
        setup(build) {
            // esbuild reads `sideEffects` of a package only for a path it resolved itself.
            const pure = (file) => {
                const dir = Object.values(libraries).find((each) => inside(file, each));
                return dir && manifest(dir).sideEffects === false ? { path: file, sideEffects: false } : { path: file };
            };
            build.onResolve({ filter: /^@webwriter\/(widget|lit|react|vue|svelte|angular)(\/|$)/ }, (args) => {
                try {
                    return pure(libraryFile(args.path));
                } catch (error) {
                    return { errors: [{ text: error.message }] };
                }
            });
            if (!built) {
                build.onResolve({ filter: /^\.\.?\/.*\.js$/ }, (args) => {
                    if (!Object.values(libraries).some((dir) => inside(args.importer, dir))) return undefined;
                    const source = resolve(args.resolveDir, args.path).replace(/\.js$/, ".ts");
                    return existsSync(source) ? pure(source) : undefined;
                });
            }
            build.onResolve({ filter: single }, async (args) => {
                // The call below comes back here without an importer.
                if (!args.importer || inside(args.importer, root)) return undefined;
                const found = await build.resolve(args.path, { resolveDir: root, kind: args.kind });
                return found.errors.length ? undefined : found;
            });
        },
    };
}

/** The package a bundled file belongs to and the folder it was taken from. */
function packageOf(file) {
    for (const [name, dir] of Object.entries(libraries)) if (inside(file, dir)) return { name, dir };
    const at = file.lastIndexOf(`${sep}node_modules${sep}`);
    if (at < 0) return undefined;
    const parts = file.slice(at + 14).split(sep);
    const name = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
    return { name, dir: join(file.slice(0, at + 13), name) };
}

/**
 * What is wrong with the bundles of an esbuild metafile: a package that a bundle holds from two
 * folders (two copies of lit, say), a library that was not taken from the checkout, and a library
 * module that is in a bundle both as its source and as its built file.
 */
export function bundleProblems(metafile, base) {
    const problems = [];
    for (const [output, { inputs }] of Object.entries(metafile.outputs)) {
        if (output.endsWith(".map")) continue;
        const folders = new Map();
        const modules = new Map();
        for (const input of Object.keys(inputs)) {
            const file = resolve(base, input.replace(/^[a-z-]+:/, ""));
            const found = packageOf(file);
            if (!found) continue;
            folders.set(found.name, (folders.get(found.name) ?? new Set()).add(found.dir));
            if (found.name in libraries) {
                const module = file.replace(/\.[jt]s$/, "");
                modules.set(module, (modules.get(module) ?? new Set()).add(file));
            }
        }
        for (const [name, dirs] of folders) {
            if (dirs.size > 1) problems.push(`${output} holds ${dirs.size} copies of ${name}: ${[...dirs].map((dir) => relative(root, dir)).join(", ")}`);
            if (name in libraries && !dirs.has(libraries[name])) problems.push(`${output} holds ${name} from ${[...dirs].join(", ")}, not from the checkout`);
        }
        for (const files of modules.values()) {
            if (files.size > 1) problems.push(`${output} holds a library module twice: ${[...files].map((file) => relative(checkout, file)).join(" and ")}`);
        }
    }
    return problems;
}
