import {graphicPresetHandles, graphicPresetOptions, graphicPresetPath, readGraphicPreset, adjustGraphicPreset} from "../src/graphic-shapes"

/** Native stroke hit-testing checks the actual curves, not their control hull. */
export function checkGraphicPOIEdges() {
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg")
  svg.style.cssText="position:fixed;left:0;top:0;width:300px;height:200px;opacity:0;pointer-events:none"
  const path=document.createElementNS(svg.namespaceURI,"path") as SVGPathElement
  path.setAttribute("fill","none");path.setAttribute("stroke","black");path.setAttribute("stroke-width",".15")
  path.setAttribute("stroke-linecap","round")
  path.setAttribute("stroke-linejoin","round")
  svg.append(path);document.body.append(svg)
  const errors:string[]=[]
  const bounds={x:7,y:11,width:270,height:155}
  try {
    for(const option of graphicPresetOptions) {
      path.setAttribute("aria-label",option.label)
      const original=graphicPresetPath(option.type,bounds)
      path.setAttribute("d",original)
      const initial=readGraphicPreset(path)!
      const cases:[string,number,number][]=[["default",-1,0]]
      initial.definition.adjustments.forEach((control,index)=>{
        if(control.hidden) return
        const [min,max]=initial.definition.adjustmentLimits?.(initial.values,index) ?? [control.min,control.max]
        for(const value of [min,(min+max)/2,max]) cases.push([`${control.name}=${value}`,index,value])
      })
      for(const [label,index,value] of cases) {
        path.setAttribute("d",original)
        if(index>=0) adjustGraphicPreset(path,readGraphicPreset(path)!,`adjust-${initial.definition.adjustments[index].name}`,value)
        const state=readGraphicPreset(path)!
        if(!state) {errors.push(`${option.type}/${label}: lost recognition`);continue}
        for(const handle of graphicPresetHandles(state)) {
          if(!path.isPointInStroke(new DOMPoint(handle.point.x,handle.point.y))) errors.push(`${option.type}/${label}/${handle.name}: (${handle.point.x.toFixed(3)}, ${handle.point.y.toFixed(3)}) off contour`)
        }
      }
    }
    if(errors.length) throw new Error(errors.join("\n"))
  }
  finally {svg.remove()}
}
