// TODO: Attributes?

function hasNot(...selectors: string[]) {
  return selectors.map(selector => `:not(${selector}):not(:has(${selector}))`).join("")
}

export const baseSchema = {

  // Special nodes
  "#text": {
    group: ["flow", "phrasing"]
  },
  "#comment": {
    group: ["flow"]
  },
  "#unknownelement": {
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
        content: `"${"Heading 1"}"`,
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
        content: `"${"Heading 2"}"`,
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
        content: `"${"Heading 3"}"`,
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
        content: `"${"Heading 4"}"`,
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
        content: `"${"Heading 5"}"`,
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
        content: `"${"Heading 6"}"`,
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
    content: {options: [
      {terms: [{selector: "track", min: 0, max: Infinity}, {selector: hasNot("audio", "video"), transparent: true}]},
      {terms: [{selector: "source", min: 0, max: Infinity}, {selector: "track", min: 0, max: Infinity}, {selector: hasNot("audio", "video"), transparent: true}]},
    ]}
  },
  "canvas": {
    group: ["embedded", "flow", "palpable"],
    content: {selector: hasNot("audio", "embed", "iframe", "img[usemap]", "audio[controls]", "video[controls]", "object[usemap]", "details", "label", "select", "textarea", "audio", "input:is([type=checkbox],[type=radio],[type=button])"), transparent: true},
  },
  "embed": {
    group: ["embedded", "interactive", "flow", "palpable"]
  },
  "iframe": {
    group: ["embedded", "interactive", "flow", "palpable"]
  },
  "fencedframe": {
    group: ["embedded", "interactive", "flow", "palpable"]
  },
  "img": {
    group: ["embedded", "interactive", "flow", "palpable", "formassociated"]
  },
  "object": {
    group: ["embedded", "flow", "palpable", "formassociated", "listed", "submittable"],
    content: {transparent: true}
  },
  "picture": {
    group: ["embedded", "flow", "palpable"],
    content: {terms: [
      {options: [{selector: "source"}, {group: "scriptsupporting"}], min: 0, max: Infinity},
      {selector: "img"},
      {group: "scriptsupporting", min: 0, max: Infinity},
    ]}
  },
  "video": {
    group: ["embedded", "interactive", "flow", "palpable"],
    content: {options: [
      {terms: [{selector: "track", min: 0, max: Infinity}, {selector: hasNot("audio", "video"), transparent: true}]},
      {terms: [{selector: "source", min: 0, max: Infinity}, {selector: "track", min: 0, max: Infinity}, {selector: hasNot("audio", "video"), transparent: true}]},
    ]}
  },
  "math": {
    group: ["embedded", "flow", "palpable"],
    contentNamespace: "http://www.w3.org/1998/Math/MathML",
    content: {selector: "math|*", min: 0, max: Infinity}
  },
  "svg": {
    group: ["embedded", "phrasing", "flow", "palpable"],
    contentNamespace: "http://www.w3.org/2000/svg",
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|shape"},
      {group: "svg|structural"},
      {group: "svg|gradient"},
      {selector: "svg|a"},
      {selector: "svg|clipPath"},
      {selector: "svg|filter"},
      {selector: "svg|foreignObject"},
      {selector: "svg|image"},
      {selector: "svg|marker"},
      {selector: "svg|mask"},
      {selector: "svg|pattern"},
      {selector: "svg|script"},
      {selector: "svg|style"},
      {selector: "svg|switch"},
      {selector: "svg|text"},
      {selector: "svg|view"},
    ], min: 0, max: Infinity}
  },

  // Interactive elements
  "a": {
    group: ["interactive", "phrasing", "flow", "palpable"],
    content: {selector: hasNot("[tabindex]", "audio", "embed", "fencedframe", "iframe", "video", "a", "button", "details", "input", "label", "select", "textarea", "geolocation"), transparent: true}
  },
  "button": {
    group: ["interactive", "phrasing", "flow", "palpable", "formassociated", "listed", "labelable", "submittable"],
    content: {group: "phrasing", selector: hasNot("audio", "embed", "fencedframe", "iframe", "video", "a", "button", "details", "input", "label", "select", "textarea", "geolocation"), min: 0, max: Infinity}
  },
  "details": {
    group: ["interactive", "flow", "palpable"],
    content: {terms: [{selector: "summary"}, {group: "flow", min: 0, max: Infinity}]}
  },
  "input": {
    group: ["interactive", "phrasing", "flow", "formassociated", "listed", "submittable", "resettable", "labelable"]
  },
  "label": {
    group: ["interactive", "phrasing", "flow", "palpable"],
    content: {group: "phrasing", selector: hasNot("label", "input", "select", "textarea"), min: 0, max: Infinity}
  },
  "select": {
    group: ["interactive", "phrasing", "flow", "palpable", "formassociated", "listed", "labelable", "resettable", "submittable"],
    content: {options: [{selector: "option"}, {selector: "optgroup"}, {selector: "hr"}, {selector: "div"}], min: 0, max: Infinity}
  },
  "textarea": {
    group: ["interactive", "phrasing", "flow", "palpable", "formassociated", "listed", "labelable", "resettable", "submittable"],
    content: { selector: { type: "text" }, min: 0, max: Infinity }
  },
  "geolocation": {
    group: ["interactive", "phrasing", "flow", "palpable"],
    content: {transparent: true}
  },

  // Phrasing elements
  "abbr": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity},
  },
  "area": {
    group: ["phrasing", "flow"]
  },
  "b": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity},
  },
  "bdi": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity},
  },
  "bdo": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity},
  },
  "br": {
    group: ["phrasing", "flow"]
  },
  "cite": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity},
  },
  "code": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity},
  },
  "data": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity},
  },
  "datalist": {
    group: ["phrasing", "flow"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}, {selector: "option"}], min: 0, max: Infinity}
  },
  "del": {
    group: ["phrasing", "flow", "palpable"],
    content: {transparent: true}
  },
  "dfn": {
    group: ["phrasing", "flow", "palpable"],
    content: {group: "phrasing", selector: hasNot("dfn"), min: 0, max: Infinity},
  },
  "em": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "i": {
    group: ["phrasing", "flow"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "ins": {
    group: ["phrasing", "flow", "palpable"],
    content: {transparent: true}
  },
  "kbd": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "map": {
    group: ["phrasing", "flow", "palpable"],
    content: {transparent: true}
  },
  "mark": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "meter": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing", selector: hasNot("meter")}, {selector: {type: "text"}}], min: 0, max: Infinity},
  },
  "output": {
    group: ["phrasing", "flow", "formassociated", "listed", "labelable", "resettable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "progress": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing", selector: hasNot("progress")}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "q": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "ruby": {
    group: ["phrasing", "flow", "palpable"],
    content: {terms: [
      {options: [{group: "phrasing", selector: hasNot("ruby"), min: 0, max: Infinity}, {selector: "ruby:not(:has(ruby))"}, {selector: {type: "text"}}]},
      {options: [{selector: "rt", min: 1, max: Infinity}, {terms: [{selector: "rp"}, {selector: "rt", min: 0, max: Infinity}, {selector: "rp"}]}], min: 1, max: Infinity},
    ], min: 1, max: Infinity}
    
  },
  "s": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "samp": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "slot": {
    group: ["phrasing", "flow"],
    content: {transparent: true}
  },
  "small": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "span": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "strong": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "sub": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "sup": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "time": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "u": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "var": {
    group: ["phrasing", "flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}
  },
  "wbr": {
    group: ["phrasing", "flow"]
  },

  // Other flow elements
  "address": {
    group: ["flow", "palpable"],
    content: {group: "flow", selector: hasNot("address", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "article", "aside", "nav", "section"), min: 0, max: Infinity},
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
    content: {terms: [
      {options: [{selector: "script"}, {selector: "template"}], min: 0, max: Infinity},
      {selector: "div"},
      {options: [{selector: "div"}, {selector: "script"}, {selector: "template"}], min: 0, max: Infinity},
    ]}
  },
  "fieldset": {
    group: ["flow", "palpable", "formassociated", "listed"],
    content: {terms: [
      {selector: "legend", min: 0, max: 1},
      {group: "flow", min: 0, max: Infinity},
    ]}
  },
  "figure": {
    group: ["flow", "palpable"],
    content: {options: [
      {terms: [{selector: "figcaption", min: 0, max: 1}, {group: "flow", min: 0, max: Infinity}]},
      {terms: [{group: "flow", min: 0, max: Infinity}, {selector: "figcaption", min: 0, max: 1}]},
    ]}
  },
  "footer": {
    group: ["flow", "palpable"],
    content: {group: "flow", selector: hasNot("header", "footer"), min: 0, max: Infinity},
  },
  "form": {
    group: ["flow", "palpable"],
    content: {group: "flow", selector: hasNot("form"), min: 0, max: Infinity},
  },
  "header": {
    group: ["flow"],
    content: {group: "flow", selector: hasNot("header", "footer"), min: 0, max: Infinity},
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
    content: {options: [{selector: "li"}, {selector: "script"}, {selector: "template"}], min: 0, max: Infinity}
  },
  "ol": {
    group: ["flow"],
    content: {options: [{selector: "li"}, {selector: "script"}, {selector: "template"}], min: 0, max: Infinity}
  },
  "p": {
    defaultNode: true,
    group: ["flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity},
  },
  "pre": {
    group: ["flow", "palpable"],
    content: {options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity},
  },
  "search": {
    group: ["flow", "palpable"],
    content: {group: "flow", min: 0, max: Infinity}
  },
  "table": {
    group: ["flow", "palpable"],
    content: {terms: [
      {selector: "caption", min: 0, max: 1},
      {selector: "colgroup", min: 0, max: Infinity},
      {selector: "thead", min: 0, max: 1},
      {options: [{selector: "tbody", min: 0, max: Infinity}, {selector: "tr", min: 1, max: Infinity}]},
      {selector: "tfoot", min: 0, max: 1},
    ]}
  },
  "ul": {
    group: ["flow"],
    content: {options: [{selector: "li"}, {selector: "script"}, {selector: "template"}], min: 0, max: Infinity}
  },

  // Non-flow elements
  "caption": {
    content: {group: "flow", min: 0, max: Infinity}
  },
  "col": {},
  "colgroup": {
    content: {selector: "col", min: 0, max: Infinity}
  },
  "dd": {
    content: {selector: "flow", min: 0, max: Infinity}
  },
  "dt": {
    content: {group: "flow", selector: hasNot("header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "article", "aside", "nav", "section"), min: 0, max: Infinity},
  },
  "figcaption": {
    content: {selector: "flow", min: 0, max: Infinity}
  },
  "legend": {
    content: {options: [{group: "phrasing"}, {selector: "h1"}, {selector: "h2"}, {selector: "h3"}, {selector: "h4"}, {selector: "h5"}, {selector: "h6"}], min: 0, max: Infinity}
  },
  "li": {
    content: {group: "flow", min: 0, max: Infinity}
  },
  "optgroup": {
    content: {selector: "option", min: 0, max: Infinity}
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
  "source": {},
  "summary": {
    content: {options: [{group: "phrasing"}, {group: "heading"}], min: 0, max: Infinity}
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
    content: {group: "flow", selector: hasNot("header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "article", "aside", "nav", "section"), min: 0, max: Infinity},
  },
  "thead": {
    content: {selector: "tr", min: 0, max: Infinity}
  },
  "tr": {
    content: {options: [{selector: "td"}, {selector: "th"}, {selector: "script"}, {selector: "template"}], min: 0, max: Infinity}
  },
  "track": {}
} as const

export const baseSchemaSVG = {
  "svg|a": {
    group: ["svg|container"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|shape"},
      {group: "svg|structural"},
      {group: "svg|gradient"},
      {selector: "svg|a"},
      {selector: "svg|clipPath"},
      {selector: "svg|filter"},
      {selector: "svg|foreignObject"},
      {selector: "svg|image"},
      {selector: "svg|marker"},
      {selector: "svg|mask"},
      {selector: "svg|pattern"},
      {selector: "svg|script"},
      {selector: "svg|style"},
      {selector: "svg|switch"},
      {selector: "svg|text"},
      {selector: "svg|view"},
    ], min: 0, max: Infinity}
  },
  "svg|animate": {
    group: ["svg|animation"],
    content: {group: "svg|descriptive", min: 0, max: Infinity}
  },
  "svg|animateMotion": {
    group: ["svg|animation"],
    content: {options: [
      {group: "svg|descriptive"},
      {selector: "svg|mpath"},
    ], min: 0, max: Infinity}
  },
  "svg|animateTransform": {
    group: ["svg|animation"],
    content: {group: "svg|descriptive", min: 0, max: Infinity}
  },
  "svg|circle": {
    group: ["svg|basicshape", "svg|graphics", "svg|shape"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"}
    ], min: 0, max: Infinity}
  },
  "svg|clipPath": {
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|shape"},
      {selector: "svg|text"},
      {selector: "svg|use"},
    ], min: 0, max: Infinity}
  },
  "svg|defs": {
    group: ["svg|container", "svg|structural"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|shape"},
      {group: "svg|structural"},
      {group: "svg|gradient"},
      {selector: "svg|a"},
      {selector: "svg|clipPath"},
      {selector: "svg|filter"},
      {selector: "svg|foreignObject"},
      {selector: "svg|image"},
      {selector: "svg|marker"},
      {selector: "svg|mask"},
      {selector: "svg|pattern"},
      {selector: "svg|script"},
      {selector: "svg|style"},
      {selector: "svg|switch"},
      {selector: "svg|text"},
      {selector: "svg|view"},
    ], min: 0, max: Infinity}
  },
  "svg|desc": {
    group: ["descriptive"],
    content: {options: [
      {selector: "svg|*"},
      {selector: {type: "text"}}
    ], min: 0, max: Infinity}
  },
  "svg|ellipse": {
    group: ["basicshape", "graphics", "shape"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"}
    ], min: 0, max: Infinity}
  },
  "svg|feBlend": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feColorMatrix": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feComponentTransfer": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|feFuncA"}, {selector: "svg|feFuncR"}, {selector: "svg|feFuncB"}, {selector: "svg|feFuncG"}], min: 0, max: Infinity}
  },
  "svg|feComposite": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feConvolveMatrix": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feDiffuseLighting": {
    group: ["svg|filterprimitive"],
    content: {terms: [{group: "svg|descriptive", min: 0, max: Infinity}, {group: "svg|lightsource"}, {group: "svg|descriptive", min: 0, max: Infinity}]}
  },
  "svg|feDisplacementMap": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|script"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feDistantLight": {
    group: ["svg|lightsource"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feDropShadow": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feFlood": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feFuncA": {
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feFuncB": {
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feFuncG": {
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feFuncR": {
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feGaussianBlur": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feImage": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|animateTransform"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feMerge": {
    group: ["svg|filterprimitive"],
    content: {selector: "svg|feMergeNode", min: 0, max: Infinity}
  },
  "svg|feMergeNode": {
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feMorphology": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feOffset": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|fePointLight": {
    group: ["svg|lightsource"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feSpecularLighting": {
    group: ["svg|filterprimitive"],
    content: {terms: [{group: "svg|descriptive", min: 0, max: Infinity}, {group: "svg|lightsource"}, {group: "svg|descriptive", min: 0, max: Infinity}]}
  },
  "svg|feSpotLight": {
    group: ["svg|lightsource"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feTile": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|feTurbulence": {
    group: ["svg|filterprimitive"],
    content: {options: [{selector: "svg|animate"}, {selector: "svg|set"}], min: 0, max: Infinity}
  },
  "svg|filter": {
    content: {options: [
      {group: "svg|descriptive"},
      {group: "svg|filterprimitive"},
      {selector: "svg|animate"},
      {selector: "svg|set"}
    ], min: 0, max: Infinity}
  },
  "svg|foreignObject": {
    groups: ["svg|graphics", "svg|renderable"],
    content: {options: [
      {selector: "*|*"},
      {selector: {type: "text"}}
    ], min: 0, max: Infinity}
  },
  "svg|g": {
    group: ["svg|container", "svg|structural"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|shape"},
      {group: "svg|structural"},
      {group: "svg|gradient"},
      {selector: "svg|a"},
      {selector: "svg|clipPath"},
      {selector: "svg|filter"},
      {selector: "svg|foreignObject"},
      {selector: "svg|image"},
      {selector: "svg|marker"},
      {selector: "svg|mask"},
      {selector: "svg|pattern"},
      {selector: "svg|script"},
      {selector: "svg|style"},
      {selector: "svg|switch"},
      {selector: "svg|text"},
      {selector: "svg|view"},
    ], min: 0, max: Infinity}
  },
  "svg|image": {
    group: ["svg|graphics", "svg|graphicsreferencing", "svg|renderable"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {selector: "svg|animate"},
      {selector: "svg|animateMotion"},
      {selector: "svg|animateTransform"},
      {selector: "svg|script"},
      {selector: "svg|set"},
      {selector: "svg|style"}
    ], min: 0, max: Infinity}
  },
  "svg|line": {
    group: ["svg|basicshape", "svg|graphics", "svg|shape"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"}
    ], min: 0, max: Infinity}
  },
  "svg|linearGradient": {
    group: ["svg|gradient"],
    content: {options: [
      {group: "svg|descriptive"},
      {selector: "svg|animate"},
      {selector: "svg|animateMotion"},
      {selector: "svg|animateTransform"},
      {selector: "svg|script"},
      {selector: "svg|set"},
      {selector: "svg|stop"},
      {selector: "svg|style"}
    ], min: 0, max: Infinity}
  },
  "svg|marker": {
    group: ["svg|container"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|shape"},
      {group: "svg|structural"},
      {group: "svg|gradient"},
      {selector: "svg|a"},
      {selector: "svg|clipPath"},
      {selector: "svg|filter"},
      {selector: "svg|foreignObject"},
      {selector: "svg|image"},
      {selector: "svg|marker"},
      {selector: "svg|mask"},
      {selector: "svg|pattern"},
      {selector: "svg|script"},
      {selector: "svg|style"},
      {selector: "svg|switch"},
      {selector: "svg|text"},
      {selector: "svg|view"},
    ], min: 0, max: Infinity}
  },
  "svg|mask": {
    group: ["svg|container"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|shape"},
      {group: "svg|structural"},
      {group: "svg|gradient"},
      {selector: "svg|a"},
      {selector: "svg|clipPath"},
      {selector: "svg|filter"},
      {selector: "svg|foreignObject"},
      {selector: "svg|image"},
      {selector: "svg|marker"},
      {selector: "svg|mask"},
      {selector: "svg|pattern"},
      {selector: "svg|script"},
      {selector: "svg|style"},
      {selector: "svg|switch"},
      {selector: "svg|text"},
      {selector: "svg|view"},
    ], min: 0, max: Infinity}
  },
  "svg|metadata": {
    groups: ["svg|descriptive"],
    content: {options: [
      {selector: "*|*"},
      {selector: {type: "text"}}
    ], min: 0, max: Infinity}
  },
  "svg|mpath": {
    groups: ["svg|animation"],
    content: {group: "svg|descriptive", min: 0, max: Infinity}
  },
  "svg|path": {
    groups: ["svg|graphics", "svg|shape"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"}
    ], min: 0, max: Infinity}
  },
  "svg|pattern": {
    group: ["svg|container"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|shape"},
      {group: "svg|structural"},
      {group: "svg|gradient"},
      {selector: "svg|a"},
      {selector: "svg|clipPath"},
      {selector: "svg|filter"},
      {selector: "svg|foreignObject"},
      {selector: "svg|image"},
      {selector: "svg|marker"},
      {selector: "svg|mask"},
      {selector: "svg|pattern"},
      {selector: "svg|script"},
      {selector: "svg|style"},
      {selector: "svg|switch"},
      {selector: "svg|text"},
      {selector: "svg|view"},
    ], min: 0, max: Infinity}
  },
  "svg|polygon": {
    groups: ["svg|graphics", "svg|shape", "svg|basicshape"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"}
    ], min: 0, max: Infinity}
  },
  "svg|polyline": {
    groups: ["svg|graphics", "svg|shape", "svg|basicshape"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"}
    ], min: 0, max: Infinity}
  },
  "svg|radialGradient": {
    group: ["svg|gradient"],
    content: {options: [
      {group: "svg|descriptive"},
      {selector: "svg|animate"},
      {selector: "svg|animateMotion"},
      {selector: "svg|animateTransform"},
      {selector: "svg|script"},
      {selector: "svg|set"},
      {selector: "svg|stop"},
      {selector: "svg|style"}
    ], min: 0, max: Infinity}
  },
  "svg|rect": {
    groups: ["svg|graphics", "svg|shape", "svg|basicshape"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"}
    ], min: 0, max: Infinity}
  },
  "svg|script": {
    content: {selector: {type: "text"}}
  },
  "svg|set": {
    groups: ["svg|animation"],
    content: {group: "svg|descriptive", min: 0, max: Infinity}
  },
  "svg|stop": {
    group: ["svg|gradient"],
    content: {options: [
      {selector: "svg|animate"},
      {selector: "svg|script"},
      {selector: "svg|set"},
      {selector: "svg|stop"},
      {selector: "svg|style"}
    ], min: 0, max: Infinity}
  },
  "svg|style": {
    content: {selector: {type: "text"}}
  },
  "svg|svg": {
    group: ["svg|container", "svg|structural"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|shape"},
      {group: "svg|structural"},
      {group: "svg|gradient"},
      {selector: "svg|a"},
      {selector: "svg|clipPath"},
      {selector: "svg|filter"},
      {selector: "svg|foreignObject"},
      {selector: "svg|image"},
      {selector: "svg|marker"},
      {selector: "svg|mask"},
      {selector: "svg|pattern"},
      {selector: "svg|script"},
      {selector: "svg|style"},
      {selector: "svg|switch"},
      {selector: "svg|text"},
      {selector: "svg|view"},
    ], min: 0, max: Infinity}
  },
  "svg|switch": {
    group: ["svg|container"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|shape"},
      {selector: "svg|a"},
      {selector: "svg|foreignObject"},
      {selector: "svg|g"},
      {selector: "svg|image"},
      {selector: "svg|svg"},
      {selector: "svg|switch"},
      {selector: "svg|text"},
      {selector: "svg|use"}
    ], min: 0, max: Infinity}
  },
  "svg|symbol": {
    group: ["svg|container", "svg|structural"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|shape"},
      {group: "svg|structural"},
      {group: "svg|gradient"},
      {selector: "svg|a"},
      {selector: "svg|clipPath"},
      {selector: "svg|filter"},
      {selector: "svg|foreignObject"},
      {selector: "svg|image"},
      {selector: "svg|marker"},
      {selector: "svg|mask"},
      {selector: "svg|pattern"},
      {selector: "svg|script"},
      {selector: "svg|style"},
      {selector: "svg|switch"},
      {selector: "svg|text"},
      {selector: "svg|view"},
    ], min: 0, max: Infinity}
  },
  "svg|text": {
    groups: ["svg|graphics", "svg|textcontent"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"},
      {group: "svg|textcontentchild"},
      {selector: "svg|a"}
    ], min: 0, max: Infinity}
  },
  "svg|textPath": {
    groups: ["svg|textcontent", "svg|textcontentchild"],
    content: {options: [
      {group: "svg|descriptive"},
      {selector: "svg|a"},
      {selector: "svg|animate"},
      {selector: "svg|set"},
      {selector: "svg|tspan"},
    ], min: 0, max: Infinity}
  },
  "svg|title": {
    group: "descriptive",
    content: {group: "phrasing", min: 0, max: Infinity}
  },
  "svg|tspan": {
    groups: ["svg|textcontent", "svg|textcontentchild"],
    content: {options: [
      {group: "svg|descriptive"},
      {selector: "svg|a"},
      {selector: "svg|animate"},
      {selector: "svg|set"},
      {selector: "svg|tspan"},
    ], min: 0, max: Infinity}
  },
  "svg|use": {
    groups: ["svg|graphics", "svg|graphicsreferencing", "svg|structural"],
    content: {options: [
      {group: "svg|animation"},
      {group: "svg|descriptive"}
    ], min: 0, max: Infinity}
  },
  "svg|view": {
    content: {group: "descriptive", min: 0, max: Infinity}
  }
} as const

