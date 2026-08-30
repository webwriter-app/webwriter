/** CSS-wide values exposed by every property label's cycle button. */
export const cssWideKeywords = ["inherit", "initial", "unset", "revert"] as const
export type CSSWideKeyword = typeof cssWideKeywords[number]

export type ElementStyleControlKind =
  | "color"
  | "length"
  | "number"
  | "range"
  | "select"
  | "text"
  | "toggle"

export type ElementStylePropertyDefinition = {
  name: string
  label: string
  section: string
  control: ElementStyleControlKind
  values?: readonly string[]
  units?: readonly string[]
  min?: number
  max?: number
  step?: number
}

export type ElementStyleCategory = {
  id: "position" | "layout" | "text" | "color" | "interaction" | "other"
  label: string
  icon: string
  basic: readonly ElementStylePropertyDefinition[]
  advanced: readonly ElementStylePropertyDefinition[]
}

const values = (...items: string[]) => items
const lengthUnits = values("px", "%", "em", "rem", "ch", "vw", "vh", "vmin", "vmax", "cm", "mm", "pt")
const timeUnits = values("ms", "s")

const property = (
  name: string,
  label: string,
  section: string,
  control: ElementStyleControlKind,
  options: Omit<ElementStylePropertyDefinition, "name" | "label" | "section" | "control"> = {},
): ElementStylePropertyDefinition => ({name, label, section, control, ...options})

const select = (name: string, label: string, section: string, choices: readonly string[]) =>
  property(name, label, section, "select", {values: choices})
const length = (name: string, label: string, section: string, units = lengthUnits) =>
  property(name, label, section, "length", {units})
const text = (name: string, label: string, section: string) => property(name, label, section, "text")
const number = (name: string, label: string, section: string, min?: number, max?: number, step?: number) =>
  property(name, label, section, "number", {min, max, step})
const range = (name: string, label: string, section: string, min: number, max: number, step: number) =>
  property(name, label, section, "range", {min, max, step})
const color = (name: string, label: string, section: string) => property(name, label, section, "color")
const toggle = (name: string, label: string, section: string, off: string, on: string) =>
  property(name, label, section, "toggle", {values: [off, on]})

const positionBasic = [
  select("display", "Display", "Position in container", values(
    "block", "inline", "inline-block", "flow-root", "flex", "inline-flex", "grid", "inline-grid", "contents", "none",
  )),
  select("position", "Position", "Position in container", values("static", "relative", "absolute", "fixed", "sticky")),
  select("overflow", "Overflow", "Overflow & visibility", values("visible", "hidden", "clip", "scroll", "auto")),
  length("width", "Width", "Size"),
  length("height", "Height", "Size"),
  select("box-sizing", "Box sizing", "Size", values("content-box", "border-box")),
] as const

