import * as utility from "@webwriter/core/utility"
import assert from "assert"

type TestEntry = {args?: any[], returnValue: any}
const testData: Partial<Record<keyof typeof utility, TestEntry | TestEntry[]>> = {
  getFileExtension: {args: ["myfile.json"], returnValue: "json"},
  capitalizeWord: {args: ["brother"], returnValue: "Brother"},
  camelCaseToSpacedCase: [
    {args: ["myCoolName", true], returnValue: "My Cool Name"},
    {args: ["myCoolName", false], returnValue: "my Cool Name"}
  ],
  prettifyPackageName: [
    {args: ["@webwriter/ww-figure"], returnValue: "Figure"},
    {args: ["@webwriter/ww-code-cell"], returnValue: "Code Cell"},
    {args: ["@webwriter/ww-code-cell", "first"], returnValue: "Code cell"}
  ],
  unscopePackageName: {args: ["@webwriter/ww-figure"], returnValue: "ww-figure"},
  arrayReplaceAt: {args: [[1, 2, 3], 1, "x"], returnValue: [1, "x", 3]},
  escapeHTML: {args: ["&<>\"\'test"], returnValue: "&amp;&lt;&gt;&quot;&#039;test"}
}


describe("@webwriter/core/utility", () => {
  for (const name in utility) {
    const entries = !Array.isArray(testData[name])? [testData[name]]: testData[name]
    if(!testData[name]) {
      continue
    }
    for(const entry of entries) {
      const args = entry?.args?.map(arg => JSON.stringify(arg)).join(", ")
      const returnValue = JSON.stringify(entry.returnValue)
      it(`${name}(${args ?? ""}) => ${returnValue}`, () => {
        assert.deepEqual(utility[name](...entry.args ?? []), entry.returnValue)
      })
    }
  }
})