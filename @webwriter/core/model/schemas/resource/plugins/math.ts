import { SchemaPlugin } from ".";
import { HTMLElementSpec, getAttrs, toAttributes, eventHTMLAttributes, HTMLElementSpecPair } from "../htmlelementspec";
import {NodeSpec} from "prosemirror-model"

const coreMathMLAttributes = {
  class: {default: undefined},
  data: {default: {}},
  dir: {default: undefined},
  displaystyle: {default: undefined},
  id: {default: undefined},
  mathbackground: {default: undefined},
  mathcolor: {default: undefined},
  mathsize: {default: undefined},
  mathvariant: {default: undefined},
  nonce: {default: undefined},
  scriptlevel: {default: undefined},
  style: {default: undefined},
  tabindex: {default: undefined}
}

const globalMathMLAttributes = {
  ...coreMathMLAttributes,
  ...eventHTMLAttributes
}

export function MathMLElementSpec({tag, content, marks, group, inline, atom, attrs, selectable, draggable, code, whitespace, definingAsContext, definingForContent, defining, isolating, toDOM, parseDOM, toDebugString, leafText, ...rest}: NodeSpec) {
  return {
    content,
    marks,
    group,
    inline,
    atom,
    attrs: {...globalMathMLAttributes, ...attrs},
    selectable: selectable ?? false,
    code,
    whitespace,
    definingAsContext,
    definingForContent,
    defining,
    isolating,
    toDOM: toDOM ?? (n => [`http://www.w3.org/1998/Math/MathML ${tag}`, toAttributes(n), ...(content? [0]: [])]),
    parseDOM: parseDOM ?? [{tag, getAttrs, context: "math//|math_inline//"}],
    toDebugString,
    leafText,
    ...rest
  }
}

export const MATHML_TAGS = [
  "mtext",
  "annotation",
  "annotation-xml",
  "maction",
  "merror",
  "mfrac",
  "mi",
  "mmultiscripts",
  "mn",
  "mo",
  "mover",
  "mpadded",
  "mphantom",
  "mprescripts",
  "mroot",
  "mrow",
  "ms",
  "mspace",
  "msqrt",
  "mstyle",
  "msub",
  "msubsup",
  "msup",
  "mtable",
  "mtd",
  "mtr",
  "munder",
  "munderover",
  "none",
  "semantics"
]
const MATHML_TAGS_GROUPING = ["maction", "math", "merror", "mphantom", "mprescripts", "mrow", "mstyle", "none", "semantics"]
const MATHML_TAGS_SCRIPTED = ["mmultiscripts", "mover", "msub", "msubsup", "msup", "munder", "munderover"]
const MATHML_TAGS_RADICAL = ["mroot", "msqrt"]

const MATHML_CONTENT = "(" + MATHML_TAGS
  .filter(tag => !["math", "annotation", "annotation-xml"].includes(tag))
  .map(tag => tag + "MathML")
  .join("|") + ")+"