const positionAdvanced = [
  select("visibility", "Visibility", "Overflow & visibility", values("visible", "hidden", "collapse")),
  select("overflow-x", "Horizontal overflow", "Overflow & visibility", values("visible", "hidden", "clip", "scroll", "auto")),
  select("overflow-y", "Vertical overflow", "Overflow & visibility", values("visible", "hidden", "clip", "scroll", "auto")),
  select("overflow-clip-margin", "Overflow clip margin", "Overflow & visibility", values("content-box", "padding-box", "border-box")),
  select("float", "Float", "Flow", values("none", "left", "right", "inline-start", "inline-end")),
  select("clear", "Clear", "Flow", values("none", "left", "right", "both", "inline-start", "inline-end")),
  length("min-width", "Minimum width", "Size"),
  length("max-width", "Maximum width", "Size"),
  length("min-height", "Minimum height", "Size"),
  length("max-height", "Maximum height", "Size"),
  text("aspect-ratio", "Aspect ratio", "Size"),
  length("margin", "Margin", "Margin"),
  length("margin-block", "Block margin", "Margin"),
  length("margin-inline", "Inline margin", "Margin"),
  length("margin-top", "Top margin", "Margin"),
  length("margin-right", "Right margin", "Margin"),
  length("margin-bottom", "Bottom margin", "Margin"),
  length("margin-left", "Left margin", "Margin"),
  length("padding", "Padding", "Padding"),
  length("padding-block", "Block padding", "Padding"),
  length("padding-inline", "Inline padding", "Padding"),
  length("padding-top", "Top padding", "Padding"),
  length("padding-right", "Right padding", "Padding"),
  length("padding-bottom", "Bottom padding", "Padding"),
  length("padding-left", "Left padding", "Padding"),
  length("border-width", "Border width", "Border"),
  select("border-style", "Border style", "Border", values("none", "hidden", "solid", "dotted", "dashed", "double", "groove", "ridge", "inset", "outset")),
  color("border-color", "Border color", "Border"),
  length("border-radius", "Corner radius", "Border"),
  text("border-image", "Border image", "Border"),
  length("outline-width", "Outline width", "Outline"),
  select("outline-style", "Outline style", "Outline", values("none", "auto", "solid", "dotted", "dashed", "double")),
  color("outline-color", "Outline color", "Outline"),
  length("outline-offset", "Outline offset", "Outline"),
  length("inset", "Inset", "Position offsets"),
  length("top", "Top", "Position offsets"),
  length("right", "Right", "Position offsets"),
  length("bottom", "Bottom", "Position offsets"),
  length("left", "Left", "Position offsets"),
  number("z-index", "Stacking order", "Position offsets", undefined, undefined, 1),
  text("transform", "Transform", "Transform"),
  text("transform-origin", "Transform origin", "Transform"),
  select("transform-box", "Transform box", "Transform", values("content-box", "border-box", "fill-box", "stroke-box", "view-box")),
  text("translate", "Translate", "Transform"),
  text("rotate", "Rotate", "Transform"),
  text("scale", "Scale", "Transform"),
  length("perspective", "Perspective", "Transform"),
  text("perspective-origin", "Perspective origin", "Transform"),
  select("backface-visibility", "Backface visibility", "Transform", values("visible", "hidden")),
  select("transform-style", "Transform style", "Transform", values("flat", "preserve-3d")),
  text("clip-path", "Clip path", "Shape"),
  text("shape-outside", "Outside shape", "Shape"),
  length("shape-margin", "Shape margin", "Shape"),
] as const

const layoutBasic = [
  length("gap", "Gap", "Spacing"),
  select("flex-direction", "Flex direction", "Flex", values("row", "row-reverse", "column", "column-reverse")),
  select("flex-wrap", "Flex wrap", "Flex container", values("nowrap", "wrap", "wrap-reverse")),
  select("justify-content", "Justify content", "Alignment", values("normal", "start", "center", "end", "space-between", "space-around", "space-evenly", "stretch")),
  select("align-items", "Align items", "Alignment", values("normal", "stretch", "start", "center", "end", "baseline")),
  select("align-content", "Align content", "Alignment", values("normal", "start", "center", "end", "space-between", "space-around", "space-evenly", "stretch")),
] as const

