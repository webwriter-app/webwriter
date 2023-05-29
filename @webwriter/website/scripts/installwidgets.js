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

const widgets = body.objects.map(obj => obj.package)
const names = widgets.map(widget => widget.name)

fs.ensureDir("public/widgetsrc")
fs.writeJSONSync("public/widgetsrc/package.json", {
  name: "@webwriter/website-dependencies",
  version: "0.0.0",
  private: true,
  dependencies: {
    ...Object.fromEntries(names.map(name => [name, "*"]))
  }
}, {spaces: "\t"})

execSync(`npm --prefix ./public/widgetsrc install`, (error, stdout, stderr) => {
    error && console.error(error.message)
    stderr && console.error(stderr)
    stdout && console.log(stdout)
})

const importStatements = Object.fromEntries(names.map(name => [
    name,
    `import "redefine-custom-elements"; import "${name}"`
]))

const bundleSizes = []
const installSizes = []
for(const [i, name] of names.entries()) {
    const jsFile = `tmp/${name}.js`
    fs.ensureFileSync(jsFile)
    fs.writeFileSync(jsFile, importStatements[name], {encoding: "utf8"})
    const outFileJs = `public/widgetsrc/${name}.js`
    const outFileCss = outFileJs.slice(0, -3) + ".css"
    execSync(`npx esbuild --bundle ${jsFile} --outfile=${outFileJs} --minify`, {env: {"NODE_PATH": "public/widgetsrc"}}, (error, stdout, stderr) => {
        error && console.error(error.message)
        stderr && console.error(stderr)
        stdout && console.log(stdout)
    })
    const js = fs.statSync(outFileJs).size
    const css = fs.existsSync(outFileCss)? fs.statSync(outFileCss).size: 0
    const installSize = await dirSize(`../../node_modules/${name}`)
    bundleSizes.push({js, css})
    installSizes.push(installSize)
}

fs.rm("tmp", {recursive: true})

const packages = names
    .map(name => JSON.parse(fs.readFileSync(`public/widgetsrc/node_modules/${name}/package.json`, "utf8")))
    .map((pkg, i) => ({...widgets[i], ...pkg, bundleSize: bundleSizes[i], installSize: installSizes[i]}))
fs.writeFileSync("resources/widgets.json", JSON.stringify(packages, undefined, 2), "utf8")