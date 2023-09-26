import { SchemaPlugin } from ".";
import { HTMLElementSpec, ariaAttributes, getAttrs, toAttributes } from "../htmlelementspec";
import {NodeSpec} from "prosemirror-model"

const coreSVGAttributes = {
  id: {default: undefined},
  lang: {default: undefined},
  tabindex: {default: undefined},
  "xml:base": {default: undefined},
  "xml:lang": {default: undefined},
  "xml:space": {default: undefined}
}

const stylingSVGAttributes = {
  class: {default: undefined},
  style: {default: undefined}
}

const eventSVGAttributes = {
  oncancel: {default: undefined},
  oncanplay: {default: undefined},
  oncanplaythrough: {default: undefined},
  onchange: {default: undefined},
  onclick: {default: undefined},
  onclose: {default: undefined},
  oncuechange: {default: undefined},
  ondblclick: {default: undefined},
  ondrag: {default: undefined},
  ondragend: {default: undefined},
  ondragenter: {default: undefined},
  ondragleave: {default: undefined},
  ondragover: {default: undefined},
  ondragstart: {default: undefined},
  ondrop: {default: undefined},
  ondurationchange: {default: undefined},
  onemptied: {default: undefined},
  onended: {default: undefined},
  onerror: {default: undefined},
  onfocus: {default: undefined},
  oninput: {default: undefined},
  oninvalid: {default: undefined},
  onkeydown: {default: undefined},
  onkeypress: {default: undefined},
  onkeyup: {default: undefined},
  onload: {default: undefined},
  onloadeddata: {default: undefined},
  onloadedmetadata: {default: undefined},
  onloadstart: {default: undefined},
  onmousedown: {default: undefined},
  onmouseenter: {default: undefined},
  onmouseleave: {default: undefined},
  onmousemove: {default: undefined},
  onmouseout: {default: undefined},
  onmouseover: {default: undefined},
  onmouseup: {default: undefined},
  onmousewheel: {default: undefined},
  onpause: {default: undefined},
  onplay: {default: undefined},
  onplaying: {default: undefined},
  onprogress: {default: undefined},
  onratechange: {default: undefined},
  onreset: {default: undefined},
  onresize: {default: undefined},
  onscroll: {default: undefined},
  onseeked: {default: undefined},
  onseeking: {default: undefined},
  onselect: {default: undefined},
  onshow: {default: undefined},
  onstalled: {default: undefined},
  onsubmit: {default: undefined},
  onsuspend: {default: undefined},
  ontimeupdate: {default: undefined},
  ontoggle: {default: undefined},
  onvolumechange: {default: undefined},
  onwaiting: {default: undefined}
}

const presentationSVGAttributes = {
  "alignment-baseline": {default: undefined},
  "baseline-shift": {default: undefined},
  "clip": {default: undefined},
  "clip-path": {default: undefined},
  "clip-rule": {default: undefined},
  "color": {default: undefined},
  "color-interpolation": {default: undefined},
  "color-interpolation-filters": {default: undefined},
  "color-profile": {default: undefined},
  "color-rendering": {default: undefined},
  "cursor": {default: undefined},
  "d": {default: undefined},
  "direction": {default: undefined},
  "display": {default: undefined},
  "dominant-baseline": {default: undefined},
  "enable-background": {default: undefined},
  "fill": {default: undefined},
  "fill-opacity": {default: undefined},
  "fill-rule": {default: undefined},
  "filter": {default: undefined},
  "flood-color": {default: undefined},
  "flood-opacity": {default: undefined},
  "font-family": {default: undefined},
  "font-size": {default: undefined},
  "font-size-adjust": {default: undefined},
  "font-stretch": {default: undefined},
  "font-style": {default: undefined},
  "font-variant": {default: undefined},
  "font-weight": {default: undefined},
  "glyph-orientation-horizontal": {default: undefined},
  "glyph-orientation-vertical": {default: undefined},
  "image-rendering": {default: undefined},
  "kerning": {default: undefined},
  "letter-spacing": {default: undefined},
  "lighting-color": {default: undefined},
  "marker-end": {default: undefined},
  "marker-mid": {default: undefined},
  "marker-start": {default: undefined},
  "mask": {default: undefined},
  "opacity": {default: undefined},
  "overflow": {default: undefined},
  "pointer-events": {default: undefined},
  "shape-rendering": {default: undefined},
  "solid-color": {default: undefined},
  "solid-opacity": {default: undefined},
  "stop-color": {default: undefined},
  "stop-opacity": {default: undefined},
  "stroke": {default: undefined},
  "stroke-dasharray": {default: undefined},
  "stroke-dashoffset": {default: undefined},
  "stroke-linecap": {default: undefined},
  "stroke-linejoin": {default: undefined},
  "stroke-miterlimit": {default: undefined},
  "stroke-opacity": {default: undefined},
  "stroke-width": {default: undefined},
  "text-anchor": {default: undefined},
  "text-decoration": {default: undefined},
  "text-rendering": {default: undefined},
  "transform": {default: undefined},
  "unicode-bidi": {default: undefined},
  "vector-effect": {default: undefined},
  "visibility": {default: undefined},
  "word-spacing": {default: undefined},
  "writing-mode": {default: undefined}
} 