export const mathPlugin = () => ({
  nodes: {
/*    ...HTMLElementSpecPair({
      math: {
        tag: "math",
        group: "flow",
        content: MATHML_CONTENT,
        atom: true,
        toDOM: n => [`http://www.w3.org/1998/Math/MathML math`, toAttributes(n), 0],
      },
      math_inline: {
        group: "phrasing",
        inline: true,
        atom: true,
        
      }
    }),*/
    "math_inline": HTMLElementSpec({
      tag: "math",
      group: "phrasing",
      content: MATHML_CONTENT,
      atom: true,
      toDOM: n => [`http://www.w3.org/1998/Math/MathML math`, toAttributes(n), 0],
      inline: true,
      selectable: true
    }),
    "annotationMathML": MathMLElementSpec({
      tag: "annotation",
      content: "text?",
      attrs: {
        encoding: {default: undefined}
      }
    }),
    "annotationxmlMathML": MathMLElementSpec({ // deviating from naming convention: "-" is not valid in Prosemirror Node Names
      tag: "annotation-xml",
      content: `flow*`,
      attrs: {
        encoding: {default: undefined}
      }
    }),
    "mactionMathML": MathMLElementSpec({
      tag: "maction",
      attrs: {
        actiontype: {default: undefined},
        selection: {default: undefined},
      }
    }),
    "merrorMathML": MathMLElementSpec({
      tag: "merror",
      content: MATHML_CONTENT
    }),
    "mfracMathML": MathMLElementSpec({
      tag: "mfrac",
      content: MATHML_CONTENT,
      attrs: {
        linethickness: {default: undefined}
      }
    }),
    "miMathML": MathMLElementSpec({
      tag: "mi",
      content: "phrasing*"
    }),
    "mmultiscriptsMathML": MathMLElementSpec({
      tag: "mmultiscripts",
      content: MATHML_CONTENT
    }),
    "mnMathML": MathMLElementSpec({
      tag: "mn",
      content: "phrasing*"
    }),
    "moMathML": MathMLElementSpec({
      tag: "mo",
      content: "phrasing*",
      attrs: {
        form: {default: undefined},
        fence: {default: undefined},
        separator: {default: undefined},
        lspace: {default: undefined},
        rspace: {default: undefined},
        stretchy: {default: undefined},
        symmetric: {default: undefined},
        maxsize: {default: undefined},
        minsize: {default: undefined},
        largeop: {default: undefined},
        movablelimits: {default: undefined},
      }
    }),
    "moverMathML": MathMLElementSpec({
      tag: "mover",
      content: MATHML_CONTENT,
      attrs: {
        accent: {default: undefined}
      }
    }),
    "mpaddedMathML": MathMLElementSpec({
      tag: "mpadded",
      content: MATHML_CONTENT,
      attrs: {
        width: {default: undefined},
        height: {default: undefined},
        depth: {default: undefined},
        lspace: {default: undefined},
        voffset: {default: undefined},
      }
    }),
    "mphantomMathML": MathMLElementSpec({
      tag: "mphantom",
      content: MATHML_CONTENT
    }),
    "mprescriptsMathML": MathMLElementSpec({
      tag: "mprescripts",
      content: MATHML_CONTENT
    }),
    "mrootMathML": MathMLElementSpec({
      tag: "mroot",
      content: MATHML_CONTENT
    }),
    "mrowMathML": MathMLElementSpec({
      tag: "mrow",
      content: MATHML_CONTENT
    }),
    "msMathML": MathMLElementSpec({
      tag: "ms",
      content: "phrasing*"
    }),
    "mspaceMathML": MathMLElementSpec({
      tag: "mspace",
      content: MATHML_CONTENT, attrs: {
      width: {default: undefined},
      height: {default: undefined},
      depth: {default: undefined},
    }}),
    "msqrtMathML": MathMLElementSpec({
      tag: "msqrt",
      content: MATHML_CONTENT
    }),
    "mstyleMathML": MathMLElementSpec({
      tag: "mstyle",
      content: MATHML_CONTENT
    }),
    "msubMathML": MathMLElementSpec({
      tag: "msub",
      content: MATHML_CONTENT
    }),
    "msubsupMathML": MathMLElementSpec({
      tag: "msubsup",
      content: MATHML_CONTENT
    }),
    "msupMathML": MathMLElementSpec({
      tag: "msup",
      content: MATHML_CONTENT
    }),
    "mtableMathML": MathMLElementSpec({
      tag: "mtable",
      content: "mtrMathML*"
    }),
    "mtdMathML": MathMLElementSpec({
      tag: "mtd",
      content: MATHML_CONTENT,
      attrs: {
        actiontype: {default: undefined},
        selection: {default: undefined},
      }
    }),
    "mtextMathML": MathMLElementSpec({
      tag: "mtext",
      content: "phrasing*"
    }),
    "mtrMathML": MathMLElementSpec({
      tag: "mtr",
      content: "mtdMathML*"
    }),
    "munderMathML": MathMLElementSpec({
      tag: "munder",
      content: MATHML_CONTENT
    }),
    "munderoverMathML": MathMLElementSpec({
      tag: "munderover",
      content: MATHML_CONTENT,
      attrs: {
        accent: {default: undefined},
        accentunder: {default: undefined},
      }
    }),
    "noneMathML": MathMLElementSpec({
      tag: "none"
    }),
    "semanticsMathML": MathMLElementSpec({
      tag: "semantics",
      content: `(annotationMathML | annotationxmlMathML)* ${MATHML_CONTENT} (annotationMathML | annotationxmlMathML)*`
    }),
  }
} as SchemaPlugin)