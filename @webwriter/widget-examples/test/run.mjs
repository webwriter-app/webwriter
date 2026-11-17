// Runs the check pages of the examples in headless Chrome and prints their results.
//
//   node test/run.mjs                 every examples/<name>/test.html
//   node test/run.mjs drag viewport   only these examples
//
// A page reports by POSTing {results: [{name, ok, error?, known?}]} to /__report, which
// test/harness.ts does. Environment: CHROME (binary), CHROME_FLAGS (extra flags), CHECK_TIMEOUT (ms per page).
// The Mocha tests of widget packages run with scripts/widget-test.mjs of the widgets workspace instead.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const timeout = Number(process.env.CHECK_TIMEOUT ?? 120000);
const flags = (process.env.CHROME_FLAGS ?? "").split(" ").filter(Boolean);

const examples = existsSync(join(root, "examples")) ? readdirSync(join(root, "examples")) : [];
const pages = examples
    .filter((name) => (args.length === 0 || args.includes(name)) && existsSync(join(root, "examples", name, "test.html")))
    .map((name) => `examples/${name}/test.html`);

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json" };
let report = () => {};
let progress = "";

const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "POST" && url.pathname === "/__progress") {
        progress = decodeURIComponent(url.search.slice(1));
        response.end();
        return;
    }
    if (request.method === "POST" && url.pathname === "/__report") {
        let body = "";
        request.on("data", (chunk) => (body += chunk));
        request.on("end", () => {
            response.end();
            try {
                report(JSON.parse(body));
            } catch {
                report({ results: [{ name: "report", ok: false, error: "unreadable report" }] });
            }
        });
        return;
    }
    const file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404).end();
        return;
    }
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
});

const profiles = [];
let browser = null;

function stop(child) {
    return new Promise((done) => {
        if (!child || child.exitCode !== null || child.signalCode !== null) return done();
        child.once("exit", done);
        try {
            process.kill(-child.pid, "SIGKILL"); // the whole group: Chrome's helpers too
        } catch {
            child.kill("SIGKILL");
        }
    });
}

async function runPage(page, port) {
    const profile = mkdtempSync(join(tmpdir(), "ww-checks-"));
    profiles.push(profile);
    const received = new Promise((done) => (report = done));
    progress = "";
    browser = spawn(
        chrome,
        ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--window-size=1000,800", ...flags, `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/${page}`],
        { stdio: "ignore", detached: true },
    );
    let timer;
    const failed = (error) => ({ results: [{ name: "page", ok: false, error }] });
    const result = await Promise.race([
        received,
        new Promise((done) => (timer = setTimeout(() => done(failed(`no report after ${timeout} ms; ${progress ? `stuck in "${progress}"` : "the page ran no check"}`)), timeout))),
        new Promise((done) => browser.once("error", (error) => done(failed(`cannot start Chrome: ${error.message}`)))),
    ]);
    clearTimeout(timer);
    await stop(browser);
    browser = null;
    return result.results ?? [];
}

let passed = 0;
let failed = 0;
const knownFailures = [];
try {
    if (pages.length === 0) throw new Error("no check pages found");
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address();
    for (const page of pages) {
        console.log(`\n${page}`);
        const results = await runPage(page, port);
        if (results.length === 0) results.push({ name: "page", ok: false, error: "the page reported no checks" });
        for (const { name, ok, error, known } of results) {
            // A known failure is a defect of a library the checks run against (knownFailure() in test/harness.ts).
            const state = known ? "KNOWN" : ok ? "PASS" : "FAIL";
            const lines = [known && `defect: ${known}`, error].filter(Boolean).join("\n");
            console.log(`  ${state.padEnd(5)} ${name}${lines ? `\n        ${lines.replaceAll("\n", "\n        ")}` : ""}`);
            if (known) knownFailures.push(`${page}: ${name}`);
            else ok ? passed++ : failed++;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed${knownFailures.length ? `, ${knownFailures.length} known ${knownFailures.length === 1 ? "failure" : "failures"}` : ""}`);
    for (const name of knownFailures) console.log(`  KNOWN ${name}`);
} catch (error) {
    console.error(error.message);
    failed++;
} finally {
    await stop(browser);
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    for (const profile of profiles) {
        try {
            // Chrome's helper processes may still be writing for a moment after the kill.
            rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        } catch {
            console.error(`could not remove ${profile}`);
        }
    }
}
process.exit(failed ? 1 : 0);