const conditionalProcessingSVGAttributes = {
  requiredExtensions: {default: undefined},
  requiredFeatures: {default: undefined},
  systemLanguage: {default: undefined}
}

const globalSVGAttributes = {
  ...coreSVGAttributes,
  ...eventSVGAttributes,
  ...stylingSVGAttributes,
  ...presentationSVGAttributes,
  ...conditionalProcessingSVGAttributes,
  ...ariaAttributes
}

const animationEventSVGAttributes = {
  onbegin: {default: undefined},
  onend: {default: undefined},
  onrepeat: {default: undefined}  
}

const documentEventSVGAttributes = {
  onabort: {default: undefined},
  onerror: {default: undefined},
  onresize: {default: undefined},
  onscroll: {default: undefined},
  onunload: {default: undefined}
}

const graphicalEventSVGAttributes = {
  onactivate: {default: undefined},
  onfocusin: {default: undefined},
  onfocusout: {default: undefined}
}

const documentElementEventSVGAttributes = {
  oncopy: {default: undefined},
  oncut: {default: undefined},
  onpaste: {default: undefined}
}

const animationSVGAttributes = {
  begin: {default: undefined},
  dur: {default: undefined},
  end: {default: undefined},
  min: {default: undefined},
  max: {default: undefined},
  restart: {default: undefined},
  repeatCount: {default: undefined},
  repeatDur: {default: undefined},
  fill: {default: undefined},
  calcMode: {default: undefined},
  values: {default: undefined},
  keyTimes: {default: undefined},
  keySplines: {default: undefined},
  from: {default: undefined},
  to: {default: undefined},
  by: {default: undefined},
  attributeName: {default: undefined},
  additive: {default: undefined},
  accumulate: {default: undefined},
  ...animationEventSVGAttributes,
}

const filterPrimitiveSVGAttributes = {
  height: {default: undefined},
  result: {default: undefined},
  width: {default: undefined},
  x: {default: undefined},
  y: {default: undefined},
}

export function SVGElementSpec(spec: NodeSpec & {tag: string}) {
  return HTMLElementSpec({
    ...spec,
    attrs: {...globalSVGAttributes, ...spec.attrs},
    toDOM: spec.toDOM ?? (n => [spec.tag, toAttributes(n), ...(spec.content? [0]: [])]),
    parseDOM: spec.parseDOM ?? [{tag: spec.tag, getAttrs, context: "svg//"}],
  })
}

