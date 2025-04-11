import fs from "fs-extra"
import {execSync} from "child_process"
import path from "path"

const REGISTRY = "https://registry.npmjs.org"
const REGISTRY_SEARCH = `${REGISTRY}/-/v1/search`

const dirSize = async directory => {
    const files = await fs.readdir( directory );
    const stats = files.map( file => fs.stat( path.join( directory, file ) ) );
  
    return ( await Promise.all( stats ) ).reduce( ( accumulator, { size } ) => accumulator + size, 0 );
  }

const response = await fetch(REGISTRY_SEARCH + "?" + new URLSearchParams({
   text: "keywords:webwriter-widget",
   size: 250 
}))

const body = await response.json()

const pkgResults = body.objects
  .map(obj => obj.package)
  .filter(pkg => pkg.name.startsWith("@webwriter/"))

const pkgs = (await Promise.allSettled(pkgResults.map(async result => {
  const resp = await fetch(`https://cdn.jsdelivr.net/npm/${result.name}@${result.version}/package.json`)
  const pkg = JSON.parse(await resp.text())
  const snippetKeys = Object.keys(pkg.exports).filter(k => k.startsWith("./snippets/"))
  pkg.snippets = {}
  for(const k of snippetKeys) {
    try {
      const url = pkg.exports[k]?.default ?? pkg.exports[k]
      const snippetResp = await fetch(`https://cdn.jsdelivr.net/npm/${pkg.name}@${pkg.version}/${url.slice(2)}`)
      const snippet = await snippetResp.text()
      pkg.snippets[k] = snippet
    }
    catch(err) {
      console.error(err)
    }
  }
  return pkg
  })))
  .map(settled => {
    if(settled.status === "rejected") {
      console.warn(settled.reason)
      return undefined
    }
    else {
      return settled.value
    }
  })
  .filter(pkg => pkg)

fs.writeFileSync("resources/packages.json", JSON.stringify(pkgs, undefined, 2), "utf8")
fs.writeFileSync("public/webwriter-package-ids.json", JSON.stringify(pkgs.map(pkg => `${pkg.name}@${pkg.version}`), undefined, 2), "utf8")

/*

try {
  console.log(execSync(`npm install`, {cwd: "./public/widgetsrc"}).toString())
}
catch(err) {
  throw err
}

*/

/*
const importStatements = Object.fromEntries(names.map(name => [
    name,
    `import "redefine-custom-elements"; import "${name}"`
]))

const esbuildPath = path.normalize("public/widgetsrc/node_modules/.bin/esbuild")

const tsconfigPath = path.normalize("tmp/tsconfig.json")
fs.ensureFileSync(tsconfigPath)
fs.writeFileSync(tsconfigPath, `{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
`, {encoding: "utf8"})

const bundleSizes = []
const installSizes = []
for(const [i, name] of names.entries()) {
    const jsFile = `tmp/${name}.js`
    fs.ensureFileSync(jsFile)
    fs.writeFileSync(jsFile, importStatements[name], {encoding: "utf8"})
    const outFileJs = `public/widgetsrc/${name}.js`
    const outFileCss = outFileJs.slice(0, -3) + ".css"
    try {
      execSync(`${esbuildPath} --bundle ${jsFile} --tsconfig=tmp/tsconfig.json --outfile=${outFileJs} --minify`, {env: {"NODE_PATH": "public/widgetsrc/node_modules"}})
    }
    catch(err) {
      console.error(err)
      continue
    }
    const js = fs.statSync(outFileJs).size
    const css = fs.existsSync(outFileCss)? fs.statSync(outFileCss).size: 0
    const installSize = await dirSize(`public/widgetsrc/node_modules/${name}`)
    bundleSizes.push({js, css})
    installSizes.push(installSize)
}

// fs.rm("tmp", {recursive: true})
*/