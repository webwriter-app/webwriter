import { msg } from "@lit/localize"

// TODO: Attributes
// TODO: SVG and MathML

export const baseSchema = {
  // Special nodes
  "#text": {
    group: ["phrasing"]
  },
  "#comment": {
    group: ["flow"]
  },
  "#unknowncustomelement": {
    group: ["flow"]
  },

  // "Root" elements
  "html": {
    content: {terms: [{selector: "head"}, {selector: "body"}]}
  },
  "head": {
    content: {group: "metadata", min: 0, max: Infinity}
  },
  "body": {
    content: {group: "flow", min: 0, max: Infinity}
  },

  // Metadata elements
  "base": {
    group: ["metadata"],
    content: { selector: { type: "text" }, min: 0, max: Infinity },
    headOnly: true
  },
  "link": {
    group: ["metadata", "phrasing", "flow"]
  },
  "meta": {
    group: ["metadata", "phrasing", "flow"]
  },
  "noscript": {
    group: ["metadata", "phrasing", "flow"],
    content: { options: [{selector: "link"}, {selector: "style"}, {selector: "meta"}], min: 0, max: Infinity }
  }, // !
  "style": {
    group: ["metadata"],
    content: { selector: { type: "text" }, min: 0, max: Infinity },
    headOnly: true,
    sideEffects: true
  },
  "title": {
    group: ["metadata"],
    content: { selector: { type: "text" }, min: 0, max: Infinity }, headOnly: true
  },
  "script": {
    group: ["metadata", "phrasing", "scriptsupporting", "flow"], content: { selector: { type: "text" }, min: 0, max: Infinity }, sideEffects: true
  },
  "template": {
    group: ["metadata", "phrasing", "scriptsupporting", "flow"], templateContent: true
  },

  // Sectioning elements
  "article": {
    group: ["sectioning", "flow", "palpable"],
    content: {group: "flow", min: 0, max: Infinity}
  },
  "aside": {
    group: ["sectioning", "flow", "palpable"],
    content: {group: "flow", min: 0, max: Infinity}
  },
  "nav": {
    group: ["sectioning", "flow", "palpable"],
    content: {group: "flow", min: 0, max: Infinity}
  },
  "section": {
    group: ["sectioning", "flow", "palpable"],
    content: {group: "flow", min: 0, max: Infinity}
  },

  // Heading elements
  "h1": {
    group: ["heading", "flow"],
    content: {group: "phrasing", min: 0, max: Infinity},
    inseperable: true,
    emptySelector: "h1:is(:has(br:only-child), :empty)",
    get placeholderStyle() {
      return {
        content: `"${msg("Heading 1")}"`,
        width: "0px",
        overflow: "visible",
        color: "darkgray",
        pointerEvents: "none",
        userSelect: "none"
      }
    }
  },
  "h2": {
    group: ["heading", "flow"],
    content: {group: "phrasing", min: 0, max: Infinity},
    inseperable: true,
    emptySelector: "h2:is(:has(br:only-child), :empty)",
    get placeholderStyle() {
      return {
        content: `"${msg("Heading 2")}"`,
        width: "0px",
        overflow: "visible",
        color: "darkgray"
      }
    }
  },
  "h3": {
    group: ["heading", "flow"],
    content: {group: "phrasing", min: 0, max: Infinity},
    inseperable: true,
    emptySelector: "h3:is(:has(br:only-child), :empty)",
    get placeholderStyle() {
      return {
        content: `"${msg("Heading 3")}"`,
        width: "0px",
        overflow: "visible",
        color: "darkgray"
      }
    }
  },
  "h4": {
    group: ["heading", "flow"],
    content: {group: "phrasing", min: 0, max: Infinity},
    inseperable: true,
    emptySelector: "h4:is(:has(br:only-child), :empty)",
    get placeholderStyle() {
      return {
        content: `"${msg("Heading 4")}"`,
        width: "0px",
        overflow: "visible",
        color: "darkgray"
      }
    }
  },
  "h5": {
    group: ["heading", "flow"],
    content: {group: "phrasing", min: 0, max: Infinity},
    inseperable: true,
    emptySelector: "h5:is(:has(br:only-child), :empty)",
    get placeholderStyle() {
      return {
        content: `"${msg("Heading 5")}"`,
        width: "0px",
        overflow: "visible",
        color: "darkgray"
      }
    }
  },
  "h6": {
    group: ["heading", "flow"],
    content: {group: "phrasing", min: 0, max: Infinity},
    inseperable: true,
    emptySelector: "h6:is(:has(br:only-child), :empty)",
    get placeholderStyle() {
      return {
        content: `"${msg("Heading 6")}"`,
        width: "0px",
        overflow: "visible",
        color: "darkgray"
      }
    }
  },
  "hgroup": {
    group: ["heading", "flow"],
    content: {terms: [{selector: "p", min: 0, max: Infinity}, {options: [{selector: "h1"}, {selector: "h2"}, {selector: "h3"}, {selector: "h4"}, {selector: "h5"}, {selector: "h6"}]}, {selector: "p", min: 0, max: Infinity}]}
  },

  // Embedded elements
  "audio": {
    group: ["embedded", "interactive", "flow"],
    content: "(track* ^!!audio!!video)|(source* track* ^!audio!video)"
  },
  "canvas": {
    group: ["embedded", "flow", "palpable"],
    content: "^!audio!embed!iframe!img!video!details!label!select!textarea"
  },
  "embed": {
    group: ["embedded", "interactive", "flow", "palpable"]
  },
  "iframe": {
    group: ["embedded", "interactive", "flow", "palpable"]
  },
  "img": {
    group: ["embedded", "interactive", "flow", "palpable", "formassociated"]
  },
  "math": {
    group: ["embedded", "flow", "palpable"]
  }, // !
  "object": {
    group: ["embedded", "flow", "palpable", "formassociated", "listed", "submittable"],
    content: "^"
  },
  "picture": {
    group: ["embedded", "flow", "palpable"],
    content: "scriptsupporting* source* scriptsupporting* img scriptsupporting*"
  },
  "svg": {
    group: ["embedded", "flow", "palpable"]
  }, // !
  "video": {
    group: ["embedded", "interactive", "flow", "palpable"],
    content: "(track* ^!audio!video)|(source* track* ^!audio!video)"
  },

  // Interactive elements
  "a": {
    group: ["interactive", "phrasing", "flow", "palpable"],
    content: "^!interactive"
  },
  "button": {
    group: ["interactive", "phrasing", "flow", "palpable", "formassociated", "listed", "labelable", "submittable"],
    content: "phrasing!interactive*"
  },
  "details": {
    group: ["interactive", "flow", "palpable"],
    content: "summary flow*"
  },
  "input": {
    group: ["interactive", "phrasing", "flow", "formassociated", "listed", "submittable", "resettable", "labelable"]
  },
  "label": {
    group: ["interactive", "phrasing", "flow", "palpable"],
    content: "phrasing!label!labelable"
  },
  "select": {
    group: ["interactive", "phrasing", "flow", "palpable", "formassociated", "listed", "labelable", "resettable", "submittable"],
    content: "(option | optgroup | hr)*"
  },
  "textarea": {
    group: ["interactive", "phrasing", "flow", "palpable", "formassociated", "listed", "labelable", "resettable", "submittable"],
    content: { selector: { type: "text" }, min: 0, max: Infinity }
  },

  // Phrasing elements
  "abbr": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "area": {
    group: ["phrasing", "flow"]
  },
  "b": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "bdi": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "bdo": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "br": {
    group: ["phrasing", "flow"]
  },
  "cite": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "code": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "data": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "datalist": {
    group: ["phrasing", "flow"],
    content: "phrasing* | option*"
  },
  "del": {
    group: ["phrasing", "flow", "palpable"],
    content: "^"
  },
  "dfn": {
    group: ["phrasing", "flow", "palpable"],
    content: "phrasing!!dfn*"
  },
  "em": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "i": {
    group: ["phrasing", "flow"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "ins": {
    group: ["phrasing", "flow", "palpable"],
    content: "^"
  },
  "kbd": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "map": {
    group: ["phrasing", "flow", "palpable"],
    content: "^"
  },
  "mark": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "meter": {
    group: ["phrasing", "flow", "palpable"],
    content: "phrasing!!meter*"
  },
  "output": {
    group: ["phrasing", "flow", "formassociated", "listed", "labelable", "resettable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "progress": {
    group: ["phrasing", "flow", "palpable"],
    content: "phrasing!!progress*"
  },
  "q": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "ruby": {
    group: ["phrasing", "flow", "palpable"],
    content: "((phrasing!!ruby* | ruby) (rt+ | (rp rt* rp)+))+"
  }, // !
  "s": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "samp": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "slot": {
    group: ["phrasing", "flow"],
    content: "^"
  },
  "small": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "span": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "strong": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "sub": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "sup": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "time": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "u": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "var": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "wbr": {
    group: ["phrasing", "flow"]
  },

  // Other flow elements
  "address": {
    group: ["flow", "palpable"],
    content: "flow!!address!heading!sectioning!header!footer*"
  },
  "blockquote": {
    group: ["flow", "palpable"],
    content: {group: "flow", min: 0, max: Infinity}
  },
  "dialog": {
    group: ["flow"],
    content: {group: "flow", min: 0, max: Infinity}
  },
  "div": {
    group: ["flow", "palpable"],
    content: {group: "flow", min: 0, max: Infinity}
  },
  "dl": {
    group: ["flow"],
    content: "(script | template)* div (div | script | template)*"
  },
  "fieldset": {
    group: ["flow", "palpable", "formassociated", "listed"],
    content: "legend? flow*"
  },
  "figure": {
    group: ["flow", "palpable"],
    content: "(figcaption? flow*) | (flow* figcaption?)"
  },
  "footer": {
    group: ["flow", "palpable"],
    content: "flow!header!footer*"
  },
  "form": {
    group: ["flow", "palpable"],
    content: "flow!form*"
  },
  "header": {
    group: ["flow"],
    content: "flow!header!footer*"
  },
  "hr": {
    group: ["flow"]
  },
  "main": {
    group: ["flow", "palpable"],
    content: {group: "flow", min: 0, max: Infinity}
  },
  "menu": {
    group: ["flow"],
    content: "(li | script | template)*"
  },
  "ol": {
    group: ["flow"],
    content: "(li | script | template)*"
  },
  "p": {
    defaultNode: true,
    group: ["flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "pre": {
    group: ["flow", "palpable"],
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "search": {
    group: ["flow", "palpable"],
    content: {group: "flow", min: 0, max: Infinity}
  },
  "table": {
    group: ["flow", "palpable"],
    content: "caption? colgroup* thead? (tbody* | tr+) tfoot?"
  },
  "ul": {
    group: ["flow"],
    content: {options: [{selector: "li"}, {selector: "script"}, {selector: "template"}], min: 0, max: Infinity}
  },

  // Non-flow elements
  "caption": {
    content: {group: "flow", min: 0, max: Infinity}
  },
  "col": {

  },
  "colgroup": {
    content: "col*"
  }, // !
  "dd": {
    content: {selector: "flow", min: 0, max: Infinity}
  },
  "dt": {
    content: "flow!header!footer!sectioning!!heading*"
  },
  "figcaption": {
    content: {selector: "flow", min: 0, max: Infinity}
  },
  "legend": {
    content: "(phrasing | h1 | h2 | h3 | h4 | h5 | h6)*"
  },
  "li": {
    content: {selector: "flow", min: 0, max: Infinity}
  },
  "optgroup": {
    content: "option*"
  },
  "option": {
    content: { selector: { type: "text" }, min: 0, max: Infinity }
  },
  "rp": {
    content: { selector: { type: "text" }, min: 0, max: Infinity }
  },
  "rt": {
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "source": {

  },
  "summary": {
    content: "(phrasing | heading)*"
  },
  "tbody": {
    content: {selector: "tr", min: 0, max: Infinity}
  },
  "td": {
    content: {selector: "flow", min: 0, max: Infinity}
  },
  "tfoot": {
    content: {selector: "tr", min: 0, max: Infinity}
  },
  "th": {
    content: "flow!!header!!footer!!sectioning!!heading*"
  },
  "thead": {
    content: {selector: "tr", min: 0, max: Infinity}
  },
  "tr": {
    content: "(td | th | script | template)*"
  },
  "track": {

  }
} as const