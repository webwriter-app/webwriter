import {readGraphicPreset, writeGraphicPreset} from "./graphic-shapes"
import {SVG_NAMESPACE, graphicShapeGeometry} from "./graphic"
import {textPointAtOffset} from "./utility"

const clean = (value: number) => String(Math.round(value*1e6)/1e6)
const fontProperties = ["font-family","font-size","font-weight","font-style","font-stretch","font-variant","font-feature-settings","font-variation-settings","letter-spacing","word-spacing","direction","writing-mode"]
const cache = new WeakMap<Element,string>()
type LineMetrics={width:number,coordinates:number[],hanging:(number|null)[]}
type TextMetrics={key:string,native:boolean,fontSize:number,segments:{index:number,segment:string}[],boundaries:Set<number>,advances:Float64Array,ascent:number,descent:number,lineHeight:number,lines:Map<string,LineMetrics>}
const metricsCache=new WeakMap<Element,TextMetrics>()
const fontIdentities=new WeakMap<FontFace,number>()
let nextFontIdentity=0
const fontState=()=>[document.fonts?.status,...Array.from(document.fonts??[]).map(face=>{
  if(!fontIdentities.has(face)) fontIdentities.set(face,++nextFontIdentity)
  return [fontIdentities.get(face),face.status,face.family,face.style,face.weight,face.stretch,face.unicodeRange,face.featureSettings]
})]

/** Preview clones share immutable glyph metrics and bounded derived line caches,
 * never the source's DOM nodes or its authored layout attributes. */
export function copyGraphicTextLayoutCache(source:Element,preview:Element) {
  const text=Array.from(source.children).find(child=>child.localName === "text")
  const clone=Array.from(preview.children).find(child=>child.localName === "text")
  if(!text || !clone) return
  const metrics=metricsCache.get(text)
  if(metrics) metricsCache.set(clone,metrics)
}
const graphemes = new Intl.Segmenter(undefined,{granularity:"grapheme"})
const words = new Intl.Segmenter(undefined,{granularity:"word"})
type Bounds={x:number,y:number,width:number,height:number}
export const graphicLabelPadding=8

export function fitGraphicTextBox(shape: Element, appendix: ShadowRoot): boolean {
  return layoutGraphicText(shape,appendix)
}

export function wrapGraphicShapeLabel(shape: Element, appendix: ShadowRoot, bounds: Bounds): boolean {
  return layoutGraphicText(shape,appendix,bounds)
}

/** SVG has native glyph measurement and positioning, but does not yet wrap
 * text with inline-size. Keep the authored runs and Selection intact: only
 * the text's native coordinate lists and the preset's contour need changing. */
