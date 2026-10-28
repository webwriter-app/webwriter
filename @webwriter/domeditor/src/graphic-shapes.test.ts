// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {graphicShapePresets, legacyArrowPresets, legacyCalloutPresets, legacyCloudPreset, legacyCurvedArrowPresets, legacySpeechBubblePresets, speechBubblePrefix, type GraphicShapePreset} from "./graphic-shape-presets"
import {adjustGraphicPreset, graphicPresetFillRule, graphicPresetHandles, graphicPresetOptions, graphicPresetPath, readGraphicPreset, writeGraphicPreset} from "./graphic-shapes"

const bounds = {x: -137.25, y: 219.75, width: 273.5, height: 146.25}

const cubicSamples = (path: string) => {
  const values = path.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
  const points = Array.from({length: values.length / 2}, (_, i) => ({x: values[2 * i], y: values[2 * i + 1]}))
  const samples = [points[0]]
  for(let i = 1; i + 2 < points.length; i += 3) {
    const [start, a, b, end] = points.slice(i - 1, i + 3)
    for(let step = 1; step <= 100; step++) {
      const t = step / 100
      samples.push({
        x: (1-t)**3 * start.x + 3*(1-t)**2*t * a.x + 3*(1-t)*t**2 * b.x + t**3 * end.x,
        y: (1-t)**3 * start.y + 3*(1-t)**2*t * a.y + 3*(1-t)*t**2 * b.y + t**3 * end.y,
      })
    }
  }
  return samples
}

const reflectedPathCoordinates = (path: string, axis: "x" | "y", bounds: {x: number, y: number, width: number, height: number}) => {
  const coordinates = path.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
  return coordinates.map((value, index) => {
    const horizontal = index % 2 === 0
    if(axis === "x" && horizontal) return 2 * bounds.x + bounds.width - value
    if(axis === "y" && !horizontal) return 2 * bounds.y + bounds.height - value
    return value
  })
}

