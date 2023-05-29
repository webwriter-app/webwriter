import { Octokit } from "@octokit/rest";
import fs from "fs-extra"

const octokit = new Octokit()
const latestRelease = (await octokit.repos.getLatestRelease({owner: "webwriter-app", repo: "webwriter"})).data

fs.ensureDirSync("public")
fs.writeFileSync("public/releases.json", JSON.stringify(latestRelease), "utf8")