export const svgPlugin = () => ({
  nodes: {
    svg: HTMLElementSpec({
      tag: "svg",
      group: "embedded",
      attrs: {
        ...globalSVGAttributes,
        ...documentEventSVGAttributes,
        ...documentElementEventSVGAttributes,
        baseProfile: {default: undefined},
        contentScriptType: {default: undefined},
        height: {default: undefined},
        preserveAspectRatio: {default: undefined},
        version: {default: undefined},
        viewBox: {default: undefined},
        width: {default: undefined},
        x: {default: undefined},
        y: {default: undefined}
      }
    }),
    aSVG: SVGElementSpec({
      tag: "a",
      group: "container_svg",
      content: "(animation_svg | descriptive_svg | structural_svg | svg | gradient_svg | aSVG | clipPathSVG | filterSVG | foreignObjectSVG | imageSVG | markerSVG | maskSVG | patternSVG | scriptSVG | styleSVG | switchSVG | textSVG | viewSVG)*",
      attrs: {
        download: {default: undefined},
        href: {default: undefined},
        hreflang: {default: undefined},
        ping: {default: undefined},
        referrerpolicy: {default: undefined},
        rel: {default: undefined},
        target: {default: undefined},
        type: {default: undefined},
        ...documentElementEventSVGAttributes,
        ...graphicalEventSVGAttributes
      }
    }),
    animateSVG: SVGElementSpec({
      tag: "animate",
      group: "animation_svg",
      attrs: {
        ...animationSVGAttributes,
        ...documentElementEventSVGAttributes
      }
    }),
    animateMotionSVG: SVGElementSpec({
      tag: "animateMotion",
      group: "animation_svg",
      content: "(descriptive_svg | mpathSVG)*",
      attrs: {
        ...animationSVGAttributes,
        ...documentElementEventSVGAttributes
      }
    }),
    animateTransformSVG: SVGElementSpec({
      tag: "animateTransform",
      group: "animation_svg",
      content: "descriptive_svg*",
      attrs: {
        type: {default: undefined},
        ...animationSVGAttributes,
        ...documentElementEventSVGAttributes
      }
    }),
    circleSVG: SVGElementSpec({
      tag: "circle",
      group: "shape_svg",
      content: "(animation_svg | descriptive_svg)*",
      attrs: {
        cx: {default: undefined},
        cy: {default: undefined},
        r: {default: undefined},
        pathLength: {default: undefined},
        ...graphicalEventSVGAttributes
      }
    }),
    clipPathSVG: SVGElementSpec({
      tag: "clipPath",
      content: "(animation_svg | descriptive_svg | shape_svg | textSVG | useSVG)*",
      attrs: {
        clipPathUnits: {default: undefined}
      }
    }),
    defsSVG: SVGElementSpec({
      tag: "defs",
      group: "structural_svg",
      content: "(animation_svg | descriptive_svg | shape_svg | structural_svg | svg | gradient_svg | aSVG | clipPathSVG | filterSVG | foreignObjectSVG | imageSVG | markerSVG | maskSVG | patternSVG | scriptSVG | styleSVG | switchSVG | textSVG | viewSVG)",
      attrs: {
        ...documentElementEventSVGAttributes,
        ...graphicalEventSVGAttributes
      }
    }),
    descSVG: SVGElementSpec({
      tag: "desc",
      group: "descriptive_svg",
      content: "text*",
      attrs: {
        ...documentElementEventSVGAttributes
      }
    }),
    ellipseSVG: SVGElementSpec({
      tag: "ellipse",
      group: "shape_svg",
      content: "(animation_svg | descriptive_svg)*",
      attrs: {
        cx: {default: undefined},
        cy: {default: undefined},
        rx: {default: undefined},
        ry: {default: undefined},
        pathLength: {default: undefined},
        ...graphicalEventSVGAttributes
      }
    }),
    feBlendSVG: SVGElementSpec({
      tag: "feBlend",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        in: {default: undefined},
        in2: {default: undefined},
        mode: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feColorMatrixSVG: SVGElementSpec({
      tag: "feColorMatrix",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        in: {default: undefined},
        type: {default: undefined},
        values: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feComponentTransferSVG: SVGElementSpec({
      tag: "feComponentTransfer",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG | feFuncASVG | feFuncRSVG | feFuncBSVG | feFuncGSVG)*",
      attrs: {
        in: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feCompositeSVG: SVGElementSpec({
      tag: "feComposite",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        in: {default: undefined},
        in2: {default: undefined},
        operator: {default: undefined},
        k1: {default: undefined},
        k2: {default: undefined},
        k3: {default: undefined},
        k4: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feConvolveMatrixSVG: SVGElementSpec({
      tag: "feConvolveMatrix",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        in: {default: undefined},
        order: {default: undefined},
        kernelMatrix: {default: undefined},
        divisor: {default: undefined},
        bias: {default: undefined},
        targetX: {default: undefined},
        targetY: {default: undefined},
        edgeMode: {default: undefined},
        kernelUnitLength: {default: undefined},
        preserveAlpha: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feDiffuseLightingSVG: SVGElementSpec({
      tag: "feDiffuseLighting",
      group: "filterprimitive_svg",
      content: "(descriptive_svg* lightsource_svg) | (lightsource_svg descriptive_svg*)",
      attrs: {
        in: {default: undefined},
        surfaceScale: {default: undefined},
        diffuseConstant: {default: undefined},
        kernelUnitLength: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feDisplacementMapSVG: SVGElementSpec({
      tag: "feDisplacementMap",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        in: {default: undefined},
        in2: {default: undefined},
        scale: {default: undefined},
        xChannelSelector: {default: undefined},
        yChannelSelector: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feDistantLightSVG: SVGElementSpec({
      tag: "feDistantLight",
      group: "lightsource_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        azimuth: {default: undefined},
        elevation: {default: undefined}
      }
    }),
    feDropShadowSVG: SVGElementSpec({
      tag: "feDropShadow",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG | scriptSVG)*",
      attrs: {
        dx: {default: undefined},
        dy: {default: undefined},
        stdDeviation: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feFloodSVG: SVGElementSpec({
      tag: "feFlood",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        floodColor: {default: undefined},
        floodOpacity: {default: undefined},
        ...filterPrimitiveSVGAttributes
      
      }
    }),
    feFuncASVG: SVGElementSpec({
      tag: "feFuncA",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        ...filterPrimitiveSVGAttributes
      }
    }),
    feFuncBSVG: SVGElementSpec({
      tag: "feFuncB",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        ...filterPrimitiveSVGAttributes
      }
    }),
    feFuncGSVG: SVGElementSpec({
      tag: "feFuncG",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        ...filterPrimitiveSVGAttributes
      }
    }),
    feFuncRSVG: SVGElementSpec({
      tag: "feFuncR",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        ...filterPrimitiveSVGAttributes
      }
    }),
    feGaussianBlurSVG: SVGElementSpec({
      tag: "feGaussianBlur",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        in: {default: undefined},
        stdDeviation: {default: undefined},
        edgeMode: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feImageSVG: SVGElementSpec({
      tag: "feImage",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG | animateTransformSVG)*",
      attrs: {
        crossorigin: {default: undefined},
        preserveAspectRatio: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feMergeSVG: SVGElementSpec({
      tag: "feMerge",
      group: "filterprimitive_svg",
      content: "feMergeSVG*",
      attrs: {
        ...filterPrimitiveSVGAttributes
      }
    }),
    feMergeNodeSVG: SVGElementSpec({
      tag: "feMergeNode",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        in: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feMorphologySVG: SVGElementSpec({
      tag: "feMorphology",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        in: {default: undefined},
        operator: {default: undefined},
        radius: {default: undefined},
        ...filterPrimitiveSVGAttributes}
    }),
    feOffsetSVG: SVGElementSpec({
      tag: "feOffset",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        in: {default: undefined},
        dx: {default: undefined},
        dy: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    fePointLightSVG: SVGElementSpec({
      tag: "fePointLight",
      group: "lightsource_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        x: {default: undefined},
        y: {default: undefined},
        z: {default: undefined},
      }
    }),
    feSpecularLightingSVG: SVGElementSpec({
      tag: "feSpecularLighting",
      group: "filterprimitive_svg",
      content: "lightsource_svg descriptive_svg*",
      attrs: {
        in: {default: undefined},
        surfaceScale: {default: undefined},
        specularConstant: {default: undefined},
        specularExponent: {default: undefined},
        kernelUnitLength: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feSpotLightSVG: SVGElementSpec({
      tag: "feSpotLight",
      group: "lightsource_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        x: {default: undefined},
        y: {default: undefined},
        z: {default: undefined},
        pointsAtX: {default: undefined},
        pointsAtY: {default: undefined},
        pointsAtZ: {default: undefined},
        specularExponent: {default: undefined},
        limitingConeAngle: {default: undefined},
      }
    }),
    feTileSVG: SVGElementSpec({
      tag: "feTile",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        in: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    feTurbulenceSVG: SVGElementSpec({
      tag: "feTurbulence",
      group: "filterprimitive_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        baseFrequency: {default: undefined},
        numOctaves: {default: undefined},
        seed: {default: undefined},
        stitchTiles: {default: undefined},
        type: {default: undefined},
        ...filterPrimitiveSVGAttributes
      }
    }),
    filterSVG: SVGElementSpec({
      tag: "filter",
      content: "(animateSVG | setSVG | descriptive_svg | filterprimitive_svg)*",
      attrs: {
        x: {default: undefined},
        y: {default: undefined},
        width: {default: undefined},
        height: {default: undefined},
        filterUnits: {default: undefined},
        primitiveUnits: {default: undefined}
      }
    }),
    foreignObjectSVG: SVGElementSpec({
      tag: "foreignObject",
      content: `flow* | unknownElement*`,
      attrs: {
        x: {default: undefined},
        y: {default: undefined},
        width: {default: undefined},
        height: {default: undefined},
        ...graphicalEventSVGAttributes,
        ...documentEventSVGAttributes,
        ...documentElementEventSVGAttributes
      }
    }),
    gSVG: SVGElementSpec({
      tag: "g",
      group: "structural_svg",
      content: "(animation_svg | descriptive_svg | shape_svg | structural_svg | svg | gradient_svg | aSVG | clipPathSVG | filterSVG | foreignObjectSVG | imageSVG | markerSVG | maskSVG | patternSVG | scriptSVG | styleSVG | switchSVG | textSVG | viewSVG)*",
      attrs: {
        ...graphicalEventSVGAttributes
      }
    }),
    imageSVG: SVGElementSpec({
      tag: "image",
      content: "(animation_svg | descriptive_svg)*",
      attrs: {
        x: {default: undefined},
        y: {default: undefined},
        width: {default: undefined},
        height: {default: undefined},
        href: {default: undefined},
        preserveAspectRatio: {default: undefined},
        crossorigin: {default: undefined},
        decoding: {default: undefined},
        ...graphicalEventSVGAttributes,
      }
    }),
    lineSVG: SVGElementSpec({
      tag: "line",
      group: "shape_svg",
      content: "(animation_svg | descriptive_svg)*",
      attrs: {
        x1: {default: undefined},
        x2: {default: undefined},
        y1: {default: undefined},
        y2: {default: undefined},
        pathLength: {default: undefined},
        ...graphicalEventSVGAttributes,
      }
    }),
    linearGradientSVG: SVGElementSpec({
      tag: "linearGradient",
      group: "gradient_svg",
      content: "(descriptive_svg | animateSVG | animateTransformSVG | setSVG | stopSVG)*",
      attrs: {
        gradientUnits: {default: undefined},
        gradientTransform: {default: undefined},
        href: {default: undefined},
        spreadMethod: {default: undefined},
        x1: {default: undefined},
        x2: {default: undefined},
        y1: {default: undefined},
        y2: {default: undefined},
        pathLength: {default: undefined},
        ...documentElementEventSVGAttributes,
        ...graphicalEventSVGAttributes
      }
    }),
    markerSVG: SVGElementSpec({
      tag: "marker",
      group: "container_svg",
      content: "(animation_svg | descriptive_svg | shape_svg | structural_svg | gradient_svg | aSVG | clipPathSVG | filterSVG | foreignObjectSVG | imageSVG | markerSVG | maskSVG | patternSVG | scriptSVG | styleSVG | switchSVG | textSVG | viewSVG)*",
      attrs: {
        markerHeight: {default: undefined},
        markerUnits: {default: undefined},
        markerWidth: {default: undefined},
        orient: {default: undefined},
        preserveAspectRatio: {default: undefined},
        refX: {default: undefined},
        refY: {default: undefined},
        viewBox: {default: undefined}
      }
    }),
    maskSVG: SVGElementSpec({
      tag: "mask",
      group: "container_svg",
      content: "(animation_svg | descriptive_svg | shape_svg | structural_svg | svg | gradient_svg | aSVG | clipPathSVG | filterSVG | foreignObjectSVG | imageSVG | markerSVG | maskSVG | patternSVG | scriptSVG | styleSVG | switchSVG | textSVG | viewSVG)*",
      attrs: {
        height: {default: undefined},
        maskContentUnits: {default: undefined},
        maskUnits: {default: undefined},
        x: {default: undefined},
        y: {default: undefined},
        width: {default: undefined}
      }
    }),
    metadataSVG: SVGElementSpec({
      tag: "metadata",
      content: "unknownElement*"
    }),
    mpathSVG: SVGElementSpec({
      tag: "mpath",
      group: "animation_svg",
      content: "descriptive_svg*",
    }),
    pathSVG: SVGElementSpec({
      tag: "path",
      group: "shape_svg",
      content: "(animation_svg | descriptive_svg)*",
      attrs: {
        d: {default: undefined},
        pathLength: {default: undefined},
        ...graphicalEventSVGAttributes
      }
    }),
    patternSVG: SVGElementSpec({
      tag: "pattern",
      group: "container_svg",
      content: "(animation_svg | descriptive_svg | shape_svg | structural_svg | svg | gradient_svg | aSVG | clipPathSVG | filterSVG | foreignObjectSVG | imageSVG | markerSVG | maskSVG | patternSVG | scriptSVG | styleSVG | switchSVG | textSVG | viewSVG)*",
      attrs: {
        height: {default: undefined},
        href: {default: undefined},
        patterContentUnits: {default: undefined},
        patternTransform: {default: undefined},
        patternUnits: {default: undefined},
        preserveAspectRatio: {default: undefined},
        viewBox: {default: undefined},
        width: {default: undefined},
        x: {default: undefined},
        y: {default: undefined}
      }
    }),
    polygonSVG: SVGElementSpec({
      tag: "polygon",
      group: "shape_svg",
      content: "(animation_svg | descriptive_svg)*",
      attrs: {
        points: {default: undefined},
        pathLength: {default: undefined},
        ...graphicalEventSVGAttributes
      }
    }),
    polylineSVG: SVGElementSpec({
      tag: "polyline",
      group: "shape_svg",
      content: "(animation_svg | descriptive_svg)*",
      attrs: {
        points: {default: undefined},
        pathLength: {default: undefined},
        ...graphicalEventSVGAttributes
      }
    }),
    radialGradientSVG: SVGElementSpec({
      tag: "radialGradient",
      group: "gradient_svg",
      content: "(animation_svg | animateSVG | animateTransformSVG | setSVG | stopSVG)*",
      attrs: {
        cx: {default: undefined},
        cy: {default: undefined},
        fr: {default: undefined},
        fx: {default: undefined},
        fy: {default: undefined},
        gradientUnits: {default: undefined},
        gradientTransform: {default: undefined},
        href: {default: undefined},
        r: {default: undefined},
        spreadMethod: {default: undefined},
        ...documentElementEventSVGAttributes,
        ...graphicalEventSVGAttributes
      }
    }),
    rectSVG: SVGElementSpec({
      tag: "rect",
      group: "shape_svg",
      content: "(animation_svg | descriptive_svg)*",
      attrs: {
        x: {default: undefined},
        y: {default: undefined},
        width: {default: undefined},
        height: {default: undefined},
        rx: {default: undefined},
        ry: {default: undefined},
        pathLength: {default: undefined},
        ...graphicalEventSVGAttributes
      }
    }),
    scriptSVG: SVGElementSpec({
      tag: "script",
      content: `text*`,
      attrs: {
        crossorigin: {default: undefined},
        href: {default: undefined},
        type: {default: undefined},
        ...documentElementEventSVGAttributes
      }
    }),
    setSVG: SVGElementSpec({
      tag: "set",
      group: "animation_svg",
      content: "descriptive_svg*",
      attrs: {
        ...animationSVGAttributes,
        ...documentElementEventSVGAttributes
      }
    }),
    stopSVG: SVGElementSpec({
      tag: "stop",
      group: "gradient_svg",
      content: "(animateSVG | setSVG)*",
      attrs: {
        offset: {default: undefined},
        "stop-color": {default: undefined},
        "stop-opacity": {default: undefined},
        ...documentElementEventSVGAttributes
      }
    }),
    styleSVG: SVGElementSpec({
      tag: "style",
      content: `text*`,
      attrs: {
        type: {default: undefined},
        media: {default: undefined},
        title: {default: undefined},
        ...documentElementEventSVGAttributes
      }
    }),
    switchSVG: SVGElementSpec({
      tag: "switch",
      group: "container_svg",
      content: `(animation_svg | descriptive_svg | shape_svg | aSVG | foreignObjectSVG | gSVG | imageSVG | svg | switchSVG | textSVG | useSVG)*`,
      attrs: {
        transform: {default: undefined},
        ...graphicalEventSVGAttributes
      }
    }),
    symbolSVG: SVGElementSpec({
      tag: "symbol",
      group: "structural_svg",
      content: "(animation_svg | descriptive_svg | shape_svg | structural_svg | svg | gradient_svg | aSVG | clipPathSVG | filterSVG | foreignObjectSVG | imageSVG | markerSVG | maskSVG | patternSVG | scriptSVG | styleSVG | switchSVG | textSVG | viewSVG)*",
      attrs: {
        height: {default: undefined},
        preserveAspectRatio: {default: undefined},
        refX: {default: undefined},
        refY: {default: undefined},
        viewBox: {default: undefined},
        width: {default: undefined},
        x: {default: undefined},
        y: {default: undefined},
        ...documentElementEventSVGAttributes,
        ...graphicalEventSVGAttributes
      }
    }),
    textSVG: SVGElementSpec({
      tag: "text*",
      group: "textcontent_svg",
      content: "(animation_svg | descriptive_svg | textcontent_svg | aSVG)*",
      attrs: {
        x: {default: undefined},
        y: {default: undefined},
        dx: {default: undefined},
        dy: {default: undefined},
        rotate: {default: undefined},
        lengthAdjust: {default: undefined},
        textLength: {default: undefined},
        ...graphicalEventSVGAttributes
      }
    }),
    textPathSVG: SVGElementSpec({
      tag: "textPath",
      group: "textcontent_svg",
      content: "(descriptive_svg | aSVG | animateSVG | setSVG | tspanSVG)*",
      attrs: {
        href: {default: undefined},
        lengthAdjust: {default: undefined},
        method: {default: undefined},
        path: {default: undefined},
        side: {default: undefined},
        startOffset: {default: undefined},
        textLength: {default: undefined},
        ...graphicalEventSVGAttributes
      }
    }),
    titleSVG: SVGElementSpec({
      tag: "title",
      group: "descriptive_svg",
      content: `text*`,
      attrs: {
        ...documentElementEventSVGAttributes
      },
    }),
    tspanSVG: SVGElementSpec({
      tag: "tspan",
      group: "textcontent_svg",
      content: `(descriptive_svg | aSVG | animateSVG | setSVG | tspanSVG)*`,
      attrs: {
        x: {default: undefined},
        y: {default: undefined},
        dx: {default: undefined},
        dy: {default: undefined},
        rotate: {default: undefined},
        lengthAdjust: {default: undefined},
        textLength: {default: undefined},
        ...graphicalEventSVGAttributes
      }
    }),
    useSVG: SVGElementSpec({
      tag: "use",
      group: "structural_svg",
      content: `(animation_svg | descriptive_svg)*`,
      attrs: {
        x: {default: undefined},
        y: {default: undefined},
        width: {default: undefined},
        height: {default: undefined},
        href: {default: undefined},
        ...graphicalEventSVGAttributes
      }
    }),
    viewSVG: SVGElementSpec({
      tag: "view",
      content: `(descriptive_svg)*`,
      attrs: {
        viewBox: {default: undefined},
        preserveAspectRatio: {default: undefined}
      }
    })
  }
} as SchemaPlugin)