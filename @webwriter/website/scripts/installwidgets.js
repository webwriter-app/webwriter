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

fs.ensureDirSync("public/widgetsrc")
fs.writeJSONSync("public/widgetsrc/package.json", {
  name: "@webwriter/website-dependencies",
  version: "0.0.0",
  private: true,
  dependencies: {
    "esbuild": "*",
    ...Object.fromEntries(names.map(name => [name, "*"]))
  },
  scripts: {"esbuild": "esbuild"}
}, {spaces: "\t"})

try {
  console.log(execSync(`npm install`, {cwd: "./public/widgetsrc"}).toString())
}
catch(err) {
  throw err
}

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

const packages = names
    .map(name => JSON.parse(fs.readFileSync(`public/widgetsrc/node_modules/${name}/package.json`, "utf8")))
    .map((pkg, i) => ({...widgets[i], ...pkg}))
fs.writeFileSync("resources/widgets.json", JSON.stringify(packages, undefined, 2), "utf8")