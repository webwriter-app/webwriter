import deepl from "deepl-node"
import fs from "fs-extra"
import { join } from "path"

async function main() {
  const dirPath = "./public/de/explorables/examples"
  const dir = await fs.readdir(dirPath)
  const paths = dir
    .map(relPath =>  join(dirPath, relPath))
  await Promise.allSettled(paths.map(translate))
}

async function translate(path) {
  let targetPath
  try {
    const translator = new deepl.Translator(process.env.DEEPL_API_KEY)
    targetPath = path.replace("/de/", "/en/")
    await translator.translateDocument(
      path,
      targetPath,
      "de",
      "en-US"
    )
  }
  catch(err) {
    console.error(err)
  }
}

main()