export const baseSchemaMathML = {
  "math|annotation": {
    content: {selector: {type: "text"}}
  },
  "math|annotation-xml": {
    content: {options: [{selector: "*|*"}, {selector: {type: "text"}}]}
  },
  "math|merror": {
    content: {selector: "math|*"}
  },
  "math|mfrac": {
    content: {selector: "math|*"}
  },
  "math|mi": {
    content: {selector: "math|*"}
  },
  "math|mmultiscripts": {
    content: {selector: "math|*"}
  },
  "math|mn": {
    content: {selector: "math|*"}
  },
  "math|mo": {
    content: {selector: "math|*"}
  },
  "math|mover": {
    content: {selector: "math|*"}
  },
  "math|mpadded": {
    content: {selector: "math|*"}
  },
  "math|mphantom": {
    content: {selector: "math|*"}
  },
  "math|mprescripts": {
    content: {selector: "math|*"}
  },
  "math|mroot": {
    content: {selector: "math|*"}
  },
  "math|mrow": {
    content: {selector: "math|*"}
  },
  "math|ms": {
    content: {selector: "math|*"}
  },
  "math|semantics": {
    content: {selector: "math|*"}
  },
  "math|mspace": {
    content: {selector: "math|*"}
  },
  "math|msqrt": {
    content: {selector: "math|*"}
  },
  "math|mstyle": {
    content: {selector: "math|*"}
  },
  "math|msub": {
    content: {selector: "math|*"}
  },
  "math|msup": {
    content: {selector: "math|*"}
  },
  "math|msubsup": {
    content: {selector: "math|*"}
  },
  "math|mtable": {
    content: {selector: "math|*"}
  },
  "math|mtd": {
    content: {selector: "math|*"}
  },
  "math|mtext": {
    content: {selector: {type: "text"}}
  },
  "math|mtr": {
    content: {selector: "math|*"}
  },
  "math|munder": {
    content: {selector: "math|*"}
  },
  "math|munderover": {
    content: {selector: "math|*"}
  }
} as const