function layoutGraphicText(shape: Element, appendix: ShadowRoot, labelBounds?: Bounds, wrapLimit?: number, attempt=0): boolean {
  if(shape.localName !== "g") return false
  const path = graphicShapeGeometry(shape)
  const text = Array.from(shape.children).find(child => child.localName === "text") as SVGTextElement | undefined
  const state = readGraphicPreset(path), intrinsic=state?.definition.contentSize
  const frame=intrinsic ? state!.bounds : labelBounds
  const sizing=intrinsic ?? (frame ? {maxWidth:Math.max(1,frame.width-graphicLabelPadding*2),padding:graphicLabelPadding} : null)
  if(!path || !text || !frame || !sizing) return false
  const legacyLines=[...text.children]
  if(!text.style.inlineSize && legacyLines.length>1 && legacyLines.every((line,index) =>
    line.localName === "tspan" && line.getAttribute("x") === text.getAttribute("x")
    && line.getAttribute("dy") === `${clean(index ? 1.2 : -(legacyLines.length-1)*.6)}em`
    && !["y","dx","rotate","textLength"].some(name => line.hasAttribute(name)))) {
    legacyLines.forEach((line,index) => {
      if(index) line.before(document.createTextNode("\n"))
      line.removeAttribute("x");line.removeAttribute("dy")
    })
  }
  // Preserve deliberately positioned, unfamiliar text rather than rewriting it.
  if(text.querySelector("[x], [y], [dx], [dy], [rotate], [textLength]")
    || [...text.querySelectorAll("*")].some(element => !["tspan","a"].includes(element.localName))) return false
  if(!intrinsic && text.style.inlineSize !== `${sizing.maxWidth}px` || !text.style.inlineSize) text.style.inlineSize = `${sizing.maxWidth}px`
  if(text.style.whiteSpace !== "pre-wrap") text.style.whiteSpace = "pre-wrap"
  if(text.getAttribute("text-anchor") !== "start") text.setAttribute("text-anchor","start")
  if(text.getAttribute("dominant-baseline") !== "alphabetic") text.setAttribute("dominant-baseline","alphabetic")
  const computed = getComputedStyle(text)
  const maxWidth = Math.max(1,parseFloat(computed.inlineSize) || parseFloat(text.style.inlineSize) || sizing.maxWidth)
  let availableWidth=wrapLimit ?? maxWidth
  const elements = [text,...text.querySelectorAll("*")]
  const styles = elements.map(element => {
    const style = getComputedStyle(element)
    return fontProperties.map(property => style.getPropertyValue(property))
  })
  const content = text.textContent ?? ""
  const attributes = [...text.attributes].filter(attribute => !["x","y","class","style"].includes(attribute.name)).map(attribute => [attribute.name,attribute.value])
  const authoredStyle=Array.from({length:text.style.length},(_,index) => text.style.item(index)).filter(property => !["scale","transform-origin","transform-box"].includes(property)).map(property => [property,text.style.getPropertyValue(property)])
  const fonts=fontState()
  const metricKey=JSON.stringify([text.innerHTML,attributes,authoredStyle.filter(([property])=>!["inline-size","white-space"].includes(property)),styles,fonts])
  const key = JSON.stringify([metricKey,authoredStyle,maxWidth,clean(frame.x+frame.width/2),clean(frame.y+frame.height/2),intrinsic ? null : [frame.width,frame.height]])
  if(cache.get(text) === key) return false
  let probe:SVGSVGElement|undefined, sample:SVGTextElement|undefined
  const getSample=()=>{
    if(sample) return sample
    probe=document.createElementNS(SVG_NAMESPACE,"svg")
    probe.style.cssText="position:fixed;left:0;top:0;width:1px;height:1px;overflow:visible;opacity:0;pointer-events:none"
    probe.setAttribute("aria-hidden","true")
    sample=text.cloneNode(true) as SVGTextElement
    for(const attribute of ["x","y","dx","dy","transform","textLength","lengthAdjust"]) sample.removeAttribute(attribute)
    sample.setAttribute("x","0");sample.setAttribute("y","0")
    sample.style.whiteSpace="pre";sample.style.inlineSize=""
    ;[sample,...sample.querySelectorAll("*")].forEach((element,index)=>{
      for(const [i,property] of fontProperties.entries()) if(styles[index][i]) (element as SVGElement).style.setProperty(property,styles[index][i])
    })
    probe.append(sample);appendix.append(probe)
    return sample
  }
  try {
    let metrics=metricsCache.get(text)
    if(metrics?.key!==metricKey) {
      const sample=getSample(),native=typeof sample.getNumberOfChars === "function" && sample.getNumberOfChars() === content.length
      const renderedMetrics=typeof text.getComputedTextLength === "function" && text.getComputedTextLength()>0
      const fontSize=parseFloat(text.style.fontSize || (renderedMetrics ? computed.fontSize : text.getAttribute("font-size") ?? computed.fontSize)) || 48
      const segments=[...graphemes.segment(content)].map(({index,segment})=>({index,segment}))
      const advances=new Float64Array(content.length+1)
      if(native) {
        // Measure whole graphemes: a UTF-16 index inside an emoji can address
        // its entire glyph again. Prefix sums make every wrap trial a plain
        // subtraction instead of another native text-layout query.
        segments.forEach(({index,segment})=>{
          const next=advances[index]+sample.getSubStringLength(index,segment.length)
          for(let end=index+1;end<=index+segment.length;end++) advances[end]=next
        })
      }
      else segments.forEach(({index,segment},i)=>{for(let end=index+1;end<=index+segment.length;end++) advances[end]=(i+1)*fontSize*.6})
      let ascent=fontSize*.9,descent=fontSize*.3
      if(native && content.length) {
        const box=sample.getBBox()
        ascent=Math.max(0,-box.y);descent=Math.max(0,box.y+box.height)
      }
      metrics={key:metricKey,native,fontSize,segments,advances,ascent,descent,lineHeight:Math.max(fontSize*1.2,ascent+descent),boundaries:new Set([...words.segment(content)].map(({index,segment})=>index+segment.length)),lines:new Map()}
      metricsCache.set(text,metrics)
    }
    const {native,fontSize,segments,advances,ascent,descent,lineHeight,boundaries}=metrics
    const width=(start:number,end:number)=>end<=start ? 0 : advances[end]-advances[start]
    const wrap=(limit:number) => {
      const lines: {start:number,end:number}[] = []
      let start=0, lastBreak=0
      for(const {index,segment} of segments) {
        if(/[\r\n]/.test(segment)) {
          lines.push({start,end:index+segment.length})
          start=index+segment.length; lastBreak=start
          continue
        }
        const end=index+segment.length
        while(!/^\s+$/u.test(segment) && index>start && width(start,end)>limit) {
          const next=lastBreak>start ? lastBreak : index
          lines.push({start,end:next})
          start=next; lastBreak=start
        }
        if(boundaries.has(end)) lastBreak=end
      }
      lines.push({start,end:content.length})
      return lines
    }
    const height=(lines:{start:number,end:number}[]) => Math.max(fontSize,lineHeight*(lines.length-1)+ascent+descent)
    let lines=wrap(availableWidth), layoutScale=1
    if(!intrinsic && height(lines)>Math.max(1,frame.height-sizing.padding*2)) {
      // Reflow at the fitted size instead of shrinking a narrow, tall column.
      // Native metrics remain in the chosen font; scaling its wrap width gives
      // the same layout without changing authored font sizes or rich runs.
      let low=0,high=1
      const availableHeight=Math.max(1,frame.height-sizing.padding*2)
      for(let i=0;i<8;i++) {
        const scale=(low+high)/2
        if(height(wrap(availableWidth/scale))*scale<=availableHeight) low=scale
        else high=scale
      }
      layoutScale=low || availableHeight/height(lines)
      availableWidth/=layoutScale
      lines=wrap(availableWidth)
    }
    const measurements=lines.map(line => {
      const key=`${line.start}:${line.end}`
      const cached=metrics.lines.get(key)
      if(cached) return cached
      const coordinates: number[]=[],hanging:(number|null)[]=[]
      const trailing=line.end-(content.slice(line.start,line.end).match(/\s+$/u)?.[0].length ?? 0)
      let lineSample=native ? getSample() : undefined
      if(native && line.end>line.start) {
        const sample=getSample()
        // Shape each line separately so mixed-direction text and ligatures
        // use the browser's own line ordering and run metrics.
        const range=document.createRange()
        range.setStart(...textPointAtOffset(sample,line.start))
        range.setEnd(...textPointAtOffset(sample,line.end))
        lineSample=sample.cloneNode(false) as SVGTextElement
        lineSample.append(range.cloneContents())
        probe!.append(lineSample)
      }
      try {
        const end=line.end-(content.slice(line.start,line.end).match(/[\r\n]+$/u)?.[0].length ?? 0)
        const lineWidth=native && end>line.start ? lineSample!.getSubStringLength(0,end-line.start) : width(line.start,end)
        let origin=0
        if(native && trailing>line.start) {
          origin=Infinity
          for(let i=line.start;i<trailing;) {
            const local=i-line.start
            origin=Math.min(origin,lineSample!.getStartPositionOfChar(local).x,lineSample!.getEndPositionOfChar(local).x)
            i+=content.codePointAt(i)!>0xffff ? 2 : 1
          }
        }
        // Glyph APIs use UTF-16 offsets; coordinate lists consume code points.
        for(let i=line.start;i<line.end;) {
          const length=content.codePointAt(i)!>0xffff ? 2 : 1
          const advance=native ? lineSample!.getStartPositionOfChar(i-line.start).x-origin : width(line.start,i)
          coordinates.push(advance)
          hanging.push(i>=trailing ? width(i,i+length) : null)
          i+=length
        }
        const measured={width:lineWidth,coordinates,hanging}
        // A gesture can visit many widths. Bound cached line variants while
        // retaining enough for reverse drags and repeat gestures.
        if(metrics.lines.size>=256) metrics.lines.delete(metrics.lines.keys().next().value!)
        metrics.lines.set(key,measured)
        return measured
      }
      finally {if(lineSample && lineSample!==sample) lineSample.remove()}
    }).map(line=>{
      const width=Math.min(availableWidth,line.width)
      return {width,coordinates:line.coordinates.map((advance,i)=>line.hanging[i]===null ? advance : Math.max(0,Math.min(advance,width-line.hanging[i]!)))}
    })
    const lineWidths=measurements.map(line => line.width)
    const fittedWidth=Math.max(1,...lineWidths)+sizing.padding*2
    const fittedHeight=Math.max(fontSize,lineHeight*(lines.length-1)+ascent+descent)+sizing.padding*2
    const cx=frame.x+frame.width/2, cy=frame.y+frame.height/2
    let bounds={x:cx-fittedWidth/2,y:cy-fittedHeight/2,width:fittedWidth,height:fittedHeight}
    const x: string[]=[], y: string[]=[]
    for(const [row,line] of measurements.entries()) {
      const left=intrinsic ? bounds.x+sizing.padding : cx-line.width/2
      for(const advance of line.coordinates) {
        x.push(clean(left+advance))
        y.push(clean(bounds.y+sizing.padding+ascent+row*lineHeight))
      }
    }
    if(!x.length) {x.push(clean(cx));y.push(clean(bounds.y+sizing.padding+ascent))}
    const set=(name:string,value:string) => {if(text.getAttribute(name)!==value) text.setAttribute(name,value)}
    set("x",x.join(" "));set("y",y.join(" "))
    if(native && content.length && text.isConnected) {
      // Explicit glyph positions can alter joining/overhangs. Fit the actual
      // rendered result, tightening the wrap once more if necessary.
      const glyphs=text.getBBox()
      if(glyphs.width>availableWidth+.01 && attempt<3) return layoutGraphicText(shape,appendix,labelBounds,Math.max(1,(availableWidth-(glyphs.width-availableWidth)-1)*layoutScale),attempt+1)
      const dx=cx-(glyphs.x+glyphs.width/2)
      if(Math.abs(dx)>1e-6) set("x",x.map(value => clean(Number(value)+dx)).join(" "))
      bounds={...bounds,x:cx-(glyphs.width+sizing.padding*2)/2,width:Math.max(1,glyphs.width)+sizing.padding*2}
    }
    if(intrinsic && state) {
      const next = [bounds.x,bounds.y,bounds.width,bounds.height]
      const previous = [state.bounds.x,state.bounds.y,state.bounds.width,state.bounds.height]
      if(next.some((value,i) => Math.abs(value-previous[i])>1e-5)) writeGraphicPreset(path,state,bounds)
    }
    // Keep the chosen font and rich runs intact. A native SVG/CSS transform
    // fits the entire label uniformly, and relaxes again when space increases.
    const scale=intrinsic ? 1 : Math.min(layoutScale,Math.max(1,frame.width-sizing.padding*2)/Math.max(1,bounds.width-sizing.padding*2),Math.max(1,frame.height-sizing.padding*2)/Math.max(1,fittedHeight-sizing.padding*2))
    const value=scale<1-1e-4 ? clean(scale) : ""
    if(text.style.scale !== value) text.style.scale=value
    if(!intrinsic) {
      const origin=`${clean(cx)}px ${clean(cy)}px`
      if(text.style.transformOrigin !== origin) text.style.transformOrigin=origin
      if(text.style.transformBox !== "view-box") text.style.transformBox="view-box"
    }
    cache.set(text,key)
    return true
  }
  finally {probe?.remove()}
}
