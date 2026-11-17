import {base64DataURL, cssFontString, fontCSSDataURL} from "./local-fonts"

const group = "Math fonts"
export const mathFontOptions = [
  {label: "Default math", value: "", group},
  ...["Libertinus Math", "Noto Sans Math"].map(label => ({label, group, value: `${cssFontString(label)}, math`})),
]

export async function embeddedMathFont(option: {label: string, value: string}, url: URL) {
  const response = await fetch(url)
  if(!response.ok) throw new Error("Could not load math font")
  const source = base64DataURL(new Uint8Array(await response.arrayBuffer()), "font/woff2")
  const stylesheet = fontCSSDataURL(`@font-face {font-family: ${cssFontString(option.label)}; src: url("${source}");}`)
  return {family: option.label, value: option.value, stylesheet}
}
