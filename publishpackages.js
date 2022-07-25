/*
Publishes all sub packages to npm.
*/

const fs = require('fs')
const path = require('path')
const {execSync} = require('child_process')

const PRIORITIES = ["webwriter-lit", "webwriter-model"]


const PACKAGES_PATH = path.normalize("./packages")

const getDirectories = source =>
  fs.readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort((a, b) => PRIORITIES.indexOf(b) - PRIORITIES.indexOf(a))

console.log(getDirectories(PACKAGES_PATH))

async function main() {
  const dirs = getDirectories(PACKAGES_PATH).map(dir => path.join(PACKAGES_PATH, dir))
  console.log(dirs)
  for(const dir of dirs) {

    console.log(`INSTALLING ${dir}`)
    execSync(`npm install -s ${dir}`, {encoding: "utf8"})
    console.log(`UPDATING ${dir}`)
    execSync(`npx npm-check-updates -u --cwd ${dir}`, {encoding: "utf8"})
    console.log(`BUILDING ${dir}`)
    execSync(`npm run build --if-present --prefix ${dir}`, {encoding: "utf8"})
    console.log(`BUMPING ${dir}`)
    execSync(`npm version patch --prefix ${dir}`, {encoding: "utf8"})
    console.log(`PUBLISHING ${dir}`)
    execSync(`npm publish ${dir}`, {encoding: "utf8"})
  }
}

main().catch((e) => {
  throw e
})