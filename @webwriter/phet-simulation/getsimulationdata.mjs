import {Builder, By} from "selenium-webdriver"
import {writeFileSync} from "fs"

const LIST_URL = "https://phet.colorado.edu/en/simulations/filter?type=html,prototype&view=list"

let driver = await new Builder().forBrowser("firefox").build();
await driver.get(LIST_URL)
await new Promise(resolve => setTimeout(resolve, 5000))
const aElements = await driver.findElements(By.css(".tile.list"))
const links = await Promise.all(aElements.map(a => a.getAttribute("href")))
const simulations = {}
for(const link of links) {
  const id = new URL(link).pathname.split("/").at(-1)
  await driver.get(link)
  await new Promise(resolve => setTimeout(resolve, 2000))
  const title = await (await driver.findElement(By.css(".title"))).getText()
  const latest = (await (await driver.findElement(By.css(".version"))).getText()).replace("Version ", "")
  const topics = await Promise.all((await driver.findElements(By.css(".topics li"))).map(we => we.getText()))
  const learningGoals = await Promise.all((await driver.findElements(By.css(".learning-goals li"))).map(we => we.getText()))
  const accessibilityFeatures = await Promise.all((await driver.findElements(By.css(".accessibility-feature p"))).map(we => we.getText()))
  const relatedSims = (await Promise.all((await driver.findElements(By.css(".related-sims a"))).map(we => we.getAttribute("href")))).map(relatedLink => relatedLink.split("/").at(-1))
  
  await driver.get(link + `/translations`)
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  const translations = {}
  const translationAnchors = await driver.findElements(By.css(".translations-panel .simulation-column .floating-link"))
  for(const anchor of translationAnchors) {
    const lang = (await anchor.getAttribute("href"))
      .replace(`https://phet.colorado.edu/sims/html/${id}/latest/${id}_`, "")
      .replace(".html", "")
    translations[lang] = await anchor.getText()
  }

  await driver.get(link); await driver.get(link + `/credits`)
  await new Promise(resolve => setTimeout(resolve, 2000))
  const contributors = await Promise.all((await driver.findElements(By.css(".credits-panel .column:nth-child(1) li"))).map(we => we.getText()))
  const thirdPartyLibraries = (await Promise.all((await driver.findElements(By.css(".credits-panel .column:nth-child(2) li"))).map(we => we.getText()))).filter(library => library)
  
  simulations[id] = {title, latest, topics, learningGoals, accessibilityFeatures, translations, contributors, thirdPartyLibraries, relatedSims}
}
await driver.quit()
writeFileSync("simulations.json", JSON.stringify(simulations, null, 4), "utf8")