const layoutAdvanced = [
  length("row-gap", "Row gap", "Spacing"),
  length("column-gap", "Column gap", "Spacing"),
  text("flex-flow", "Flex flow", "Flex container"),
  select("justify-items", "Justify items", "Alignment", values("normal", "stretch", "start", "center", "end", "baseline")),
  select("align-self", "Align self", "Flex & grid item", values("auto", "normal", "stretch", "start", "center", "end", "baseline")),
  select("justify-self", "Justify self", "Flex & grid item", values("auto", "normal", "stretch", "start", "center", "end")),
  number("order", "Order", "Flex & grid item", undefined, undefined, 1),
  number("flex-grow", "Flex grow", "Flex & grid item", 0, undefined, 0.1),
  number("flex-shrink", "Flex shrink", "Flex & grid item", 0, undefined, 0.1),
  length("flex-basis", "Flex basis", "Flex & grid item"),
  text("flex", "Flex shorthand", "Flex & grid item"),
  text("grid-template-columns", "Template columns", "Grid container"),
  text("grid-template-rows", "Template rows", "Grid container"),
  text("grid-template-areas", "Template areas", "Grid container"),
  select("grid-auto-flow", "Automatic flow", "Grid container", values("row", "column", "dense", "row dense", "column dense")),
  text("grid-auto-columns", "Automatic columns", "Grid container"),
  text("grid-auto-rows", "Automatic rows", "Grid container"),
  text("grid-column", "Grid column", "Flex & grid item"),
  text("grid-row", "Grid row", "Flex & grid item"),
  text("grid-area", "Grid area", "Flex & grid item"),
  number("column-count", "Column count", "Columns", 1, undefined, 1),
  length("column-width", "Column width", "Columns"),
  select("column-fill", "Column fill", "Columns", values("auto", "balance", "balance-all")),
  length("column-rule-width", "Column rule width", "Columns"),
  select("column-rule-style", "Column rule style", "Columns", values("none", "solid", "dotted", "dashed", "double")),
  color("column-rule-color", "Column rule color", "Columns"),
  select("column-span", "Column span", "Columns", values("none", "all")),
  select("table-layout", "Table layout", "Table", values("auto", "fixed")),
  select("border-collapse", "Border collapse", "Table", values("separate", "collapse")),
  text("border-spacing", "Border spacing", "Table"),
  select("caption-side", "Caption side", "Table", values("top", "bottom")),
  select("empty-cells", "Empty cells", "Table", values("show", "hide")),
  select("break-before", "Break before", "Fragmentation", values("auto", "avoid", "page", "column", "left", "right")),
  select("break-inside", "Break inside", "Fragmentation", values("auto", "avoid", "avoid-page", "avoid-column")),
  select("break-after", "Break after", "Fragmentation", values("auto", "avoid", "page", "column", "left", "right")),
] as const

const textBasic = [
  select("font-family", "Font family", "Font", values("system-ui", "serif", "sans-serif", "monospace", "cursive", "fantasy")),
  length("font-size", "Font size", "Font"),
  number("line-height", "Line height", "Paragraph", 0, undefined, 0.1),
  select("font-weight", "Font weight", "Font", values("normal", "bold", "lighter", "bolder", "100", "200", "300", "400", "500", "600", "700", "800", "900")),
  select("text-align", "Alignment", "Paragraph", values("start", "center", "end", "justify", "left", "right")),
  select("white-space", "White space", "Wrapping & breaking", values("normal", "pre", "nowrap", "pre-wrap", "pre-line", "break-spaces")),
] as const

const textAdvanced = [
  select("font-style", "Font style", "Font", values("normal", "italic", "oblique")),
  select("font-stretch", "Font stretch", "Font", values("ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded")),
  text("font-variation-settings", "Font variations", "Font"),
  text("font-feature-settings", "Font features", "Font"),
  text("font-kerning", "Kerning", "Font"),
  select("font-variant-caps", "Capital variant", "Font", values("normal", "small-caps", "all-small-caps", "petite-caps", "unicase", "titling-caps")),
  length("letter-spacing", "Letter spacing", "Paragraph"),
  length("word-spacing", "Word spacing", "Paragraph"),
  length("text-indent", "Text indent", "Paragraph"),
  select("text-align-last", "Last-line alignment", "Paragraph", values("auto", "start", "center", "end", "justify", "left", "right")),
  select("text-justify", "Justification", "Paragraph", values("auto", "inter-word", "inter-character", "none")),
  select("text-wrap", "Text wrap", "Wrapping & breaking", values("wrap", "nowrap", "balance", "pretty", "stable")),
  select("overflow-wrap", "Overflow wrap", "Wrapping & breaking", values("normal", "anywhere", "break-word")),
  select("word-break", "Word break", "Wrapping & breaking", values("normal", "break-all", "keep-all", "auto-phrase", "break-word")),
  select("hyphens", "Hyphenation", "Wrapping & breaking", values("none", "manual", "auto")),
  select("text-transform", "Text transform", "Decoration", values("none", "capitalize", "uppercase", "lowercase", "full-width", "full-size-kana")),
  select("text-decoration-line", "Decoration line", "Decoration", values("none", "underline", "overline", "line-through", "underline overline")),
  select("text-decoration-style", "Decoration style", "Decoration", values("solid", "double", "dotted", "dashed", "wavy")),
  color("text-decoration-color", "Decoration color", "Decoration"),
  length("text-decoration-thickness", "Decoration thickness", "Decoration"),
  length("text-underline-offset", "Underline offset", "Decoration"),
  select("text-decoration-skip-ink", "Skip ink", "Decoration", values("auto", "none", "all")),
  text("text-shadow", "Text shadow", "Decoration"),
  select("writing-mode", "Writing mode", "Writing direction", values("horizontal-tb", "vertical-rl", "vertical-lr", "sideways-rl", "sideways-lr")),
  select("direction", "Direction", "Writing direction", values("ltr", "rtl")),
  select("text-orientation", "Text orientation", "Writing direction", values("mixed", "upright", "sideways")),
  select("unicode-bidi", "Bidirectional isolation", "Writing direction", values("normal", "embed", "isolate", "bidi-override", "isolate-override", "plaintext")),
  select("vertical-align", "Vertical alignment", "Writing direction", values("baseline", "sub", "super", "text-top", "text-bottom", "middle", "top", "bottom")),
  select("list-style-position", "Marker position", "Lists", values("inside", "outside")),
  text("list-style-type", "Marker type", "Lists"),
  text("list-style-image", "Marker image", "Lists"),
] as const

