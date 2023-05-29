import { Octokit } from "@octokit/rest";
import fs from "fs-extra"

const octokit = new Octokit()
const latestRelease = (await octokit.repos.getLatestRelease({owner: "webwriter-app", repo: "webwriter"})).data

const latestJSONUrl = latestRelease.assets.find(asset => asset.name === "latest.json").browser_download_url

const latestJSON = await (await fetch(latestJSONUrl)).json()

fs.ensureDirSync("public")
fs.writeFileSync("public/releases.json", JSON.stringify(latestRelease), "utf8")
fs.writeFileSync("public/latest.json", JSON.stringify(latestJSON), "utf8")