const expectMirroredCurvedArrows = (leftType: "curved-left-arrow" | "curved-up-arrow", rightType: "curved-right-arrow" | "curved-down-arrow", axis: "x" | "y", values: number[]) => {
  const left = graphicPresetPath(leftType, bounds, values)
  const right = graphicPresetPath(rightType, bounds, values)
  const leftCommands = left.match(/[A-Za-z]/g)
  const rightCommands = right.match(/[A-Za-z]/g)
  expect(rightCommands).toEqual(leftCommands)
  const expected = reflectedPathCoordinates(left, axis, bounds)
  const actual = right.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
  expect(actual).toHaveLength(expected.length)
  actual.forEach((coordinate, index) => expect(coordinate).toBeCloseTo(expected[index], 7))

  const leftElement = document.createElementNS("http://www.w3.org/2000/svg", "path")
  leftElement.setAttribute("aria-label", graphicShapePresets[leftType].label)
  leftElement.setAttribute("d", left)
  const rightElement = document.createElementNS("http://www.w3.org/2000/svg", "path")
  rightElement.setAttribute("aria-label", graphicShapePresets[rightType].label)
  rightElement.setAttribute("d", right)
  const leftState = readGraphicPreset(leftElement)!
  const rightState = readGraphicPreset(rightElement)!
  const leftHandles = graphicPresetHandles(leftState)
  const rightHandles = graphicPresetHandles(rightState)
  expect(rightHandles.map(({name}, index) => ({name, axis: rightState.definition.adjustments[index].axis})))
    .toEqual(leftHandles.map(({name}, index) => ({name, axis: leftState.definition.adjustments[index].axis})))
  rightHandles.forEach((handle, index) => {
    const point = leftHandles[index].point
    expect(handle.point.x).toBeCloseTo(axis === "x" ? 2 * bounds.x + bounds.width - point.x : point.x, 7)
    expect(handle.point.y).toBeCloseTo(axis === "y" ? 2 * bounds.y + bounds.height - point.y : point.y, 7)
  })

  const serializedLeft = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${leftElement.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
  const serializedRight = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${rightElement.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
  const leftBefore = readGraphicPreset(serializedLeft)!
  const rightBefore = readGraphicPreset(serializedRight)!
  const target = 11
  expect(adjustGraphicPreset(serializedLeft, leftBefore, `adjust-${leftBefore.definition.adjustments[0].name}`, target)).toBe(true)
  expect(adjustGraphicPreset(serializedRight, rightBefore, `adjust-${rightBefore.definition.adjustments[0].name}`, target)).toBe(true)
  const leftAfter = readGraphicPreset(serializedLeft)!
  const rightAfter = readGraphicPreset(serializedRight)!
  expectMirroredPaths(serializedLeft.getAttribute("d")!, serializedRight.getAttribute("d")!, axis, bounds)
  const leftAfterHandles = graphicPresetHandles(leftAfter)
  const rightAfterHandles = graphicPresetHandles(rightAfter)
  rightAfterHandles.forEach((handle, index) => {
    expect(handle.point.x).toBeCloseTo(axis === "x" ? 2 * bounds.x + bounds.width - leftAfterHandles[index].point.x : leftAfterHandles[index].point.x, 7)
    expect(handle.point.y).toBeCloseTo(axis === "y" ? 2 * bounds.y + bounds.height - leftAfterHandles[index].point.y : leftAfterHandles[index].point.y, 7)
  })
}

const expectMirroredPaths = (left: string, right: string, axis: "x" | "y", bounds: {x: number, y: number, width: number, height: number}) => {
  expect(right.match(/[A-Za-z]/g)).toEqual(left.match(/[A-Za-z]/g))
  const expected = reflectedPathCoordinates(left, axis, bounds)
  const actual = right.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
  expect(actual).toHaveLength(expected.length)
  actual.forEach((coordinate, index) => expect(coordinate).toBeCloseTo(expected[index], 7))
}

describe("native SVG shape presets", () => {
  it("uses one radial inner-radius POI for the cloud while preserving lobe midpoints", () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", "Cloud")
    element.setAttribute("d", graphicPresetPath("cloud", bounds))
    const before = readGraphicPreset(element)!
    expect(before.definition.adjustments.map(({name,label,default: value,min,max,axis}) => ({name,label,value,min,max,axis}))).toEqual([
      {name:"inner",label:"Inner radius",value:30,min:0,max:38,axis:"x"},
    ])
    expect(graphicPresetHandles(before).map(handle=>handle.label)).toEqual(["Inner radius"])
    const unadjustedPath = element.getAttribute("d")!
    const unitCoordinates = (path:string) => path.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
    const defaultValues = unitCoordinates(graphicPresetPath("cloud", {x:0,y:0,width:100,height:100}))
    const defaultSegments = Array.from({length:(defaultValues.length-2)/6},(_,i)=>defaultValues.slice(i*6,i*6+8))
    const midpoint = (segment:number[]) => {
      const [x0,y0,x1,y1,x2,y2,x3,y3]=segment
      return {x:(x0+3*x1+3*x2+x3)/8,y:(y0+3*y1+3*y2+y3)/8}
    }
    const defaultMidpoints=defaultSegments.map(midpoint)
    const nextPoint=before.definition.adjustments[0].point([36])
    const target={x:before.bounds.x+nextPoint.x/100*before.bounds.width,y:before.bounds.y+nextPoint.y/100*before.bounds.height}
    expect(adjustGraphicPreset(element,before,"adjust-inner",target)).toBe(true)
    const after=readGraphicPreset(element)!
    expect(after.values[0]).toBeCloseTo(36,4)
    const scaled=unitCoordinates(element.getAttribute("d")!).map((value,index)=>index%2===0 ? (value-bounds.x)/bounds.width*100 : (value-bounds.y)/bounds.height*100)
    const endpointIndices=Array.from({length:9},(_,i)=>i*6+6)
    for(const index of endpointIndices) {
      const x=defaultValues[index],y=defaultValues[index+1]
      expect(scaled[index]).toBeCloseTo(50+(x-50)*1.2,3)
      expect(scaled[index+1]).toBeCloseTo(40+(y-40)*1.2,3)
    }
    const adjustedSegments=Array.from({length:(scaled.length-2)/6},(_,i)=>scaled.slice(i*6,i*6+8))
    adjustedSegments.forEach((segment,index)=>{
      const actual=midpoint(segment)
      expect(actual.x).toBeCloseTo(defaultMidpoints[index].x,3)
      expect(actual.y).toBeCloseTo(defaultMidpoints[index].y,3)
    })
    const reloaded=new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><path aria-label="Cloud" d="${element.getAttribute("d")}"/></svg>`,"image/svg+xml").querySelector("path")!
    expect(readGraphicPreset(reloaded)!.values[0]).toBeCloseTo(36,4)
    expect(graphicPresetHandles(readGraphicPreset(reloaded)!)[0].point.x).toBeCloseTo(target.x,3)
    expect(graphicPresetHandles(readGraphicPreset(reloaded)!)[0].point.y).toBeCloseTo(target.y,3)
    expect(unadjustedPath).not.toBe(element.getAttribute("d"))
  })

  it.each([legacyCloudPreset.definition.adjustments[0].min,legacyCloudPreset.definition.adjustments[0].default,legacyCloudPreset.definition.adjustments[0].max])("recognizes legacy cloud puff value %s and upgrades it on edit", puff => {
    const element=document.createElementNS("http://www.w3.org/2000/svg","path")
    let index=0
    const path=legacyCloudPreset.definition.draw([puff]).replace(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g,value=>{
      const axis=index++%2===0 ? "x" : "y"
      return String(bounds[axis]+Number(value)/100*bounds[axis==="x"?"width":"height"])
    })
    element.setAttribute("aria-label","Cloud")
    element.setAttribute("d",path)
    const before=readGraphicPreset(element)!
    expect(before.type).toBe("cloud")
    expect(before.values[0]).toBeCloseTo(30,4)
    expect(element.getAttribute("d")).toBe(path)
    expect(graphicPresetHandles(before).map(handle=>handle.label)).toEqual(["Inner radius"])
    expect(adjustGraphicPreset(element,before,"adjust-inner",graphicPresetHandles(before)[0].point)).toBe(true)
    expect(readGraphicPreset(element)!.type).toBe("cloud")
    expect(element.getAttribute("d")).not.toBe(path)
  })

  it.each(graphicPresetOptions)("keeps $label geometry stable when grabbing a POI without moving", option => {
    const element=document.createElementNS("http://www.w3.org/2000/svg","path")
    element.setAttribute("aria-label",option.label)
    const path=graphicPresetPath(option.type,bounds)
    const numbers=(value:string)=>value.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
    element.setAttribute("d",path)
    for(const handle of graphicPresetHandles(readGraphicPreset(element)!)) {
      element.setAttribute("d",path)
      expect(adjustGraphicPreset(element,readGraphicPreset(element)!,handle.name,handle.point)).toBe(true)
      const expected=numbers(path),actual=numbers(element.getAttribute("d")!)
      expect(actual).toHaveLength(expected.length)
      actual.forEach((value,index)=>expect(value).toBeCloseTo(expected[index],4))
    }
  })

  it.each(graphicPresetOptions.filter(option => option.category === "Block arrows"))("gives $label three independent arrow controls after reload", option => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", option.label)
    element.setAttribute("d", graphicPresetPath(option.type, bounds))
    const original = readGraphicPreset(element)!
    expect(graphicPresetHandles(original).map(handle => handle.label)).toEqual(["Shaft thickness", "Arrowhead start", "Arrowhead thickness"])
    for(const index of [0,1,2]) {
      writeGraphicPreset(element, original)
      const before = readGraphicPreset(element)!
      const adjustment = before.definition.adjustments[index]
      const [min,max] = before.definition.adjustmentLimits!(before.values,index)
      const target = Math.min(max,Math.max(min,before.values[index]+(index === 0 ? -1 : 1)))
      const next = [...before.values]
      next[index] = target
      const point = adjustment.point(next)
      const input = {x:before.bounds.x+point.x/100*before.bounds.width,y:before.bounds.y+point.y/100*before.bounds.height}
      expect(adjustGraphicPreset(element,before,`adjust-${adjustment.name}`,input)).toBe(true)
      const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`,"image/svg+xml").querySelector("path")!
      const after = readGraphicPreset(reloaded)!
      expect(after.type).toBe(option.type)
      expect(graphicPresetHandles(after)).toHaveLength(3)
      const handle = graphicPresetHandles(after)[index]
      expect(handle.point.x).toBeCloseTo(input.x,4)
      expect(handle.point.y).toBeCloseTo(input.y,4)
      if(index !== 2 || !before.definition.normalizedAdjustment) {
        before.values.forEach((value,i) => expect(after.values[i]).toBeCloseTo(i === index ? target : value,4))
      }
      else {
        // Head width changes the perpendicular extent. The shaft and head
        // start stay fixed, except the pentagon's junction follows its edge.
        graphicPresetHandles(before).slice(0,2).forEach((previous,i) => {
          expect(graphicPresetHandles(after)[i].point.x).toBeCloseTo(previous.point.x,4)
          if(option.type === "home-plate" && i === 1) expect(graphicPresetHandles(after)[i].point.y).toBeGreaterThan(previous.point.y)
          else expect(graphicPresetHandles(after)[i].point.y).toBeCloseTo(previous.point.y,4)
        })
      }
    }
  })

  it.each(Object.entries(legacyArrowPresets))("retains saved %s geometry and gives it the three new controls", (type, legacy) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    for(const value of [legacy!.definition.adjustments[0].min,legacy!.definition.adjustments[0].default,legacy!.definition.adjustments[0].max]) {
      let index = 0
      const path = legacy!.definition.draw([value]).replace(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g, value => {
        const horizontal = index++%2 === 0
        return String((horizontal ? bounds.x : bounds.y)+Number(value)/100*(horizontal ? bounds.width : bounds.height))
      })
      element.setAttribute("aria-label",legacy!.definition.label)
      element.setAttribute("d",path)
      const state = readGraphicPreset(element)!
      expect(state.type).toBe(type)
      expect(graphicPresetHandles(state)).toHaveLength(3)
      expect(element.getAttribute("d")).toBe(path)
      adjustGraphicPreset(element,state,"adjust-shaft",state.values[0]+.25)
      expect(readGraphicPreset(element)?.type).toBe(type)
      expect(graphicPresetHandles(readGraphicPreset(element)!)).toHaveLength(3)
    }
  })

  it.each(graphicPresetOptions.filter(option => option.category === "Callouts"))("edits the $label connector tip in two dimensions", option => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", option.label)
    element.setAttribute("d", graphicPresetPath(option.type, bounds))
    const before=readGraphicPreset(element)!
    expect(before.values).toHaveLength(3)
    expect(graphicPresetHandles(before).map(handle=>handle.label)).toHaveLength(2)
    const next=[...before.values];next[0]=-30;next[1]=160
    const target=before.definition.adjustments[0].point(next)
    const point={x:bounds.x+target.x/100*bounds.width,y:bounds.y+target.y/100*bounds.height}
    expect(adjustGraphicPreset(element,before,"adjust-end-x",point)).toBe(true)
    const reloaded=new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`,"image/svg+xml").querySelector("path")!
    const after=readGraphicPreset(reloaded)!
    expect(after.type).toBe(option.type)
    after.values.forEach((value,i)=>expect(value).toBeCloseTo(next[i],4))
    const handle=graphicPresetHandles(after).find(handle=>handle.name==="adjust-end-x")!
    expect(handle.point.x).toBeCloseTo(point.x,4)
    expect(handle.point.y).toBeCloseTo(point.y,4)
    for(const key of ["x","y","width","height"] as const) expect(after.bounds[key]).toBeCloseTo(bounds[key],4)
    const beforeRound=readGraphicPreset(element)!,control=beforeRound.definition.adjustments[2]
    expect(adjustGraphicPreset(element,beforeRound,`adjust-${control.name}`,control.max)).toBe(true)
    const final=readGraphicPreset(element)!
    expect(final.values[0]).toBeCloseTo(beforeRound.values[0],4)
    expect(final.values[1]).toBeCloseTo(beforeRound.values[1],4)
    expect(final.values[2]).toBeCloseTo(control.max,4)
    expect(element.hasAttribute("data-parameters")).toBe(false)
  })

  it.each(["rectangular-callout","rounded-rectangular-callout","oval-callout"] as const)("moves the $type speech bubble tail around its body with one endpoint POI", type => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", graphicShapePresets[type].label)
    element.setAttribute("d",graphicPresetPath(type,bounds))
    const initial = readGraphicPreset(element)!
    expect(initial.values).toHaveLength(3)
    expect(graphicPresetHandles(initial).map(handle => handle.label)).toEqual(["Connector end",type === "oval-callout" ? "Bubble roundness" : "Corner roundness"])
    for(const [target,side] of [
      [{x:bounds.x+bounds.width*.5,y:bounds.y-bounds.height*.4},"top"],
      [{x:bounds.x-bounds.width*.4,y:bounds.y+bounds.height*.5},"left"],
      [{x:bounds.x+bounds.width*1.4,y:bounds.y+bounds.height*.5},"right"],
      [{x:bounds.x+bounds.width*.5,y:bounds.y+bounds.height*1.4},"bottom"],
    ] as const) {
      const before = readGraphicPreset(element)!
      expect(adjustGraphicPreset(element,before,"adjust-end-x",target)).toBe(true)
      const commands = [...element.getAttribute("d")!.matchAll(/([MLQCZ])([^MLQCZ]*)/g)]
      const endpoint = (command: RegExpMatchArray) => {
        const values = command[2].match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)?.map(Number) ?? []
        return command[1] === "C" || command[1] === "Q" ? {x:values.at(-2)!,y:values.at(-1)!} : command[1] === "M" || command[1] === "L" ? {x:values[0],y:values[1]} : null
      }
      const tipIndex = commands.findIndex(command => command[1] === "L" && (() => {
        const point = endpoint(command)!
        return Math.abs(point.x-target.x) < .001 && Math.abs(point.y-target.y) < .001
      })())
      expect(tipIndex).toBeGreaterThan(0)
      const bases = [endpoint(commands[tipIndex-1]),endpoint(commands[tipIndex+1])].filter((point): point is {x:number,y:number} => !!point)
      expect(bases).toHaveLength(2)
      if(type === "oval-callout") {
        if(side === "top") bases.forEach(point => expect(point.y).toBeLessThan(bounds.y+bounds.height*.375))
        if(side === "bottom") bases.forEach(point => expect(point.y).toBeGreaterThan(bounds.y+bounds.height*.375))
        if(side === "left") bases.forEach(point => expect(point.x).toBeLessThan(bounds.x+bounds.width*.5))
        if(side === "right") bases.forEach(point => expect(point.x).toBeGreaterThan(bounds.x+bounds.width*.5))
      }
      else {
        if(side === "top") bases.forEach(point => expect(point.y).toBeCloseTo(bounds.y,3))
        if(side === "bottom") bases.forEach(point => expect(point.y).toBeCloseTo(bounds.y+bounds.height*.75,3))
        if(side === "left") bases.forEach(point => expect(point.x).toBeCloseTo(bounds.x,3))
        if(side === "right") bases.forEach(point => expect(point.x).toBeCloseTo(bounds.x+bounds.width,3))
      }
      const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`,"image/svg+xml").querySelector("path")!
      const after = readGraphicPreset(reloaded)!
      expect(after.type).toBe(type)
      expect(after.values[0]).toBeCloseTo((target.x-bounds.x)/bounds.width*100,3)
      expect(after.values[1]).toBeCloseTo((target.y-bounds.y)/bounds.height*100,3)
      for(const key of ["x","y","width","height"] as const) expect(after.bounds[key]).toBeCloseTo(bounds[key],3)
    }
    const beforeRoundness = readGraphicPreset(element)!
    expect(adjustGraphicPreset(element,beforeRoundness,"adjust-roundness",beforeRoundness.definition.adjustments[2].max)).toBe(true)
    const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`,"image/svg+xml").querySelector("path")!
    expect(readGraphicPreset(reloaded)?.values[2]).toBeCloseTo(beforeRoundness.definition.adjustments[2].max,3)
    expect(element.hasAttribute("data-parameters")).toBe(false)
  })

  it.each(["line-callout-1","line-callout-2"] as const)("attaches the $type leader to the matching side of its unchanged box", type => {
    for(const [target,side] of [
      [[50,-40],"top"], [[-50,38],"left"], [[150,38],"right"], [[50,140],"bottom"],
    ] as const) {
      const element=document.createElementNS("http://www.w3.org/2000/svg","path")
      element.setAttribute("aria-label",graphicShapePresets[type].label)
      element.setAttribute("d",graphicPresetPath(type,bounds))
      const initial=readGraphicPreset(element)!,next=[...initial.values]
      next[0]=target[0];next[1]=target[1]
      const point=initial.definition.adjustments[0].point(next)
      const destination={x:bounds.x+point.x/100*bounds.width,y:bounds.y+point.y/100*bounds.height}
      expect(adjustGraphicPreset(element,initial,"adjust-end-x",destination)).toBe(true)
      const after=readGraphicPreset(element)!
      expect(after.type).toBe(type)
      const d=element.getAttribute("d")!
      const leader=d.match(/Z M ([-+\d.eE]+) ([-+\d.eE]+)/)!
      const x=Number(leader[1]),y=Number(leader[2])
      if(side==="top") expect(y).toBeCloseTo(bounds.y,3)
      if(side==="bottom") expect(y).toBeCloseTo(bounds.y+bounds.height*.75,3)
      if(side==="left") expect(x).toBeCloseTo(bounds.x+bounds.width*.3,3)
      if(side==="right") expect(x).toBeCloseTo(bounds.x+bounds.width,3)
      let coordinate=0
      const body=speechBubblePrefix(type,after.values[2],0).replace(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g,value=>{
        const axis=coordinate++%2===0 ? "x" : "y"
        return String(bounds[axis]+Number(value)/100*bounds[axis==="x" ? "width" : "height"])
      })
      const expectedBody=body.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
      const actualBody=d.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.slice(0,expectedBody.length).map(Number)
      expect(actualBody).toHaveLength(expectedBody.length)
      actualBody.forEach((value,index)=>expect(value).toBeCloseTo(expectedBody[index],3))
    }
  })

  it.each(Object.entries(legacyCalloutPresets))("retains saved %s geometry and upgrades its three POIs when edited", (type, legacy) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const values = legacy.definition.adjustments.map(adjustment => adjustment.default)
    let index = 0
    const path = legacy.definition.draw(values).replace(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g, value => {
      const axis = index++ % 2 === 0 ? "x" : "y"
      return String(bounds[axis] + Number(value)/100 * bounds[axis === "x" ? "width" : "height"])
    })
    element.setAttribute("aria-label", legacy.definition.label)
    element.setAttribute("d", path)
    const state = readGraphicPreset(element)!
    expect(state.type).toBe(type)
    state.values.forEach((value, i) => expect(value).toBeCloseTo(legacy.upgrade(values)[i], 4))
    expect(graphicPresetHandles(state)).toHaveLength(["rectangular-callout","rounded-rectangular-callout","oval-callout","cloud-callout","line-callout-1","line-callout-2"].includes(type) ? 2 : 3)
    expect(element.getAttribute("d")).toBe(path)
    adjustGraphicPreset(element, state, "adjust-end-x", {x: bounds.x + bounds.width*1.2, y: bounds.y + bounds.height*.9})
    const edited = readGraphicPreset(element)!
    expect(edited.type).toBe(type)
    if(["rectangular-callout","rounded-rectangular-callout","oval-callout","cloud-callout","line-callout-1","line-callout-2"].includes(type)) {
      expect(edited.values[0]).toBeCloseTo(type === "cloud-callout" ? 117 : 120,4)
      expect(edited.values[1]).toBeCloseTo(90,4)
      expect(edited.definition.adjustments).toHaveLength(3)
      expect(graphicPresetHandles(edited)).toHaveLength(2)
    }
    else {
      expect(edited.values[2]).toBeCloseTo(type === "cloud-callout" ? 117 : 120, 4)
      expect(edited.values[3]).toBeCloseTo(90, 4)
      expect(edited.definition.adjustments).toHaveLength(5)
    }
  })

  it.each(Object.entries(legacySpeechBubblePresets))("recognizes and upgrades old independent $key bubble endpoints", (type, legacy) => {
    const element=document.createElementNS("http://www.w3.org/2000/svg","path")
    const values=legacy.definition.adjustments.map(adjustment=>adjustment.default)
    let coordinate=0
    const path=legacy.definition.draw(values).replace(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g,value=>{
      const axis=coordinate++%2===0 ? "x" : "y"
      return String(bounds[axis]+Number(value)/100*bounds[axis==="x" ? "width" : "height"])
    })
    element.setAttribute("aria-label",legacy.definition.label)
    element.setAttribute("d",path)
    const state=readGraphicPreset(element)!
    expect(state.type).toBe(type)
    state.values.forEach((value,index)=>expect(value).toBeCloseTo(legacy.upgrade(values)[index],4))
    expect(element.getAttribute("d")).toBe(path)
    expect(graphicPresetHandles(state)).toHaveLength(2)
    expect(adjustGraphicPreset(element,state,"adjust-end-x",{x:bounds.x+bounds.width*1.2,y:bounds.y-bounds.height*.2})).toBe(true)
    const upgraded=readGraphicPreset(element)!
    expect(upgraded.type).toBe(type)
    expect(upgraded.values[0]).toBeCloseTo(type === "cloud-callout" ? 117 : 120,3)
    expect(upgraded.values[1]).toBeCloseTo(-20,3)
    expect(upgraded.values[2]).toBeCloseTo(legacy.upgrade(values)[2],3)
    expect(graphicPresetHandles(upgraded)).toHaveLength(2)
  })

  it.each(graphicPresetOptions.filter(option => option.type.startsWith("star-")))("moves the $label POI to the center and back after reloading", option => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", option.label)
    element.setAttribute("d", graphicPresetPath(option.type, bounds))
    const before = readGraphicPreset(element)!
    const center = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
    expect(adjustGraphicPreset(element, before, "adjust-inner", center)).toBe(true)
    const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
    const centered = readGraphicPreset(reloaded)!
    expect(centered.type).toBe(option.type)
    expect(centered.values[0]).toBeCloseTo(0, 5)
    expect(graphicPresetHandles(centered)[0].point.x).toBeCloseTo(center.x, 5)
    expect(graphicPresetHandles(centered)[0].point.y).toBeCloseTo(center.y, 5)
    const coordinates = element.getAttribute("d")!.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
    for(let i = 2; i < coordinates.length; i += 4) {
      expect(coordinates[i]).toBeCloseTo(center.x, 5)
      expect(coordinates[i + 1]).toBeCloseTo(center.y, 5)
    }
    adjustGraphicPreset(reloaded, centered, "adjust-inner", -10)
    expect(readGraphicPreset(reloaded)!.values[0]).toBeCloseTo(0, 5)
    adjustGraphicPreset(reloaded, readGraphicPreset(reloaded)!, "adjust-inner", before.values[0])
    expect(readGraphicPreset(reloaded)!.values[0]).toBeCloseTo(before.values[0], 5)
    const restored = reloaded.getAttribute("d")!.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
    const original = graphicPresetPath(option.type, bounds).match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
    restored.forEach((coordinate, index) => expect(coordinate).toBeCloseTo(original[index], 5))
  })

  it.each([0, .5, 15.75, 45, 90, 180, 270, 359.5, 360])("recovers a circular Pie slice of %s degrees with its POI on the perimeter", sweep => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", "Pie")
    element.setAttribute("d", graphicPresetPath("pie", bounds, [sweep]))
    const state = readGraphicPreset(element)!
    expect(state.type).toBe("pie")
    expect(state.values[0]).toBeCloseTo(sweep, 3)
    for(const key of ["x", "y", "width", "height"] as const) expect(state.bounds[key]).toBeCloseTo(bounds[key], 5)
    const values = element.getAttribute("d")!.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
    const [cx, cy, topX, topY, rx, ry] = values
    expect(topX).toBeCloseTo(bounds.x + bounds.width / 2)
    expect(topY).toBeCloseTo(bounds.y)
    expect(rx).toBeCloseTo(bounds.width / 2)
    expect(ry).toBeCloseTo(bounds.height / 2)
    for(const offset of [4, 11]) {
      expect(values.slice(offset + 2, offset + 5)).toEqual([0, 0, 0])
      const x = (values[offset + 5] - cx) / rx, y = (values[offset + 6] - cy) / ry
      expect(Math.hypot(x, y)).toBeCloseTo(1, 5)
    }
    const handle = graphicPresetHandles(state)[0].point
    expect(handle.x).toBeCloseTo(values[16], 4)
    expect(handle.y).toBeCloseTo(values[17], 4)
    const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
    expect(readGraphicPreset(reloaded)!.values[0]).toBeCloseTo(sweep, 3)
  })

  it("keeps the Pie default at three quarters and the full Pie's radius vertical", () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("d", graphicPresetPath("pie", bounds))
    const before = readGraphicPreset(element)!
    expect(before.values[0]).toBeCloseTo(270)
    expect(graphicPresetHandles(before)[0].point.x).toBeCloseTo(bounds.x + bounds.width)
    expect(graphicPresetHandles(before)[0].point.y).toBeCloseTo(bounds.y + bounds.height / 2)
    adjustGraphicPreset(element, before, "adjust-sweep", 360)
    const values = element.getAttribute("d")!.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
    expect(element.getAttribute("d")!.match(/L/g)).toHaveLength(1)
    expect(element.getAttribute("d")!.match(/A/g)).toHaveLength(2)
    expect(values.slice(16)).toEqual(values.slice(2, 4))
    expect(values[2]).toBe(values[0])
    expect(values[3]).toBeLessThan(values[1])
  })

  it("projects circular Pie drags onto the ellipse and clamps smoothly at zero and full sweep", () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("d", graphicPresetPath("pie", bounds))
    for(const [bearing, expected, radius] of [
      [300, 300, 2], [359, 359, .5], [0, 360, 1], [1, 360, 1],
      [355, 355, 1], [270, 270, 1], [180, 180, 1], [90, 90, 1], [.5, .5, 1], [0, 0, 1], [359, 0, 1],
    ]) {
      const angle = bearing * Math.PI / 180
      const point = {x: bounds.x + bounds.width / 2 - Math.sin(angle) * bounds.width / 2 * radius,
        y: bounds.y + bounds.height / 2 - Math.cos(angle) * bounds.height / 2 * radius}
      expect(adjustGraphicPreset(element, readGraphicPreset(element)!, "adjust-sweep", point)).toBe(true)
      expect(readGraphicPreset(element)!.values[0]).toBeCloseTo(expected, 3)
    }
    const unchanged = element.getAttribute("d")
    expect(adjustGraphicPreset(element, readGraphicPreset(element)!, "adjust-sweep", {
      x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
    })).toBe(false)
    expect(element.getAttribute("d")).toBe(unchanged)
    expect(adjustGraphicPreset(element, readGraphicPreset(element)!, "adjust-sweep", {
      x: bounds.x + bounds.width / 2 + bounds.width * 1e-6,
      y: bounds.y + bounds.height / 2 - bounds.height * 1e-6,
    })).toBe(false)
    expect(element.getAttribute("d")).toBe(unchanged)
  })

  it.each([5, 50, 75])("retains a saved Pie edge at %s and converts it to a circular sweep when edited", edge => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const path = `M 50 50 L 100 ${edge} C 100 78 78 100 50 100 C 22 100 0 78 0 50 C 0 22 22 0 50 0 L 50 50 Z`
    element.setAttribute("aria-label", "Pie")
    element.setAttribute("id", "saved-pie")
    element.setAttribute("d", path)
    const state = readGraphicPreset(element)!
    expect(state.type).toBe("pie")
    expect(state.values[0]).toBeCloseTo(270 - Math.atan2(edge - 50, 50) * 180 / Math.PI)
    expect(element.getAttribute("d")).toBe(path)
    adjustGraphicPreset(element, state, "adjust-sweep", 360)
    expect(readGraphicPreset(element)!.values[0]).toBeCloseTo(360)
    expect(element.getAttribute("id")).toBe("saved-pie")
  })

  it("rejects unrelated arc paths even when named Pie", () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", "Pie")
    const path = graphicPresetPath("pie", bounds)
    element.setAttribute("d", path.replace(" 0 0 0 ", " 0 1 0 "))
    expect(readGraphicPreset(element)).toBeNull()
    element.setAttribute("d", path.replace(/Z$/, "L 10 20 Z"))
    expect(readGraphicPreset(element)).toBeNull()
  })

  it("places both Lightning bolt POIs on its outer corners and preserves saved bolt geometry", () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const path = "M 55 0 L 20 55 L 45 55 L 35 100 L 82 38 L 55 38 Z"
    element.setAttribute("aria-label", "Lightning bolt")
    element.setAttribute("d", path)
    const state = readGraphicPreset(element)!
    expect(state.type).toBe("lightning-bolt")
    state.values.forEach((value, i) => expect(value).toBeCloseTo([20, 18][i]))
    expect(graphicPresetHandles(state).map(handle => ({name: handle.name, x: Math.round(handle.point.x), y: Math.round(handle.point.y)}))).toEqual([
      {name: "adjust-width", x: 20, y: 55}, {name: "adjust-right-width", x: 82, y: 38},
    ])
    expect(element.getAttribute("d")).toBe(path)
    adjustGraphicPreset(element, state, "adjust-right-width", {x: 72, y: -100})
    const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
    readGraphicPreset(reloaded)!.values.forEach((value, i) => expect(value).toBeCloseTo([20, 28][i]))
  })

  it.each([
    {label: "independent", horizontal: false, vertical: false},
    {label: "horizontal", horizontal: true, vertical: false},
    {label: "vertical", horizontal: false, vertical: true},
    {label: "both axes", horizontal: true, vertical: true},
  ])("applies $label changes to the Lightning bolt's two opposite POIs", mirror => {
    for(const index of [0, 1]) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
      element.setAttribute("aria-label", "Lightning bolt")
      element.setAttribute("d", graphicPresetPath("lightning-bolt", bounds, [13, 26]))
      const before = readGraphicPreset(element)!, handles = graphicPresetHandles(before)
      const point = handles[index].point
      adjustGraphicPreset(element, before, handles[index].name, {
        x: point.x + (index === 0 ? 1 : -1) * bounds.width * .07, y: point.y + bounds.height,
      }, mirror)
      const after = readGraphicPreset(element)!, next = graphicPresetHandles(after)
      after.values.forEach((value, i) => expect(value).toBeCloseTo(before.values[i] + (i === index || mirror.horizontal || mirror.vertical ? 7 : 0)))
      next.forEach((handle, i) => {
        const moved = i === index || mirror.horizontal || mirror.vertical
        expect(handle.point.x - handles[i].point.x).toBeCloseTo(moved ? (i === 0 ? 1 : -1) * bounds.width * .07 : 0)
        expect(handle.point.y).toBeCloseTo(handles[i].point.y)
      })
    }
  })

  it("clamps linked Lightning bolt corners to their adjustment limits", () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", "Lightning bolt")
    element.setAttribute("d", graphicPresetPath("lightning-bolt", bounds))
    adjustGraphicPreset(element, readGraphicPreset(element)!, "adjust-width", 100, {horizontal: true})
    readGraphicPreset(element)!.values.forEach((value, i) => expect(value).toBeCloseTo([35, 33][i]))
    adjustGraphicPreset(element, readGraphicPreset(element)!, "adjust-right-width", -100, {vertical: true})
    readGraphicPreset(element)!.values.forEach((value, i) => expect(value).toBeCloseTo([7, 5][i]))
  })

  it.each([
    {label: "independent", horizontal: false, vertical: false},
    {label: "horizontal", horizontal: true, vertical: false},
    {label: "vertical", horizontal: false, vertical: true},
    {label: "both axes", horizontal: true, vertical: true},
  ])("applies $label mirrored corner POI deltas while preserving other adjustments", mirror => {
    for(let index = 0; index < 4; index++) {
      const original = [10, 18, 26, 34]
      const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
      element.setAttribute("aria-label", "Rounded rectangle")
      element.setAttribute("d", graphicPresetPath("rounded-rectangle", bounds, original))
      const before = readGraphicPreset(element)!
      const adjustment = before.definition.adjustments[index]
      expect(adjustGraphicPreset(element, before, `adjust-${adjustment.name}`, original[index] + 7, mirror)).toBe(true)
      const after = readGraphicPreset(element)!
      const [vertical, horizontal] = adjustment.corner!.split("-")
      after.values.forEach((value, i) => {
        const [otherVertical, otherHorizontal] = after.definition.adjustments[i].corner!.split("-")
        const affected = (otherVertical === vertical || mirror.vertical) && (otherHorizontal === horizontal || mirror.horizontal)
        expect(value).toBeCloseTo(original[i] + (affected ? 7 : 0), 4)
      })
      const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
      expect(readGraphicPreset(reloaded)!.values).toEqual(after.values)
      expect(reloaded.getAttributeNames().some(name => name.startsWith("data-"))).toBe(false)
    }
  })

  it.each(["snip-diagonal", "snip-round", "round-diagonal"] as const)("mirrors diagonally opposite %s POIs only when both axes are held", type => {
    for(const mirror of [{horizontal: true}, {vertical: true}, {horizontal: true, vertical: true}]) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
      element.setAttribute("aria-label", graphicShapePresets[type].label)
      element.setAttribute("d", graphicPresetPath(type, bounds, [12, 24]))
      const before = readGraphicPreset(element)!
      adjustGraphicPreset(element, before, `adjust-${before.definition.adjustments[0].name}`, 18, mirror)
      const values = readGraphicPreset(element)!.values
      expect(values[0]).toBeCloseTo(18)
      expect(values[1]).toBeCloseTo(mirror.horizontal && mirror.vertical ? 30 : 24)
    }
  })

  it("clamps mirrored POIs and leaves unpaired POIs independent", () => {
    for(const type of ["rounded-rectangle", "round-one"] as const) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
      element.setAttribute("aria-label", graphicShapePresets[type].label)
      element.setAttribute("d", graphicPresetPath(type, bounds, type === "rounded-rectangle" ? [20, 35, 45, 10] : [20]))
      const before = readGraphicPreset(element)!
      adjustGraphicPreset(element, before, "adjust-radius", 80, {horizontal: true, vertical: true})
      expect(readGraphicPreset(element)!.values.map(value => Math.round(value))).toEqual(type === "rounded-rectangle" ? [50, 50, 50, 40] : [50])
    }
  })

  it("limits callouts to the six requested types and excludes freehand and omitted shapes", () => {
    expect(graphicPresetOptions.filter(option => option.category === "Callouts")).toHaveLength(6)
    expect(graphicPresetOptions.some(option => /smiley|bevel|freehand|scribble/i.test(option.type))).toBe(false)
    expect(new Set(graphicPresetOptions.map(option => option.type)).size).toBe(graphicPresetOptions.length)
  })

  it.each([
    "square-rectangle", "rounded-rectangle", "snip-one", "snip-same-side", "snip-diagonal", "snip-round",
    "round-one", "round-same-side", "round-diagonal", "parallelogram", "trapezoid", "octagon", "plaque", "cube",
    "process", "alternate-process", "data", "preparation",
  ] as const)("moves the %s corner POI across the full left half of its top edge", type => {
    const definition = graphicShapePresets[type]
    expect(definition.adjustments.length).toBeGreaterThan(0)
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", definition.label)
    element.setAttribute("d", graphicPresetPath(type, bounds))
    const name = `adjust-${definition.adjustments[0].name}`
    for(const [input, value] of [[bounds.x - bounds.width, 0], [bounds.x + bounds.width, 50]] as const) {
      expect(adjustGraphicPreset(element, readGraphicPreset(element)!, name, {x: input, y: bounds.y})).toBe(true)
      const state = readGraphicPreset(element)!
      expect(state.type).toBe(type)
      expect(state.values[0]).toBeCloseTo(value, 3)
      const handle = graphicPresetHandles(state)[0]
      expect(handle.point.x).toBeCloseTo(bounds.x + bounds.width * value / 100, 3)
      expect(handle.point.y).toBeCloseTo(bounds.y, 3)
      const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
      expect(readGraphicPreset(reloaded)!.values[0]).toBeCloseTo(value, 3)
    }
  })

  it.each([
    ["frame", "thickness", 0, 50], ["donut", "hole", 0, 50],
    ["corner", "thickness", 0, 100], ["moon", "phase", 0, 100],
    ["cloud", "inner", 0, 38], ["document", "wave", 0, 35],
    ["collate", "waist", 0, 100], ["sort", "division", 0, 100],
    ["extract", "apex", 0, 100], ["merge", "apex", 0, 100],
    ["left-arrow", "shaft", 0, 50], ["left-arrow", "head-start", 0, 100],
    ["left-right-arrow", "head-start", 0, 50],
  ] as const)("lets %s %s reach its geometric endpoints %s and %s and move away after reload", (type, name, min, max) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", graphicShapePresets[type].label)
    element.setAttribute("d", graphicPresetPath(type, bounds))
    for(const value of [min, max]) {
      const before = readGraphicPreset(element)!
      const index = before.definition.adjustments.findIndex(adjustment => adjustment.name === name)
      const values = [...before.values]; values[index] = value
      const point = before.definition.adjustments[index].point(values)
      expect(adjustGraphicPreset(element, before, `adjust-${name}`, {
        x: bounds.x + point.x / 100 * bounds.width, y: bounds.y + point.y / 100 * bounds.height,
      })).toBe(true)
      const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
      const after = readGraphicPreset(reloaded)!
      expect(after.type).toBe(type)
      expect(after.values[index]).toBeCloseTo(value, 3)
      expect(adjustGraphicPreset(reloaded, after, `adjust-${name}`, (min + max) / 2)).toBe(true)
      expect(readGraphicPreset(reloaded)!.values[index]).toBeCloseTo((min + max) / 2, 3)
    }
  })

  it.each(graphicPresetOptions)("recovers $label geometry and adjustments from serialized SVG", option => {
    const definition: GraphicShapePreset = graphicShapePresets[option.type]
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", option.label)
    element.setAttribute("d", graphicPresetPath(option.type, bounds))
    expect(element.getAttribute("d")).not.toMatch(/NaN|Infinity/)
    const parsed = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml")
    const reloaded = parsed.querySelector("path")!
    const state = readGraphicPreset(reloaded)
    expect(state?.type).toBe(option.type)
    for(const key of ["x", "y", "width", "height"] as const) expect(state!.bounds[key]).toBeCloseTo(bounds[key], 3)
    definition.adjustments.forEach((adjustment, index) => expect(state!.values[index]).toBeCloseTo(adjustment.default, 3))
    expect(graphicPresetHandles(state!).length).toBeGreaterThan(0)

    definition.adjustments.forEach((adjustment, index) => {
      for(const value of [adjustment.min, (adjustment.min + adjustment.max) / 2, adjustment.max]) {
        const before = readGraphicPreset(reloaded)!
        expect(adjustGraphicPreset(reloaded, before, `adjust-${adjustment.name}`, value)).toBe(true)
        const after = readGraphicPreset(reloaded)
        expect(after?.type, `${adjustment.name}=${value}`).toBe(option.type)
        if(definition.adjustmentLimits) {
          const [min, max] = definition.adjustmentLimits(before.values, index)
          const next = [...before.values]
          next[index] = Math.max(adjustment.min, min, Math.min(adjustment.max, max, value))
          const expected = graphicPresetPath(option.type, before.bounds, next).match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
          const actual = reloaded.getAttribute("d")!.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
          actual.forEach((coordinate, i) => expect(coordinate).toBeCloseTo(expected[i], 4))
          const roundTrip = graphicPresetPath(after!.type, after!.bounds, after!.values).match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
          roundTrip.forEach((coordinate, i) => expect(coordinate).toBeCloseTo(actual[i], 4))
          continue
        }
        if(option.type === "chord" && index === 0) {
          const expectedStart = ((Math.max(before.values[0] + before.values[1] - 360,
            Math.min(before.values[0] + before.values[1] - .5, value)) % 360) + 360) % 360
          const difference = Math.abs(after!.values[0] - expectedStart)
          expect(Math.min(difference, 360 - difference)).toBeCloseTo(0, 3)
        } else expect(after!.values[index]).toBeCloseTo(value, 3)
        before.values.forEach((previous, i) => {
          if(i !== index && option.type === "chord" && index === 0 && i === 1) {
            const previousEnd = (before.values[0] + before.values[1]) % 360
            const nextEnd = (after!.values[0] + after!.values[1]) % 360
            expect(Math.min(Math.abs(nextEnd - previousEnd), 360 - Math.abs(nextEnd - previousEnd))).toBeCloseTo(0, 3)
          } else if(i !== index) expect(after!.values[i]).toBeCloseTo(previous, 3)
        })
        for(const key of ["x", "y", "width", "height"] as const) expect(after!.bounds[key]).toBeCloseTo(bounds[key], 3)
      }
      const current = readGraphicPreset(reloaded)!
      if(definition.adjustmentLimits) {
        if(adjustment.hidden) return
        const [min,max] = definition.adjustmentLimits(current.values, index)
        const target = Math.max(adjustment.min,min,Math.min(adjustment.max,max,(adjustment.min+adjustment.max)/2))
        const nextValues = [...current.values]
        nextValues[index] = target
        const point = adjustment.point(nextValues)
        const input = {x:current.bounds.x+point.x/100*current.bounds.width,y:current.bounds.y+point.y/100*current.bounds.height}
        expect(adjustGraphicPreset(reloaded,current,`adjust-${adjustment.name}`,input)).toBe(true)
        const handle = graphicPresetHandles(readGraphicPreset(reloaded)!).find(handle => handle.index === index)!
        expect(handle.point.x).toBeCloseTo(input.x,3)
        expect(handle.point.y).toBeCloseTo(input.y,3)
        return
      }
      const target = (adjustment.min + adjustment.max) / 2
      const nextValues = [...current.values]
      nextValues[index] = target
      const handle = adjustment.point(nextValues)
      expect(adjustGraphicPreset(reloaded, current, `adjust-${adjustment.name}`, {
        x: bounds.x + handle.x / 100 * bounds.width,
        y: bounds.y + handle.y / 100 * bounds.height,
      })).toBe(true)
      expect(readGraphicPreset(reloaded)!.values[index]).toBeCloseTo(target, 3)
    })
    const before = readGraphicPreset(reloaded)!
    const moved = {x: 75, y: -40, width: 180, height: 320}
    writeGraphicPreset(reloaded, before, moved)
    const after = readGraphicPreset(reloaded)!
    expect(after.type).toBe(option.type)
    before.values.forEach((value, i) => expect(after.values[i]).toBeCloseTo(value, 3))
    for(const key of ["x", "y", "width", "height"] as const) expect(after.bounds[key]).toBeCloseTo(moved[key], 3)
  })

  it.each(["square-rectangle", "rounded-rectangle", "snip-same-side", "snip-diagonal", "snip-round", "round-same-side", "round-diagonal"] as const)("retains legacy shared %s corners and edits them independently", type => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", graphicShapePresets[type].label)
    element.setAttribute("d", graphicPresetPath(type, bounds, [18]))
    const state = readGraphicPreset(element)!
    expect(state.type).toBe(type)
    expect(state.values.every(value => Math.abs(value - 18) < 1e-4)).toBe(true)
    const last = state.definition.adjustments.at(-1)!
    expect(adjustGraphicPreset(element, state, `adjust-${last.name}`, 37)).toBe(true)
    const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
    const after = readGraphicPreset(reloaded)!
    after.values.forEach((value, index) => expect(value).toBeCloseTo(index === after.values.length - 1 ? 37 : 18, 3))
  })

  it.each(["cylinder", "cube", "folded-corner", "ribbon-up", "ribbon-down", "magnetic-disk", "direct-access-storage", "sequential-access-storage"] as const)("retains saved %s paths and upgrades their fill when edited", type => {
    const definition = graphicShapePresets[type]
    const values = definition.adjustments.map(adjustment => (adjustment.min + adjustment.max) / 2)
    let index = 0
    const legacy = definition.draw(values).replace(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g, value => {
      const horizontal = index++ % 2 === 0
      return String((horizontal ? bounds.x : bounds.y) + Number(value) / 100 * (horizontal ? bounds.width : bounds.height))
    })
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("d", legacy)
    element.setAttribute("aria-label", definition.label)
    element.setAttribute("fill-rule", "evenodd")
    const state = readGraphicPreset(element)!
    expect(state.type).toBe(type)
    expect(state.values[0]).toBeCloseTo(values[0], 3)
    writeGraphicPreset(element, state)
    expect(element.getAttribute("d")).not.toBe(legacy)
    expect(element.getAttribute("fill-rule")).toBe("nonzero")
    expect(readGraphicPreset(element)?.type).toBe(type)
    expect(readGraphicPreset(element)!.values[0]).toBeCloseTo(values[0], 3)
  })

  it("keeps the intentional cutouts in frames, donuts and prohibited signs", () => {
    for(const type of ["frame", "donut", "prohibited"] as const) expect(graphicPresetFillRule(type)).toBe("evenodd")
  })

  it.each([20, 35, 40])("keeps prohibited cutouts symmetric at inner radius %s", radius => {
    const path = graphicPresetPath("prohibited", bounds, [radius])
    const holes = path.split(/(?=M)/).slice(1).map(contour => Array.from(contour.matchAll(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g), match => Number(match[0])))
    expect(holes).toHaveLength(2)
    expect(holes[0]).toHaveLength(14)
    holes[0].forEach((value, i) => expect(value + holes[1][i]).toBeCloseTo(i % 2 ? 2 * bounds.y + bounds.height : 2 * bounds.x + bounds.width, 4))
  })

  it.each([20, 35, 40])("retains saved prohibited symbols at radius %s and corrects their asymmetry when edited", radius => {
    const outer = graphicShapePresets.prohibited.draw([0]).split(/(?=M)/)[0]
    const r = radius
    const legacy = `${outer} M ${50-r*.7} ${50-r*.7} C ${50-r*1.5} ${50+r*.2} ${50-r*.2} ${50+r*1.5} ${50+r*.7} ${50+r*.7} Z M ${50+r*.7} ${50+r*.7-12} C ${50+r*1.5} ${50-r*.2} ${50+r*.2} ${50-r*1.5} ${50-r*.7+12} ${50-r*.7} Z`
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("d", legacy)
    element.setAttribute("id", "authored-symbol")
    element.setAttribute("fill", "red")
    const state = readGraphicPreset(element)!
    expect(state.type).toBe("prohibited")
    expect(state.values[0]).toBeCloseTo(radius)
    writeGraphicPreset(element, state)
    expect(element.getAttribute("d")).not.toBe(legacy)
    expect(element.getAttribute("id")).toBe("authored-symbol")
    expect(element.getAttribute("fill")).toBe("red")
    expect(readGraphicPreset(element)?.values[0]).toBeCloseTo(radius)
  })

  it.each([5, 20, 50, 80, 100])("draws Moon phase %s with the POI midway along its inner arc", phase => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", "Moon")
    element.setAttribute("d", graphicPresetPath("moon", bounds, [phase]))
    const state = readGraphicPreset(element)!
    expect(state.type).toBe("moon")
    expect(state.values[0]).toBeCloseTo(phase)
    const handle = graphicPresetHandles(state)[0]
    expect(handle.name).toBe("adjust-phase")
    expect(handle.point.x).toBeCloseTo(bounds.x + bounds.width * phase / 100)
    expect(handle.point.y).toBeCloseTo(bounds.y + bounds.height / 2)
    const samples = cubicSamples(element.getAttribute("d")!)
    expect(samples.some(point => Math.hypot(point.x - handle.point.x, point.y - handle.point.y) < 1e-5)).toBe(true)
    const area = Math.abs(samples.reduce((sum, point, i) => {
      const next = samples[(i + 1) % samples.length]
      return sum + point.x * next.y - next.x * point.y
    }, 0)) / 2
    expect(area / (Math.PI * bounds.width * bounds.height / 4)).toBeCloseTo(phase / 100, 3)
  })

  it("makes the full Moon a circle and lets horizontal dragging sweep the complete phase range", () => {
    const frame = {x: 20, y: -15, width: 200, height: 200}
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", "Moon")
    element.setAttribute("d", graphicPresetPath("moon", frame))
    for(const [x, expected] of [[-100, 0], [120, 50], [400, 100]]) {
      const state = readGraphicPreset(element)!
      adjustGraphicPreset(element, state, "adjust-phase", {x, y: -1000})
      expect(readGraphicPreset(element)!.values[0]).toBeCloseTo(expected)
    }
    for(const point of cubicSamples(element.getAttribute("d")!)) expect(Math.hypot(point.x - 120, point.y - 85)).toBeCloseTo(100, 1)
    const full = readGraphicPreset(element)!
    adjustGraphicPreset(element, full, "adjust-phase", {x: 220, y: 1000})
    expect(readGraphicPreset(element)!.values[0]).toBeCloseTo(100)
  })

  it.each([5, 20, 40])("retains a saved Moon crescent %s and allows changing it to a full Moon", crescent => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const path = `M ${75-crescent/2} 8 C 40 18 30 65 65 92 C 45 92 15 78 10 52 C 5 25 35 3 ${75-crescent/2} 8 Z`
    element.setAttribute("aria-label", "Moon")
    element.setAttribute("id", "authored-moon")
    element.setAttribute("d", path)
    const state = readGraphicPreset(element)!
    expect(state.type).toBe("moon")
    expect(state.values[0]).toBeCloseTo(crescent)
    expect(element.getAttribute("d")).toBe(path)
    adjustGraphicPreset(element, state, "adjust-phase", 100)
    const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
    expect(readGraphicPreset(reloaded)!.values[0]).toBeCloseTo(100)
    expect(reloaded.getAttribute("id")).toBe("authored-moon")
  })

  it.each([0, 35, 50, 65, 100])("moves the Collate waist vertically and clamps height %s while keeping its outer corners fixed", height => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", "Collate")
    element.setAttribute("d", graphicPresetPath("collate", bounds))
    const before = readGraphicPreset(element)!
    expect(before.definition.adjustments[0].axis).toBe("y")
    expect(adjustGraphicPreset(element, before, "adjust-waist", {
      x: bounds.x + bounds.width * 2, y: bounds.y + bounds.height * height / 100,
    })).toBe(true)
    const state = readGraphicPreset(element)!, value = Math.max(0, Math.min(100, height))
    expect(state.values[0]).toBeCloseTo(value)
    const handle = graphicPresetHandles(state)[0].point
    expect(handle.x).toBeCloseTo(bounds.x + bounds.width / 2)
    expect(handle.y).toBeCloseTo(bounds.y + bounds.height * value / 100)
    const numbers = element.getAttribute("d")!.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
    const points = Array.from({length: numbers.length / 2}, (_, i) => ({x: numbers[2 * i], y: numbers[2 * i + 1]}))
    expect(points.filter(point => Math.abs(point.x - handle.x) < 1e-5 && Math.abs(point.y - handle.y) < 1e-5)).toHaveLength(2)
    expect(points.filter((_, i) => i !== 2 && i !== 5)).toEqual([
      {x: bounds.x, y: bounds.y}, {x: bounds.x + bounds.width, y: bounds.y},
      {x: bounds.x + bounds.width, y: bounds.y + bounds.height}, {x: bounds.x, y: bounds.y + bounds.height},
    ])
  })

  it.each([35, 50, 65])("keeps a saved Collate with horizontal waist %s editable with the vertical control", waist => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const path = `M 0 0 L 100 0 L 0 100 L 100 100 L ${waist} 50 Z`
    element.setAttribute("aria-label", "Collate")
    element.setAttribute("d", path)
    const before = readGraphicPreset(element)!
    expect(before.type).toBe("collate")
    expect(before.values[0]).toBeCloseTo(waist)
    expect(element.getAttribute("d")).toBe(path)
    adjustGraphicPreset(element, before, "adjust-waist", {x: 10, y: 60})
    expect(readGraphicPreset(element)!.values[0]).toBeCloseTo(60)
    expect(element.getAttribute("d")!.match(/L 50 60/g)).toHaveLength(2)
  })

  it.each([5, 25, 40])("draws two complete waves on each edge at amplitude %s", amplitude => {
    const path = graphicPresetPath("double-wave", {x: 0, y: 0, width: 100, height: 100}, [amplitude])
    const curves = Array.from(path.matchAll(/Q ([^QMLZ]+)/g), match => match[1].trim().split(/\s+/).map(Number))
    const top = curves.slice(0, 4), bottom = curves.slice(4).reverse()
    expect(curves).toHaveLength(8)
    // Each quadratic starts and ends on its baseline; its midpoint is halfway
    // to its control height. Count complete crests and troughs, not controls.
    const heights = top.map(([, controlY, , y]) => (20 + 2 * controlY + y) / 4)
    expect(heights.filter(y => y < 20)).toHaveLength(2)
    expect(heights.filter(y => y > 20)).toHaveLength(2)
    expect(top.map(([, , x]) => x)).toEqual([25, 50, 75, 100])
    top.forEach(([, , , y], i) => {
      expect(y).toBe(20)
      expect(Math.abs(heights[i] - 20)).toBeCloseTo(amplitude / 2)
      expect((80 + 2 * bottom[i][1] + bottom[i][3]) / 4 - heights[i]).toBeCloseTo(60)
    })
  })

  it.each([5, 25, 40])("retains saved Double wave paths at amplitude %s and updates their contour when edited", amplitude => {
    const legacy = `M 0 20 Q 25 ${20-amplitude} 50 20 Q 75 ${20+amplitude} 100 20 L 100 80 Q 75 ${80+amplitude} 50 80 Q 25 ${80-amplitude} 0 80 Z`
    let index = 0
    const path = legacy.replace(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g, value => {
      const horizontal = index++ % 2 === 0
      return String((horizontal ? bounds.x : bounds.y) + Number(value) / 100 * (horizontal ? bounds.width : bounds.height))
    })
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("d", path)
    element.setAttribute("aria-label", "Double wave")
    element.setAttribute("id", "authored-wave")
    element.setAttribute("fill", "red")
    const state = readGraphicPreset(element)!
    expect(state.type).toBe("double-wave")
    expect(state.values[0]).toBeCloseTo(amplitude)
    for(const key of ["x", "y", "width", "height"] as const) expect(state.bounds[key]).toBeCloseTo(bounds[key], 4)
    expect(element.getAttribute("d")).toBe(path)
    adjustGraphicPreset(element, state, "adjust-amplitude", 30)
    expect(element.getAttribute("d")!.match(/Q/g)).toHaveLength(8)
    expect(readGraphicPreset(element)!.values[0]).toBeCloseTo(30)
    expect(element.getAttribute("id")).toBe("authored-wave")
    expect(element.getAttribute("fill")).toBe("red")
  })

  it("does not reinterpret an unrelated or externally changed path using its accessible name", () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const option = graphicPresetOptions[0]
    element.setAttribute("aria-label", option.label)
    element.setAttribute("d", graphicPresetPath(option.type, bounds))
    expect(readGraphicPreset(element)).not.toBeNull()
    element.setAttribute("d", "M 0 0 C 3 17 93 22 19 37 L 37 29 Z")
    expect(readGraphicPreset(element)).toBeNull()
    expect(element.getAttribute("d")).toBe("M 0 0 C 3 17 93 22 19 37 L 37 29 Z")
  })

  const ellipsePoint = (angle: number, box = bounds) => {
    const radians = angle * Math.PI / 180
    return {x: box.x + box.width / 2 - Math.sin(radians) * box.width / 2,
      y: box.y + box.height / 2 - Math.cos(radians) * box.height / 2}
  }

  it.each([0, 90, 359])("writes and reloads a Chord starting at %s degrees", start => {
    for(const sweep of [.5, 45, 180, 240, 359.5, 360]) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
      element.setAttribute("aria-label", "Chord")
      element.setAttribute("d", graphicPresetPath("chord", bounds, [start, sweep]))
      const state = readGraphicPreset(element)!
      expect(state.type).toBe("chord")
      expect(state.values[0]).toBeCloseTo(start, 3)
      expect(state.values[1]).toBeCloseTo(sweep, 3)
      expect(state.definition.adjustments.map(adjustment => [adjustment.name, adjustment.label, adjustment.axis, adjustment.min, adjustment.max])).toEqual([
        ["start-angle", "Start endpoint", "angle", 0, 360], ["sweep", "End endpoint", "angle", .5, 360],
      ])
      for(const key of ["x", "y", "width", "height"] as const) expect(state.bounds[key]).toBeCloseTo(bounds[key], 4)
      const handles = graphicPresetHandles(state)
      expect(handles.map(handle => [handle.name, handle.label])).toEqual([
        ["adjust-start-angle", "Start endpoint"], ["adjust-sweep", "End endpoint"],
      ])
      handles.forEach((handle, index) => {
        const point = ellipsePoint(start + (index ? sweep : 0))
        expect(handle.point.x).toBeCloseTo(point.x, 4)
        expect(handle.point.y).toBeCloseTo(point.y, 4)
        expect(Math.hypot((handle.point.x - bounds.x - bounds.width / 2) / (bounds.width / 2),
          (handle.point.y - bounds.y - bounds.height / 2) / (bounds.height / 2))).toBeCloseTo(1, 5)
      })
      const path = element.getAttribute("d")!
      expect(path.match(/A/g)).toHaveLength(2)
      expect(path.match(/C/g)).toBeNull()
      expect(path.match(/L/g)).toBeNull()
      expect(path.match(/Z$/)).not.toBeNull()
      const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
      const after = readGraphicPreset(reloaded)!
      expect(after.type).toBe("chord")
      expect(after.values[0]).toBeCloseTo(start, 3)
      expect(after.values[1]).toBeCloseTo(sweep, 3)
      for(const key of ["x", "y", "width", "height"] as const) expect(after.bounds[key]).toBeCloseTo(bounds[key], 4)
    }
  })

  it("moves either Chord endpoint while keeping the other endpoint fixed", () => {
    for(const action of ["adjust-start-angle", "adjust-sweep"] as const) {
      const start = 32, sweep = 117, element = document.createElementNS("http://www.w3.org/2000/svg", "path")
      element.setAttribute("aria-label", "Chord")
      element.setAttribute("d", graphicPresetPath("chord", bounds, [start, sweep]))
      const fixedAngle = action === "adjust-start-angle" ? start + sweep : start
      const targetAngle = action === "adjust-start-angle" ? 315 : 221
      expect(adjustGraphicPreset(element, readGraphicPreset(element)!, action, ellipsePoint(targetAngle))).toBe(true)
      const state = readGraphicPreset(element)!
      expect(state.type).toBe("chord")
      const fixedIndex = action === "adjust-start-angle" ? 1 : 0
      const movingIndex = 1 - fixedIndex
      const handles = graphicPresetHandles(state)
      expect(handles[fixedIndex].point.x).toBeCloseTo(ellipsePoint(fixedAngle).x, 4)
      expect(handles[fixedIndex].point.y).toBeCloseTo(ellipsePoint(fixedAngle).y, 4)
      expect(handles[movingIndex].point.x).toBeCloseTo(ellipsePoint(targetAngle).x, 4)
      expect(handles[movingIndex].point.y).toBeCloseTo(ellipsePoint(targetAngle).y, 4)
      const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
      expect(readGraphicPreset(reloaded)!.values).toEqual(expect.arrayContaining([expect.any(Number), expect.any(Number)]))
    }
  })

  it("rejects unrelated Chord arcs and preserves then upgrades the legacy cubic recipe", () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", "Chord")
    const path = graphicPresetPath("chord", bounds, [38, 146])
    element.setAttribute("d", path.replace(" A ", " L "))
    expect(readGraphicPreset(element)).toBeNull()
    element.setAttribute("d", path.replace(/Z$/, "L 10 20 Z"))
    expect(readGraphicPreset(element)).toBeNull()
    const malformed = [
      path.replace(/A ([^ ]+) ([^ ]+) 0 /, "A 51 $2 0 "),
      path.replace(" 0 0 0 ", " 0 2 0 "),
      (() => {
        let arcIndex = 0
        return path.replace(/A ([^ ]+) ([^ ]+) 0 ([^ ]+) 0 ([^ ]+) ([^ ]+)/g, (arc, rx, ry, large, x, y) => {
          arcIndex++
          return arcIndex === 2 ? `A ${rx} ${ry} 0 ${large} 0 ${Number(x) + 3} ${y}` : arc
        })
      })(),
    ]
    for(const candidate of malformed) {
      element.setAttribute("d", candidate)
      expect(readGraphicPreset(element)).toBeNull()
    }

    const legacy = "M 50 0 C 0 0 0 100 50 100 C 75 100 90 88 100 75 Z"
    element.setAttribute("d", legacy)
    const state = readGraphicPreset(element)!
    expect(state.type).toBe("chord")
    expect(element.getAttribute("d")).toBe(legacy)
    expect(adjustGraphicPreset(element, state, "adjust-sweep", ellipsePoint(170, {x: 0, y: 0, width: 100, height: 100}))).toBe(true)
    expect(element.getAttribute("d")).toMatch(/^M .* A .* A .* Z$/)
    expect(element.getAttribute("d")).not.toContain("C")
    expect(readGraphicPreset(element)!.type).toBe("chord")
  })

  it.each([
    ["curved-left-arrow", "curved-right-arrow", "x"],
    ["curved-up-arrow", "curved-down-arrow", "y"],
  ] as const)("mirrors %s and %s paths and handles at defaults and adjusted values", (leftType, rightType, axis) => {
    for(const values of [graphicShapePresets[leftType].adjustments.map(adjustment => adjustment.default), [4, 54, 18], [12, 81, 34]]) {
      expectMirroredCurvedArrows(leftType, rightType, axis, values)
    }
  })

  it.each([
    ["curved-right-arrow", "curved-left-arrow"],
    ["curved-down-arrow", "curved-up-arrow"],
  ] as const)("keeps legacy %s geometry recognizable until it is edited", (legacyType, mirroredType) => {
    const legacy = legacyCurvedArrowPresets[legacyType]!
    const values = [4, 54, 18]
    let index = 0
    const oldPath = legacy.draw(values).replace(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g, value => {
      const horizontal = index++ % 2 === 0
      return String((horizontal ? bounds.x : bounds.y) + Number(value) / 100 * (horizontal ? bounds.width : bounds.height))
    })
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", graphicShapePresets[legacyType].label)
    element.setAttribute("d", oldPath)
    const before = readGraphicPreset(element)!
    expect(before.type).toBe(legacyType)
    before.values.forEach((value, i) => expect(value).toBeCloseTo(values[i], 3))
    expect(element.getAttribute("d")).toBe(oldPath)
    expect(adjustGraphicPreset(element, before, `adjust-${before.definition.adjustments[0].name}`, 11)).toBe(true)
    const after = readGraphicPreset(element)!
    expect(after.type).toBe(legacyType)
    expect(after.type).not.toBe(mirroredType)
    expect(after.values[0]).toBeCloseTo(11, 3)
  })


})