const colorBasic = [
  color("color", "Text color", "Foreground"),
  color("background-color", "Background color", "Background"),
  text("background-image", "Background image", "Background"),
  range("opacity", "Opacity", "Visibility", 0, 1, 0.01),
  toggle("mix-blend-mode", "Blend with backdrop", "Compositing", "normal", "multiply"),
  text("box-shadow", "Box shadow", "Effects"),
] as const

const colorAdvanced = [
  select("background-repeat", "Background repeat", "Background", values("repeat", "no-repeat", "repeat-x", "repeat-y", "space", "round")),
  text("background-position", "Background position", "Background"),
  text("background-size", "Background size", "Background"),
  select("background-attachment", "Background attachment", "Background", values("scroll", "fixed", "local")),
  select("background-origin", "Background origin", "Background", values("border-box", "padding-box", "content-box")),
  select("background-clip", "Background clip", "Background", values("border-box", "padding-box", "content-box", "text")),
  text("filter", "Filter", "Effects"),
  text("backdrop-filter", "Backdrop filter", "Effects"),
  select("background-blend-mode", "Background blend", "Compositing", values("normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity")),
  select("isolation", "Isolation", "Compositing", values("auto", "isolate")),
  select("color-scheme", "Color scheme", "Color handling", values("normal", "light", "dark", "light dark", "only light", "only dark")),
  select("forced-color-adjust", "Forced color adjustment", "Color handling", values("auto", "none", "preserve-parent-color")),
  select("print-color-adjust", "Print color adjustment", "Color handling", values("economy", "exact")),
  select("content-visibility", "Content visibility", "Rendering", values("visible", "auto", "hidden")),
  text("contain-intrinsic-size", "Intrinsic placeholder size", "Rendering"),
] as const

const interactionBasic = [
  select("cursor", "Cursor", "Pointer", values("auto", "default", "pointer", "text", "move", "grab", "grabbing", "crosshair", "help", "not-allowed", "zoom-in", "zoom-out", "none")),
  select("user-select", "Text selection", "Pointer", values("auto", "text", "none", "all")),
  select("touch-action", "Touch action", "Pointer", values("auto", "none", "pan-x", "pan-y", "manipulation")),
  select("pointer-events", "Pointer events", "Pointer", values("auto", "none")),
  select("resize", "Resize", "Pointer", values("none", "both", "horizontal", "vertical", "block", "inline")),
  select("appearance", "Native appearance", "Controls", values("none", "auto", "base", "textfield", "menulist-button")),
] as const

