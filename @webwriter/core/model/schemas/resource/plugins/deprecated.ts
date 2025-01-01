import {SchemaPlugin} from ".";
import { HTMLElementSpec, toAttributes, getAttrs } from "../htmlelementspec";


function parseSizeOfFontTag(size: string) {
  const sizeMap = ["x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large"]
  const sizeValue = parseInt(size)
  return sizeMap.at(sizeValue)
}

export const deprecatedPlugin = () => ({
  nodes: {
    applet: HTMLElementSpec({
      tag: "applet",
      group: "flow",
      toDOM: node => "<applet>",
      parseDOM: [{tag: "applet", getAttrs}],
    }),
    basefont: HTMLElementSpec({
      tag: "basefont",
      group: "flow",
      toDOM: node => ["style", toAttributes(node), `*{color:${node.attrs.style.color};font-family:${node.attrs.style.fontFamily};font-size: ${node.attrs.style.fontSize}}`],
      parseDOM: [{tag: "basefont", getAttrs: dom => {
        const otherAttrs = getAttrs(dom)
        if(otherAttrs && typeof dom !== "string") {
          const style = {
            ...otherAttrs.style,
            color: dom.getAttribute("color") ?? undefined,
            fontFamily: dom.getAttribute("face") ?? undefined,
            fontSize: parseSizeOfFontTag(dom.getAttribute("size") ?? "")
          }
          return {...otherAttrs, style}
        }
        else {
          return false
        }
      }}],
    }),
    center: HTMLElementSpec({
      tag: "center",
      group: "flow",
      content: "flow*",
      toDOM: node => ["div", toAttributes(node, {style: {margin: "0 auto"}}), 0],
      parseDOM: [{tag: "center", getAttrs}],
    }),
    dir: HTMLElementSpec({
      tag: "dir",
      group: "flow",
      content: "flow*",
      toDOM: node => ["ul", toAttributes(node), 0],
      parseDOM: [{tag: "dir", getAttrs}],
    }),
    frame: HTMLElementSpec({
      tag: "frame",
      group: "embedded",
      toDOM: node => ["ul", toAttributes(node), 0], // TODO: Handle deprecated attrs?
      parseDOM: [{tag: "frame", getAttrs}],
    }),
    frameset: HTMLElementSpec({
      tag: "frameset",
      group: "flow",
      content: "flow*",
      toDOM: node => ["body", toAttributes(node), 0], // TODO: Render as grid?
      parseDOM: [{tag: "frameset", getAttrs}],
    }),
    image: HTMLElementSpec({
      tag: "image",
      group: "embedded",
      content: "text?",
      toDOM: node => ["img", toAttributes(node), 0],
      parseDOM: [{tag: "image", getAttrs: dom => {
          return {...getAttrs(dom), title: typeof dom === "string"? undefined: dom.textContent}
      }}],
    }),
    menuitem: HTMLElementSpec({
      tag: "menuitem",
      group: "flow",
      content: "phrasing*",
      toDOM: node => ["span", toAttributes(node), 0], // TODO: Support this
      parseDOM: [{tag: "menuitem", getAttrs}],
    }),
    noembed: HTMLElementSpec({
      tag: "noembed",
      group: "flow",
      content: "flow*",
      toDOM: node => ["div", toAttributes(node), 0],
      parseDOM: [{tag: "noembed", getAttrs}],
    }),
    noframes: HTMLElementSpec({
      tag: "noframes",
      group: "flow",
      content: "flow*",
      toDOM: node => ["span", toAttributes(node), 0],
      parseDOM: [{tag: "noframes", getAttrs}],
    }),
    params: HTMLElementSpec({
      tag: "params",
      group: "flow",
      content: "flow*",
      toDOM: node => node.textContent,
      parseDOM: [{tag: "params", getAttrs}],
    }),
    plaintext: HTMLElementSpec({
      tag: "plaintext",
      group: "flow",
      content: "flow*",
      toDOM: node => ["pre", toAttributes(node), 0],
      parseDOM: [{tag: "plaintext", getAttrs}],
    }),
    listing: HTMLElementSpec({
      tag: "listing",
      group: "flow",
      content: "flow*",
      toDOM: node => ["pre", toAttributes(node), 0],
      parseDOM: [{tag: "listing", getAttrs}],
    }),
    rb: HTMLElementSpec({
      tag: "rb",
      group: "phrasing",
      inline: true,
      content: "phrasing*",
      toDOM: node => node.textContent,
      parseDOM: [{tag: "rb", getAttrs}],
    }),
    rtc: HTMLElementSpec({
      tag: "rtc",
      group: "phrasing",
      inline: true,
      content: "phrasing*",
      toDOM: node => node.textContent,
      parseDOM: [{tag: "rtc", getAttrs}],
    }),
    xmp: HTMLElementSpec({
      tag: "xmp",
      group: "phrasing",
      inline: true,
      content: "text?",
      toDOM: node => ["pre", toAttributes(node), 0],
      parseDOM: [{tag: "xmp", getAttrs}],
    })
  },
  marks: {
    acronym: HTMLElementSpec({
      tag: "acronym",
      group: "phrasing",
      toDOM: node => ["abbr", toAttributes(node), 0],
      parseDOM: [{tag: "acronym", getAttrs}],
    }),
    big: HTMLElementSpec({
      tag: "big",
      group: "phrasing",
      toDOM: node => ["span", toAttributes(node, {style: {fontSize: "larger"}}), 0],
      parseDOM: [{tag: "big", getAttrs}],
    }),
    font: HTMLElementSpec({
      tag: "basefont",
      group: "phrasing",
      toDOM: node => ["span", toAttributes(node), 0],
      parseDOM: [{tag: "basefont", getAttrs: dom => {
        const otherAttrs = getAttrs(dom)
        if(otherAttrs && typeof dom !== "string") {
          const style = {
            ...otherAttrs.style,
            color: dom.getAttribute("color") ?? undefined,
            fontFamily: dom.getAttribute("face") ?? undefined,
            fontSize: parseSizeOfFontTag(dom.getAttribute("size") ?? "")
          }
          return {...otherAttrs, style}
        }
        else {
          return false
        }
      }}],
    }),
    marquee: HTMLElementSpec({
      tag: "marquee",
      group: "phrasing",
      toDOM: node => ["span", toAttributes(node), 0],
      parseDOM: [{tag: "marquee", getAttrs}],
    }),
    nobr: HTMLElementSpec({
      tag: "nobr",
      group: "phrasing",
      toDOM: node => ["span", toAttributes(node, {style: {whiteSpace: "nowrap"}}), 0],
      parseDOM: [{tag: "nobr", getAttrs}],
    }),
    strike: HTMLElementSpec({
      tag: "strike",
      group: "phrasing",
      toDOM: node => ["s", toAttributes(node), 0],
      parseDOM: [{tag: "strike", getAttrs}],
    }),
    tt: HTMLElementSpec({
      tag: "tt",
      group: "phrasing",
      toDOM: node => ["samp", toAttributes(node), 0],
      parseDOM: [{tag: "tt", getAttrs}],
    }),
    hp0: HTMLElementSpec({
      tag: "hp0",
      group: "phrasing",
      toDOM: node => node.textContent,
      parseDOM: [{tag: "hp0", getAttrs}],
    }),
    hp1: HTMLElementSpec({
      tag: "hp1",
      group: "phrasing",
      toDOM: node => ["i", toAttributes(node), 0],
      parseDOM: [{tag: "hp1", getAttrs}],
    }),
    hp2: HTMLElementSpec({
      tag: "hp2",
      group: "phrasing",
      toDOM: node => ["b", toAttributes(node), 0],
      parseDOM: [{tag: "hp2", getAttrs}],
    }),
    hp3: HTMLElementSpec({
      tag: "hp3",
      group: "phrasing",
      toDOM: node => ["b", toAttributes(node), ["i", 0]],
      parseDOM: [{tag: "hp3", getAttrs}],
    }),
  }
} as SchemaPlugin)