const interactionAdvanced = [
  color("accent-color", "Accent color", "Controls"),
  color("caret-color", "Caret color", "Controls"),
  select("scroll-behavior", "Scroll behavior", "Scrolling", values("auto", "smooth")),
  select("overscroll-behavior", "Overscroll behavior", "Scrolling", values("auto", "contain", "none")),
  select("scrollbar-width", "Scrollbar width", "Scrolling", values("auto", "thin", "none")),
  text("scrollbar-color", "Scrollbar color", "Scrolling"),
  text("scroll-snap-type", "Scroll snap type", "Scrolling"),
  select("scroll-snap-align", "Scroll snap alignment", "Scrolling", values("none", "start", "end", "center", "start end")),
  select("scroll-snap-stop", "Scroll snap stop", "Scrolling", values("normal", "always")),
  length("scroll-margin", "Scroll margin", "Scrolling"),
  length("scroll-padding", "Scroll padding", "Scrolling"),
  text("transition-property", "Transition properties", "Transitions"),
  length("transition-duration", "Transition duration", "Transitions", timeUnits),
  text("transition-timing-function", "Transition easing", "Transitions"),
  length("transition-delay", "Transition delay", "Transitions", timeUnits),
  text("animation-name", "Animation name", "Animation"),
  length("animation-duration", "Animation duration", "Animation", timeUnits),
  length("animation-delay", "Animation delay", "Animation", timeUnits),
  text("animation-timing-function", "Animation easing", "Animation"),
  number("animation-iteration-count", "Animation iterations", "Animation", 0, undefined, 1),
  select("animation-direction", "Animation direction", "Animation", values("normal", "reverse", "alternate", "alternate-reverse")),
  select("animation-fill-mode", "Animation fill", "Animation", values("none", "forwards", "backwards", "both")),
  select("animation-play-state", "Animation state", "Animation", values("running", "paused")),
] as const

const otherBasic = [
  select("object-fit", "Object fit", "Replaced content", values("fill", "contain", "cover", "none", "scale-down")),
  text("object-position", "Object position", "Replaced content"),
  select("image-rendering", "Image rendering", "Replaced content", values("auto", "smooth", "high-quality", "crisp-edges", "pixelated")),
  text("content", "Generated content", "Generated content"),
  text("will-change", "Will change", "Performance"),
  select("field-sizing", "Field sizing", "Controls", values("fixed", "content")),
] as const

const otherAdvanced = [
  select("object-view-box", "Object view box", "Replaced content", values("none")),
  text("quotes", "Quotation marks", "Generated content"),
  text("counter-increment", "Counter increment", "Counters"),
  text("counter-reset", "Counter reset", "Counters"),
  text("counter-set", "Counter set", "Counters"),
  text("contain", "Containment", "Containment"),
  text("container-name", "Container name", "Containment"),
  select("container-type", "Container type", "Containment", values("normal", "size", "inline-size", "scroll-state")),
  select("interpolate-size", "Size interpolation", "Interpolation", values("numeric-only", "allow-keywords")),
  text("anchor-name", "Anchor name", "Anchoring"),
  text("position-anchor", "Position anchor", "Anchoring"),
  text("position-area", "Position area", "Anchoring"),
  text("position-try-fallbacks", "Position fallbacks", "Anchoring"),
  select("speak", "Speech", "Accessibility", values("normal", "none", "spell-out")),
  text("all", "All properties", "Reset"),
] as const

export const elementStyleCategories: readonly ElementStyleCategory[] = [
  {id: "position", label: "Position & Form", icon: "Position", basic: positionBasic, advanced: positionAdvanced},
  {id: "layout", label: "Layout", icon: "Layout", basic: layoutBasic, advanced: layoutAdvanced},
  {id: "text", label: "Text", icon: "Text", basic: textBasic, advanced: textAdvanced},
  {id: "color", label: "Color & Visibility", icon: "Color", basic: colorBasic, advanced: colorAdvanced},
  {id: "interaction", label: "Interaction & Motion", icon: "Input", basic: interactionBasic, advanced: interactionAdvanced},
  {id: "other", label: "Other", icon: "More", basic: otherBasic, advanced: otherAdvanced},
] as const

export const elementStylePropertyNames = Array.from(new Set(
  elementStyleCategories.flatMap(category => [...category.basic, ...category.advanced].map(definition => definition.name)),
))

export const elementStylePropertyNameSet = new Set(elementStylePropertyNames)

/** Properties whose authored value belongs to each selected text block rather
 * than to their structural common ancestor. The Style UI routes these through
 * the selection-aware paragraph command. */
export const paragraphStylePropertyNames = [
  "line-height",
  "text-align",
  "letter-spacing",
  "word-spacing",
  "text-indent",
  "text-align-last",
  "text-justify",
  "hyphens",
  "direction",
] as const

export const paragraphStylePropertyNameSet = new Set<string>(paragraphStylePropertyNames)
