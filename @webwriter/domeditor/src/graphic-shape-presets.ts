/** Native SVG recipes in a nominal 0..100 frame. Most coordinates are affine
 * in their adjustments. Circular controls use native arcs, and linked callouts
 * retain an untouched body contour to recover their frame without metadata.
 * Handles lie on the authored contour. Curve handles sample
 * a fixed Bezier parameter so their positions stay affine and invertible. */
export type GraphicShapeAdjustment = {
  name: string
  label: string
  default: number
  min: number
  max: number
  axis: "x" | "y" | "angle"
  corner?: "top-left" | "top-right" | "bottom-right" | "bottom-left"
  /** An explicit counterpart linked by either mirror modifier. */
  opposite?: string
  /** The other coordinate edited by this two-dimensional POI. */
  pairedWith?: string
  /** Retained geometry parameter without a visible POI. */
  hidden?: boolean
  point: (values: number[]) => {x: number, y: number}
}

export type GraphicShapePreset = {
  label: string
  category: string
  open?: boolean
  adjustments: GraphicShapeAdjustment[]
  draw: (values: number[]) => string
  /** Recover this dimension at its default by absorbing its scale in the frame. */
  normalizedAdjustment?: string
  adjustmentLimits?: (values: number[], index: number) => [number, number]
  contentSize?: {maxWidth: number, padding: number}
}

const a = (name: string, label: string, value: number, min: number, max: number, axis: "x" | "y" = "x"): GraphicShapeAdjustment => ({name, label, default: value, min, max, axis, point: values => axis === "x" ? {x: values[0] ?? value, y: 0} : {x: 0, y: values[0] ?? value}})
const v = (values: number[], i: number, fallback: number) => values[i] ?? fallback
const polygon = (points: number[][]) => `M ${points.map(p => `${p[0]} ${p[1]}`).join(" L ")} Z`
const ellipse = (cx = 50, cy = 50, rx = 50, ry = 50) => `M ${cx-rx} ${cy} C ${cx-rx} ${cy-ry*.5523} ${cx-rx*.5523} ${cy-ry} ${cx} ${cy-ry} C ${cx+rx*.5523} ${cy-ry} ${cx+rx} ${cy-ry*.5523} ${cx+rx} ${cy} C ${cx+rx} ${cy+ry*.5523} ${cx+rx*.5523} ${cy+ry} ${cx} ${cy+ry} C ${cx-rx*.5523} ${cy+ry} ${cx-rx} ${cy+ry*.5523} ${cx-rx} ${cy} Z`
const piePoint = (sweep: number) => {
  const angle = (-90 - sweep) * Math.PI / 180
  return {x: 50 + 50 * Math.cos(angle), y: 50 + 50 * Math.sin(angle)}
}
const rect = (r = 0, inset = 0) => { const q = r; return `M ${inset+q} ${inset} L ${100-inset-q} ${inset} Q ${100-inset} ${inset} ${100-inset} ${inset+q} L ${100-inset} ${100-inset-q} Q ${100-inset} ${100-inset} ${100-inset-q} ${100-inset} L ${inset+q} ${100-inset} Q ${inset} ${100-inset} ${inset} ${100-inset-q} L ${inset} ${inset+q} Q ${inset} ${inset} ${inset+q} ${inset} Z` }
const base = (label: string, category: string, draw: (values: number[]) => string, adjustments: GraphicShapeAdjustment[]) => ({label, category, adjustments, draw})
const cornerControl = (name: string, corner: "top-left" | "top-right" | "bottom-right" | "bottom-left", index: number, value: number): GraphicShapeAdjustment => ({
  name, label: `${corner.replace("-", " ")} corner`, default: value, min: 0, max: 50, axis: "x", corner,
  point: values => ({x: corner.endsWith("right") ? 100 - values[index] : values[index], y: corner.startsWith("bottom") ? 100 : 0}),
})
const roundedCorners = ([tl = 12, tr = tl, br = tl, bl = tl]: number[]) =>
  `M ${tl} 0 L ${100-tr} 0 Q 100 0 100 ${tr} L 100 ${100-br} Q 100 100 ${100-br} 100 L ${bl} 100 Q 0 100 0 ${100-bl} L 0 ${tl} Q 0 0 ${tl} 0 Z`
const roundedCornerControls = (value: number) => [
  cornerControl("radius", "top-left", 0, value), cornerControl("radius-top-right", "top-right", 1, value),
  cornerControl("radius-bottom-right", "bottom-right", 2, value), cornerControl("radius-bottom-left", "bottom-left", 3, value),
]
const star = (n: number, inner = 38) => (values: number[]) => { const ri = v(values, 0, inner); const p: number[][] = []; for (let i=0; i<n*2; i++) { const r = i%2 ? ri : 48; const t = -Math.PI/2 + i*Math.PI/n; p.push([50+r*Math.cos(t), 50+r*Math.sin(t)]) } return polygon(p) }


const poi = (name: string, label: string, value: number, min: number, max: number, point: (value: number) => {x: number, y: number}, axis: "x" | "y" = "x"): GraphicShapeAdjustment => ({
  name, label, default: value, min, max, axis, point: values => point(values[0]),
})

const turn = (path: string, quarters: number) => {
  const numbers = /[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g
  const values = Array.from(path.matchAll(numbers), m => Number(m[0]))
  for(let i = 0; i < values.length; i += 2) {
    for(let j = 0; j < quarters; j++) [values[i], values[i + 1]] = [100 - values[i + 1], values[i]]
  }
  let i = 0
  return path.replace(numbers, () => String(values[i++]))
}

const prohibitedPath = (radius: number) => {
  // Two equal circular segments leave a centered diagonal bar between them.
  const q = Math.SQRT1_2, k = 4 / 3 * Math.tan((Math.PI / 4 + Math.atan2(.6, .8)) / 4)
  const point = (x: number, y: number) => `${50 + radius * x} ${50 + radius * y}`
  const hole = `M ${point(-.8, -.6)} C ${point(-.8 - .6*k, -.6 + .8*k)} ${point(-q*(1+k), q*(1-k))} ${point(-q, q)} C ${point(-q*(1-k), q*(1+k))} ${point(.6 - .8*k, .8 + .6*k)} ${point(.6, .8)} Z`
  return `${ellipse()} ${hole} ${turn(hole, 2)}`
}

const blockArrow = (label: string, direction: number) => base(label, "Block arrows", ([d]) => turn(polygon([
  [0,34],[100-d,34],[100-d,0],[100,50],[100-d,100],[100-d,66],[0,66],
]), direction), [poi("head", "Head depth", 30, 10, 65,
  p => direction === 1 ? {x:100,y:100-p} : direction === 2 ? {x:p,y:100} : {x:0,y:p}, direction % 2 ? "y" : "x")])

const quadArrow = (t: number, callout = false) => {
  const quarter = callout
    ? [[50,0],[70,18],[50+t,18],[50+t,30],[70,30],[70,50-t],[82,50-t],[82,30]]
    : [[50,0],[70,20],[50+t,20],[50+t,50-t],[80,50-t],[80,30]]
  const points: number[][] = []
  for(let q = 0; q < 4; q++) for(const source of quarter) {
    let [x,y] = source
    for(let i = 0; i < q; i++) [x,y] = [100-y,x]
    points.push([x,y])
  }
  return polygon(points)
}

const curvedArrow = (label: string, direction: number) => base(label, "Block arrows", ([t]) => turn(
  `M 90 0 C -20 0 -20 85 70 85 L 70 100 L 100 75 L 70 50 L 70 ${85-t} C ${t} ${85-t} ${t} ${t} 90 ${t} Z`, direction,
), [poi("thickness", "Band thickness", 14, 5, 25, p => direction === 0 ? {x:90,y:p} : direction === 1 ? {x:100-p,y:90} : direction === 2 ? {x:10,y:100-p} : {x:p,y:10}, direction % 2 ? "x" : "y")])

const arrowCallout = (label: string, direction: number) => base(label, "Block arrows", ([d]) => turn(polygon([
  [0,0],[d,0],[d,40],[80,40],[80,25],[100,50],[80,75],[80,60],[d,60],[d,100],[0,100],
]), direction), [poi("box", "Box width", 65, 30, 75, p => direction === 0 ? {x:p,y:0} : direction === 1 ? {x:100,y:p} : direction === 2 ? {x:100-p,y:100} : {x:0,y:100-p}, direction % 2 ? "y" : "x")])

const crossPath = (t: number) => polygon([[50-t/2,0],[50+t/2,0],[50+t/2,50-t/2],[100,50-t/2],[100,50+t/2],[50+t/2,50+t/2],[50+t/2,100],[50-t/2,100],[50-t/2,50+t/2],[0,50+t/2],[0,50-t/2],[50-t/2,50-t/2]])
const roundFlow = (r: number) => `M 0 50 C 0 ${50-r} ${50-r} 0 50 0 C ${50+r} 0 100 ${50-r} 100 50 C 100 ${50+r} ${50+r} 100 50 100 C ${50-r} 100 0 ${50+r} 0 50 Z`
const cylinderPath = (d: number) => `M 0 ${d} C 0 ${-d/3} 100 ${-d/3} 100 ${d} L 100 ${100-d} C 100 ${100+d/3} 0 ${100+d/3} 0 ${100-d} Z M 0 ${d} C 0 ${d*7/3} 100 ${d*7/3} 100 ${d}`

const irregularStar = (n: number, inner: number, variant: number) => polygon(Array.from({length:n*2}, (_,i) => {
  const theta = -Math.PI/2 + i*Math.PI/n
  const radius = i%2 ? inner : 40 + ((i*7 + variant*3)%11)
  return [50+radius*Math.cos(theta),50+radius*Math.sin(theta)]
}))
const starPreset = (n: number, inner: number) => base(`${n}-point star`, "Stars and banners", star(n), [poi("inner", "Inner radius", inner, 0, 48, p => ({x:50+p*Math.sin(Math.PI/n),y:50-p*Math.cos(Math.PI/n)}))])
const ribbonPreset = (label: string, down: boolean, curved: boolean) => base(label, "Stars and banners", ([d]) => {
  const path = curved
    ? `M 20 15 Q 50 ${15+d} 80 15 L 80 30 L 100 25 L 90 50 L 100 75 L 80 70 L 80 80 Q 50 ${80+d} 20 80 L 20 70 L 0 75 L 10 50 L 0 25 L 20 30 Z M 20 30 L 20 70 M 80 30 L 80 70 M 20 70 L 35 80 M 80 70 L 65 80`
    : `M 20 ${20-d/2} L 80 ${20-d/2} L 80 30 L 100 30 L 90 55 L 100 80 L 80 80 L 65 65 L 35 65 L 20 80 L 0 80 L 10 55 L 0 30 L 20 30 Z M 20 30 L 20 65 L 80 65 L 80 30 M 20 65 L 35 80 M 80 65 L 65 80`
  return down ? turn(path,2) : path
}, [poi("fold", curved ? "Ribbon curve" : "Fold depth", 15, 0, curved ? 28 : 40, p => ({x:50,y:down ? curved ? 85-p/2 : 80+p/2 : curved ? 15+p/2 : 20-p/2}), "y")])
const scrollPath = (d: number) => `M 20 ${d} Q 20 0 30 0 L 95 0 Q 100 ${d} 90 ${d} L 80 ${d} L 80 ${100-d} Q 80 100 70 100 L 5 100 Q 0 ${100-d} 10 ${100-d} L 20 ${100-d} Z M 30 0 Q 40 ${d} 30 ${d} L 20 ${d} M 70 100 Q 60 ${100-d} 70 ${100-d} L 80 ${100-d}`
const cloudBubble = () => "M 12 60 C -5 60 -3 38 10 35 C -2 18 12 10 25 15 C 28 -3 46 -3 50 10 C 63 -3 78 0 78 15 C 96 5 105 20 92 33 C 110 40 100 58 88 58 C 88 78 68 80 60 67 C 48 83 32 78 30 65 C 17 78 7 73 12 60 Z"
const cloudCoordinates = cloudBubble().match(/-?\d+/g)!.map(Number)
const cloudPoints = Array.from({length:cloudCoordinates.length/2}, (_,i) => ({x:cloudCoordinates[i*2],y:cloudCoordinates[i*2+1]}))
const cloudPath = (inner:number) => {
  const offset = (point:{x:number,y:number}) => ({x:(point.x-50)*(inner/30-1),y:(point.y-40)*(inner/30-1)})
  const first=cloudPoints[0],delta=offset(first)
  let path=`M ${first.x+delta.x} ${first.y+delta.y}`
  for(let i=1;i<cloudPoints.length;i+=3) {
    const [start,a,b,end]=cloudPoints.slice(i-1,i+3),from=offset(start),to=offset(end)
    // Move every valley radially while retaining each puff's midpoint and
    // tangent. The outer cloud stays in place as the indentations deepen.
    path+=` C ${a.x+(-2*from.x+to.x)/3} ${a.y+(-2*from.y+to.y)/3} ${b.x+(from.x-2*to.x)/3} ${b.y+(from.y-2*to.y)/3} ${end.x+to.x} ${end.y+to.y}`
  }
  return `${path} Z`
}
export const legacyCloudPreset = {
  definition:base("Cloud","Basic shapes",([p])=>cloudBubble().replace("46 -3",`46 ${p}`),[
    poi("puff","Cloud lobe",-3,-10,10,p=>({x:37.125,y:2+.375*p}),"y"),
  ]),
  upgrade:(_values:number[])=>[30],
}
export const legacyChordPreset = {
  definition: base("Chord", "Basic shapes", ([p]) => `M ${p} 0 C 0 0 0 100 50 100 C 75 100 90 88 100 75 Z`,
    [poi("chord", "Chord endpoint", 50, 20, 80, p => ({x:p,y:0}))]),
  upgrade: ([p]: number[]) => {
    const start = (Math.atan2(50 - p, 50) * 180 / Math.PI + 360) % 360
    return [start, (Math.atan2(-1, -.5) * 180 / Math.PI - start + 720) % 360]
  },
}
const legacyCalloutPreset = (label: string, form: "rectangle" | "rounded" | "oval") => base(label, "Callouts", ([p]) => {
  if(form === "oval") return `M 0 38 C 0 -12 100 -12 100 38 C 100 60 75 75 48 75 L ${p} 100 L 28 69 C 10 64 0 55 0 38 Z`
  if(form === "rounded") return `M 12 0 L 88 0 Q 100 0 100 12 L 100 63 Q 100 75 88 75 L 45 75 L ${p} 100 L 25 75 L 12 75 Q 0 75 0 63 L 0 12 Q 0 0 12 0 Z`
  return `M 0 0 L 100 0 L 100 75 L 45 75 L ${p} 100 L 25 75 L 0 75 Z`
}, [poi("tail", "Tail tip", 18, 0, 100, p => ({x:p,y:100}))])


const calloutPoint = (name: string, label: string, x: number, y: number, index: number, offset: [number, number] = [0,0]): GraphicShapeAdjustment[] => [
  {name: `${name}-x`, label: `${label} X`, default: x, min: -150, max: 250, axis: "x", pairedWith: `${name}-y`,
    point: values => ({x: values[index]+offset[0], y: values[index + 1]+offset[1]})},
  {name: `${name}-y`, label: `${label} Y`, default: y, min: -150, max: 250, axis: "y",
    point: values => ({x: values[index]+offset[0], y: values[index + 1]+offset[1]})},
]
const calloutControls = (start: [number, number], end: [number, number], roundness: number, oval = false, startOffset: [number, number] = [0,0]): GraphicShapeAdjustment[] => [
  ...calloutPoint("start", "Connector start", ...start, 0, startOffset),
  ...calloutPoint("end", "Connector end", ...end, 2),
  {name: "roundness", label: oval ? "Bubble roundness" : "Corner roundness", default: roundness, min: 0, max: oval ? 50 : 35,
    axis: "x", point: values => oval ? {x:25-.375*values[4],y:18.75-.28125*values[4]} : {x:values[4],y:0}},
]
const independentCalloutPreset = (label: string, form: "rectangle" | "rounded" | "oval") => base(label, "Callouts", ([sx, sy, ex, ey, r]) => {
  if(form === "oval") return `M 0 37.5 C 0 ${37.5-r*.75} ${50-r} 0 50 0 C ${50+r} 0 100 ${37.5-r*.75} 100 37.5 C 100 ${37.5+r*.75} ${50+r} 75 ${sx+10} ${sy+3} L ${ex} ${ey} L ${sx-10} ${sy-3} C ${50-r} 75 0 ${37.5+r*.75} 0 37.5 Z`
  return `M ${r} 0 L ${100-r} 0 Q 100 0 100 ${r} L 100 ${75-r} Q 100 75 ${100-r} 75 L ${sx+10} ${sy} L ${ex} ${ey} L ${sx-10} ${sy} L ${r} 75 Q 0 75 0 ${75-r} L 0 ${r} Q 0 0 ${r} 0 Z`
}, calloutControls(form === "oval" ? [38, 72] : [35, 75], [18, 100], form === "oval" ? 27.6 : form === "rounded" ? 12 : 0, form === "oval", [10,form === "oval" ? 3 : 0]))
export const speechBubbleTypes = ["rectangular-callout", "rounded-rectangular-callout", "oval-callout"] as const
export const connectedCalloutTypes = [...speechBubbleTypes,"cloud-callout","line-callout-1","line-callout-2"] as const
export const isConnectedCalloutType = (type:string): type is typeof connectedCalloutTypes[number] => (connectedCalloutTypes as readonly string[]).includes(type)
export const isSpeechBubbleType = (type: string): type is typeof speechBubbleTypes[number] => (speechBubbleTypes as readonly string[]).includes(type)
type BubblePoint = {x:number,y:number}
const bubblePoint = (x:number,y:number): BubblePoint => ({x,y})
const bubbleTurn = ({x,y}: BubblePoint, quarters: number): BubblePoint => {
  for(let i=0;i<quarters;i++) [x,y]=[100-y/75*100,x/100*75]
  return {x,y}
}
const bubbleDirection = (x:number,y:number) => (Math.round((Math.atan2((y-37.5)/37.5,(x-50)/50)-Math.PI/2)/(Math.PI/2)+1e-6)+4)%4
const bubbleSegments = (oval:boolean,r:number): BubblePoint[][] => oval ? [
  [bubblePoint(0,37.5),bubblePoint(0,37.5-r*.75),bubblePoint(50-r,0),bubblePoint(50,0)],
  [bubblePoint(50,0),bubblePoint(50+r,0),bubblePoint(100,37.5-r*.75),bubblePoint(100,37.5)],
  [bubblePoint(100,37.5),bubblePoint(100,37.5+r*.75),bubblePoint(50+r,75),bubblePoint(50,75)],
  [bubblePoint(50,75),bubblePoint(50-r,75),bubblePoint(0,37.5+r*.75),bubblePoint(0,37.5)],
] : [
  [bubblePoint(0,37.5),bubblePoint(0,r*.75)],
  [bubblePoint(0,r*.75),bubblePoint(0,0),bubblePoint(r,0)],
  [bubblePoint(r,0),bubblePoint(100-r,0)],
  [bubblePoint(100-r,0),bubblePoint(100,0),bubblePoint(100,r*.75)],
  [bubblePoint(100,r*.75),bubblePoint(100,37.5)],
  [bubblePoint(100,37.5),bubblePoint(100,75-r*.75)],
  [bubblePoint(100,75-r*.75),bubblePoint(100,75),bubblePoint(100-r,75)],
  [bubblePoint(100-r,75),bubblePoint(r,75)],
  [bubblePoint(r,75),bubblePoint(0,75),bubblePoint(0,75-r*.75)],
  [bubblePoint(0,75-r*.75),bubblePoint(0,37.5)],
]
const splitBubbleCurve = (points:BubblePoint[],t:number): [BubblePoint[],BubblePoint[]] => {
  const left=[points[0]],right=[points.at(-1)!]
  for(let row=points;row.length>1;) {
    row=row.slice(1).map((point,i)=>bubblePoint(row[i].x+(point.x-row[i].x)*t,row[i].y+(point.y-row[i].y)*t))
    left.push(row[0]);right.unshift(row.at(-1)!)
  }
  return [left,right]
}
const bubbleCommand = (points:BubblePoint[],direction:number) => `${["","L","Q","C"][points.length-1]} ${points.slice(1).map(point=>{const p=bubbleTurn(point,direction);return `${p.x} ${p.y}`}).join(" ")}`

/** The untouched half of the visible body also identifies its frame on reload. */
export function speechBubblePrefix(type:string,r:number,direction:number) {
  if(type === "cloud-callout") return cloudLobes(r)
  if(type.startsWith("line-callout-")) return lineBoxPath(r)
  const segments=bubbleSegments(type === "oval-callout",r),start=bubbleTurn(segments[0][0],direction)
  return `M ${start.x} ${start.y} ${segments.slice(0,segments.length/2).map(segment=>bubbleCommand(segment,direction)).join(" ")}`
}
function speechBubblePath(type:string,[ex,ey,r]:number[]) {
  const oval=type === "oval-callout",direction=bubbleDirection(ex,ey),tip=bubbleTurn(bubblePoint(ex,ey),(4-direction)%4)
  const segments=bubbleSegments(oval,r).slice(oval ? 2 : 5)
  // Sample arc lengths only to choose the gap. The emitted contour uses exact
  // Bezier subdivisions, preserving the body as the connector moves around it.
  const samples:{segment:number,t:number,point:BubblePoint,length:number}[]=[]
  let length=0,previous=segments[0][0]
  segments.forEach((segment,index)=>{
    for(let step=0;step<=32;step++) {
      const t=step/32,point=splitBubbleCurve(segment,t)[0].at(-1)!
      const current=bubbleTurn(point,direction),prior=bubbleTurn(previous,direction)
      length+=Math.hypot(current.x-prior.x,current.y-prior.y)
      samples.push({segment:index,t,point,length});previous=point
    }
  })
  const angle=Math.atan2(tip.y-37.5,tip.x-50)
  let closest=samples[0]
  for(const sample of samples) if(Math.abs(Math.atan2(sample.point.y-37.5,sample.point.x-50)-angle)<Math.abs(Math.atan2(closest.point.y-37.5,closest.point.x-50)-angle)) closest=sample
  // Interpolate the radial crossing, avoiding visible steps between samples.
  const index=samples.indexOf(closest),neighbor=samples[Math.max(0,Math.min(samples.length-1,index+(Math.atan2(closest.point.y-37.5,closest.point.x-50)<angle ? 1 : -1)))]
  const a=Math.atan2(closest.point.y-37.5,closest.point.x-50),b=Math.atan2(neighbor.point.y-37.5,neighbor.point.x-50)
  const center=closest.length+(neighbor.length-closest.length)*(b===a ? 0 : Math.max(0,Math.min(1,(angle-a)/(b-a))))
  const at=(distance:number)=>{
    const i=Math.max(1,samples.findIndex(sample=>sample.length>=distance)),left=samples[i-1],right=samples[i]
    const fraction=right.length===left.length ? 0 : (distance-left.length)/(right.length-left.length)
    return {segment:right.segment,t:left.segment===right.segment ? left.t+(right.t-left.t)*fraction : right.t*fraction}
  }
  const first=at(Math.max(0,center-10)),last=at(Math.min(length,center+10))
  const before=segments.slice(0,first.segment),after=segments.slice(last.segment+1)
  before.push(splitBubbleCurve(segments[first.segment],first.t)[0])
  const remaining=splitBubbleCurve(segments[last.segment],last.t)[1]
  const end=bubbleTurn(remaining[0],direction)
  return `${speechBubblePrefix(type,r,direction)} ${before.map(segment=>bubbleCommand(segment,direction)).join(" ")} L ${ex} ${ey} L ${end.x} ${end.y} ${[remaining,...after].map(segment=>bubbleCommand(segment,direction)).join(" ")} Z`
}
const calloutPreset = (label:string,form:"rectangle"|"rounded"|"oval") => {
  const type=form === "oval" ? "oval-callout" : form === "rounded" ? "rounded-rectangular-callout" : "rectangular-callout"
  return base(label,"Callouts",values=>speechBubblePath(type,values),[
    ...calloutPoint("end","Connector end",18,100,0),
    {name:"roundness",label:form === "oval" ? "Bubble roundness" : "Corner roundness",default:form === "oval" ? 27.6 : form === "rounded" ? 12 : 0,min:0,max:form === "oval" ? 50 : 35,axis:"x" as const,
      point:([ex,ey,r]:number[])=>bubbleTurn(form === "oval" ? bubblePoint(25-.375*r,18.75-.28125*r) : bubblePoint(r/4,r*3/16),bubbleDirection(ex,ey))},
  ])
}

/** Earlier independent connector endpoints remain readable without rewriting saved paths. */
export const legacySpeechBubblePresets = Object.fromEntries(([
  ["rectangular-callout","Rectangular callout","rectangle"],
  ["rounded-rectangular-callout","Rounded rectangular callout","rounded"],
  ["oval-callout","Oval callout","oval"],
] as const).map(([type,label,form])=>[type,{definition:independentCalloutPreset(label,form),upgrade:([,,ex,ey,r]:number[])=>[ex,ey,r]}]))

const independentLineCalloutPreset = (label: string, bent: boolean) => base(label, "Callouts", ([sx, sy, ex, ey, r]) =>
  `M ${30+r} 0 L ${100-r} 0 Q 100 0 100 ${r} L 100 ${75-r} Q 100 75 ${100-r} 75 L ${30+r} 75 Q 30 75 30 ${75-r} L 30 ${r} Q 30 0 ${30+r} 0 Z M ${sx} ${sy} ${bent ? `L ${sx-10} ${sy} ` : ""}L ${ex} ${ey}${bent ? ` L ${sx-10} ${sy} L ${sx} ${sy}` : ""}`,
  calloutControls([28, 15], [5, 100], 0).map(control => control.name === "roundness"
    ? {...control, point: values => ({x: 30 + values[4], y: 0})} : control))

// Cubic lobes collapse to a smooth ellipse at zero frizziness. Fixed anchors
// keep the frame recoverable from the authored path at every adjustment.
const cloudLobes = (frizziness: number) => {
  const count = 12, step = Math.PI * 2 / count, k = 4 / 3 * Math.tan(step / 4)
  const point = (angle: number) => ({x: 50 + 48*Math.cos(angle), y: 37.5 + 34*Math.sin(angle)})
  const start = point(-Math.PI/2 - step/2)
  let path = `M ${start.x} ${start.y}`
  for(let i = 0; i < count; i++) {
    const a = -Math.PI/2 - step/2 + i*step, b = a+step, middle = a+step/2
    const p = point(a), q = point(b)
    path += ` C ${p.x-48*k*Math.sin(a)+frizziness*Math.cos(middle)} ${p.y+34*k*Math.cos(a)+frizziness*Math.sin(middle)} ${q.x+48*k*Math.sin(b)+frizziness*Math.cos(middle)} ${q.y-34*k*Math.cos(b)+frizziness*Math.sin(middle)} ${q.x} ${q.y}`
  }
  return `${path} Z`
}
const independentThoughtCalloutPreset = base("Cloud callout", "Callouts", ([sx, sy, ex, ey, f]) =>
  `${cloudLobes(f)} ${ellipse(sx,sy,5,4)} ${ellipse(ex,ey,3,2)}`, [
    ...calloutPoint("start", "Connector start", 22, 86, 0, [5,0]), ...calloutPoint("end", "Connector end", 14, 96, 2, [3,0]),
    {name: "frizziness", label: "Cloud frizziness", default: 12, min: 0, max: 30, axis: "y",
      point: values => ({x: 50, y: 3.5 - values[4]*.75})},
  ])

const lineBoxPath = (r:number) => `M ${30+r} 0 L ${100-r} 0 Q 100 0 100 ${r} L 100 ${75-r} Q 100 75 ${100-r} 75 L ${30+r} 75 Q 30 75 30 ${75-r} L 30 ${r} Q 30 0 ${30+r} 0 Z`
/** Intersect the center-to-tip ray with the real contour, refining each
 * candidate on the Bezier itself rather than attaching to its control hull. */
function connectorAttachment(path:string,center:BubblePoint,tip:BubblePoint) {
  const direction=bubblePoint(tip.x-center.x,tip.y-center.y)
  if(Math.hypot(direction.x,direction.y)<1e-8) direction.y=1
  const cross=(point:BubblePoint)=>(point.x-center.x)*direction.y-(point.y-center.y)*direction.x
  let current=center,start=center,best={point:center,normal:bubblePoint(0,1),distance:-Infinity}
  for(const match of path.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const numbers=(match[2].match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)??[]).map(Number)
    const points=Array.from({length:numbers.length/2},(_,i)=>bubblePoint(numbers[i*2],numbers[i*2+1]))
    if(match[1]==="M") {current=start=points[0];continue}
    const curve=[current,...(match[1]==="Z" ? [start] : points)]
    for(let step=1;step<=32;step++) {
      let lo=(step-1)/32,hi=step/32
      const first=cross(splitBubbleCurve(curve,lo)[0].at(-1)!),last=cross(splitBubbleCurve(curve,hi)[0].at(-1)!)
      if(first*last>0) continue
      for(let i=0;i<24;i++) {
        const mid=(lo+hi)/2,value=cross(splitBubbleCurve(curve,mid)[0].at(-1)!)
        if(first*value>0) lo=mid
        else hi=mid
      }
      const t=(lo+hi)/2,point=splitBubbleCurve(curve,t)[0].at(-1)!
      const distance=((point.x-center.x)*direction.x+(point.y-center.y)*direction.y)/(direction.x**2+direction.y**2)
      if(distance<0 || distance<=best.distance) continue
      const derivative=curve.slice(1).map((point,i)=>bubblePoint(point.x-curve[i].x,point.y-curve[i].y))
      const tangent=splitBubbleCurve(derivative,t)[0].at(-1)!,length=Math.hypot(tangent.x,tangent.y)
      if(length<1e-8) continue
      best={point,normal:bubblePoint(tangent.y/length,-tangent.x/length),distance}
    }
    current=curve.at(-1)!
  }
  return best
}
const lineCalloutPreset = (label:string,bent:boolean) => base(label,"Callouts",([ex,ey,r])=>{
  const body=lineBoxPath(r),{point:start,normal}=connectorAttachment(body,bubblePoint(65,37.5),bubblePoint(ex,ey))
  const elbow=bubblePoint(start.x+normal.x*10,start.y+normal.y*10)
  return `${body} M ${start.x} ${start.y} ${bent ? `L ${elbow.x} ${elbow.y} ` : ""}L ${ex} ${ey}${bent ? ` L ${elbow.x} ${elbow.y} L ${start.x} ${start.y}` : ""}`
},[
  ...calloutPoint("end","Connector end",5,100,0),
  {name:"roundness",label:"Corner roundness",default:0,min:0,max:35,axis:"x",point:([,,r])=>({x:30+r,y:0})},
])
const thoughtCalloutPreset = base("Cloud callout","Callouts",([ex,ey,f])=>{
  const body=cloudLobes(f),{point}=connectorAttachment(body,bubblePoint(50,37.5),bubblePoint(ex,ey))
  const start=bubblePoint(point.x+(ex-point.x)*.6,point.y+(ey-point.y)*.6)
  return `${body} ${ellipse(start.x,start.y,5,4)} ${ellipse(ex,ey,3,2)}`
},[
  ...calloutPoint("end","Connector end",14,96,0,[3,0]),
  {name:"frizziness",label:"Cloud frizziness",default:12,min:0,max:30,axis:"y",point:([,,f])=>({x:50,y:3.5-f*.75})},
])
Object.assign(legacySpeechBubblePresets,{
  "cloud-callout":{definition:independentThoughtCalloutPreset,upgrade:([,,ex,ey,f]:number[])=>[ex,ey,f]},
  "line-callout-1":{definition:independentLineCalloutPreset("Line callout 1",false),upgrade:([,,ex,ey,r]:number[])=>[ex,ey,r]},
  "line-callout-2":{definition:independentLineCalloutPreset("Line callout 2",true),upgrade:([,,ex,ey,r]:number[])=>[ex,ey,r]},
})

/** Saved single-axis callouts keep their geometry until the next edit. */
export const legacyCalloutPresets: Record<string, {definition: GraphicShapePreset, upgrade: (values: number[]) => number[]}> = {
  "rectangular-callout": {definition: legacyCalloutPreset("Rectangular callout", "rectangle"), upgrade: ([p]) => [p,100,0]},
  "rounded-rectangular-callout": {definition: legacyCalloutPreset("Rounded rectangular callout", "rounded"), upgrade: ([p]) => [p,100,12]},
  "oval-callout": {definition: legacyCalloutPreset("Oval callout", "oval"), upgrade: ([p]) => [p,100,27.6]},
  "cloud-callout": {definition: base("Cloud callout", "Callouts", ([p]) => `${cloudBubble()} ${ellipse(22,86,5,4)} ${ellipse(p,96,3,2)}`, [poi("tail", "Thought tail position", 14, 4, 45, p => ({x:p,y:96}))]), upgrade: ([p]) => [p,96,12]},
  "line-callout-1": {definition: base("Line callout 1", "Callouts", ([p]) => `M 30 0 L 100 0 L 100 75 L 30 75 Z M 28 15 L ${p} 100`, [poi("tail", "Leader endpoint", 5, 0, 25, p => ({x:p,y:100}))]), upgrade: ([p]) => [p,100,0]},
  "line-callout-2": {definition: base("Line callout 2", "Callouts", ([p]) => `M 30 0 L 100 0 L 100 75 L 30 75 Z M 28 15 L 18 15 L ${p} 100`, [poi("tail", "Leader endpoint", 5, 0, 25, p => ({x:p,y:100}))]), upgrade: ([p]) => [p,100,0]},
}

const originalGraphicShapePresets = {
  "straight-arrow": {...base("Straight arrow", "Lines", ([p]) => `M 0 0 L 100 100 M ${100-p} 100 L 100 100 L 100 ${100-p}`, [poi("head", "Arrowhead size", 22, 8, 40, p => ({x:100-p,y:100}))]), open:true},
  "double-arrow": {...base("Double arrow", "Lines", ([p]) => `M 0 0 L 100 100 M ${100-p} 100 L 100 100 L 100 ${100-p} M 0 ${p} L 0 0 L ${p} 0`, [poi("head", "Arrowhead size", 22, 8, 40, p => ({x:p,y:0}))]), open:true},
  "elbow-connector": {...base("Elbow connector", "Lines", values => { const d=v(values,0,50); return `M 10 15 L ${d} 15 L ${d} 85 L 90 85` }, [poi("bend", "Bend", 50, 10, 90, p => ({x:p,y:15}))]), open:true},
  "elbow-connector-arrow": {...base("Elbow connector arrow", "Lines", ([p]) => `M 0 0 L ${p} 0 L ${p} 85 L 100 85 M 85 70 L 100 85 L 85 100`, [poi("bend", "Bend", 50, 0, 100, p => ({x:p,y:0}))]), open:true},
  "elbow-connector-double-arrow": {...base("Elbow connector double arrow", "Lines", ([p]) => `M 0 15 L ${p} 15 L ${p} 85 L 100 85 M 85 70 L 100 85 L 85 100 M 15 0 L 0 15 L 15 30`, [poi("bend", "Bend", 50, 0, 100, p => ({x:p,y:15}))]), open:true},
  "curved-connector": {...base("Curved connector", "Lines", ([p]) => `M 0 0 C ${p} 0 ${100-p} 100 100 100`, [poi("bend", "Bend", 80, 0, 100, p => ({x:15.625+.28125*p,y:15.625}))]), open:true},
  "curved-connector-arrow": {...base("Curved connector arrow", "Lines", ([p]) => `M 0 0 C ${p} 0 ${100-p} 100 100 100 M 85 85 L 100 100 L 82 100`, [poi("bend", "Bend", 80, 0, 100, p => ({x:15.625+.28125*p,y:15.625}))]), open:true},
  "curved-connector-double-arrow": {...base("Curved connector double arrow", "Lines", ([p]) => `M 0 0 C ${p} 0 ${100-p} 100 100 100 M 85 85 L 100 100 L 82 100 M 15 15 L 0 0 L 18 0`, [poi("bend", "Bend", 80, 0, 100, p => ({x:15.625+.28125*p,y:15.625}))]), open:true},
  "curve": {...base("Curve", "Lines", ([p]) => `M 0 70 C 20 0 ${p} 0 50 50 C ${100-p} 100 80 100 100 70`, [poi("curve", "Curve control", 40, 0, 100, p => ({x:13.75+.375*p,y:15}))]), open:true},
  "square-rectangle": base("Rectangle", "Rectangles", roundedCorners, roundedCornerControls(0)),
  "rounded-rectangle": base("Rounded rectangle", "Rectangles", roundedCorners, roundedCornerControls(12)),
  "snip-one": base("Snip one corner", "Rectangles", ([tl = 15]) => polygon([[tl,0],[100,0],[100,100],[0,100],[0,tl]]), [cornerControl("snip", "top-left", 0, 15)]),
  "snip-same-side": base("Snip same side", "Rectangles", ([tl = 15, tr = tl]) => polygon([[tl,0],[100-tr,0],[100,tr],[100,100],[0,100],[0,tl]]), [cornerControl("snip", "top-left", 0, 15), cornerControl("snip-top-right", "top-right", 1, 15)]),
  "snip-diagonal": base("Snip diagonal", "Rectangles", ([tl = 15, br = tl]) => polygon([[tl,0],[100,0],[100,100-br],[100-br,100],[0,100],[0,tl]]), [cornerControl("snip", "top-left", 0, 15), cornerControl("snip-bottom-right", "bottom-right", 1, 15)]),
  "snip-round": base("Snip round", "Rectangles", ([tl = 15, br = tl]) => `M ${tl} 0 L 100 0 L 100 ${100-br} Q 100 100 ${100-br} 100 L 0 100 L 0 ${tl} Z`, [cornerControl("snip", "top-left", 0, 15), cornerControl("radius-bottom-right", "bottom-right", 1, 15)]),
  "round-one": base("Round one corner", "Rectangles", ([tl = 12]) => `M ${tl} 0 L 100 0 L 100 100 L 0 100 L 0 ${tl} Q 0 0 ${tl} 0 Z`, [cornerControl("radius", "top-left", 0, 12)]),
  "round-same-side": base("Round same side", "Rectangles", ([tl = 12, tr = tl]) => `M ${tl} 0 L ${100-tr} 0 Q 100 0 100 ${tr} L 100 100 L 0 100 L 0 ${tl} Q 0 0 ${tl} 0 Z`, [cornerControl("radius", "top-left", 0, 12), cornerControl("radius-top-right", "top-right", 1, 12)]),
  "round-diagonal": base("Round diagonal", "Rectangles", ([tl = 12, br = tl]) => `M ${tl} 0 L 100 0 L 100 ${100-br} Q 100 100 ${100-br} 100 L 0 100 L 0 ${tl} Q 0 0 ${tl} 0 Z`, [cornerControl("radius", "top-left", 0, 12), cornerControl("radius-bottom-right", "bottom-right", 1, 12)]),
  "text-box": {...base("Text box", "Basic shapes", values => rect(v(values,0,4)), [a("radius", "Radius",4,0,15)]), contentSize: {maxWidth:480,padding:8}},
  "right-triangle": base("Right triangle", "Basic shapes", ([p]) => polygon([[p,0],[100,100],[0,100]]), [poi("apex", "Apex position", 0, 0, 100, p => ({x:p,y:0}))]),
  "parallelogram": base("Parallelogram", "Basic shapes", values => { const d=v(values,0,18); return polygon([[d,0],[100,0],[100-d,100],[0,100]]) }, [a("slant", "Slant",18,0,50)]),
  "trapezoid": base("Trapezoid", "Basic shapes", values => { const d=v(values,0,25); return polygon([[d,0],[100-d,0],[100,100],[0,100]]) }, [a("top-inset", "Top inset",25,0,50)]),
  "pentagon": base("Pentagon", "Basic shapes", values => { const d=v(values,0,38); return polygon([[50,0],[100,d],[82,100],[18,100],[0,d]]) }, [poi("shoulder", "Shoulder height",38,0,50,p => ({x:100,y:p}),"y")]),
  "heptagon": base("Heptagon", "Basic shapes", values => { const d=v(values,0,19); return polygon([[50,0],[89,d],[98,62],[72,100],[28,100],[2,62],[11,d]]) }, [poi("shoulder", "Shoulder height",19,0,62,p => ({x:89,y:p}),"y")]),
  "octagon": base("Octagon", "Basic shapes", values => { const d=v(values,0,25); return polygon([[d,0],[100-d,0],[100, d],[100,100-d],[100-d,100],[d,100],[0,100-d],[0,d]]) }, [a("corner", "Corner",25,0,50)]),
  "decagon": base("Decagon", "Basic shapes", values => { const d=v(values,0,7); return polygon([[50,0],[79,d],[98,35],[98,65],[79,93],[50,100],[21,93],[2,65],[2,35],[21,d]]) }, [poi("shoulder", "Shoulder height",7,0,35,p => ({x:79,y:p}),"y")]),
  "dodecagon": base("Dodecagon", "Basic shapes", values => { const d=v(values,0,13); return polygon([[37,0],[63,0],[87,d],[100,37],[100,63],[87,87],[63,100],[37,100],[13,87],[0,63],[0,37],[13,d]]) }, [poi("shoulder", "Shoulder height",13,0,37,p => ({x:87,y:p}),"y")]),
  "pie": base("Pie", "Basic shapes", ([sweep]) => {
    const middle = piePoint(sweep / 2), end = piePoint(sweep)
    return `M 50 50 L 50 0 A 50 50 0 0 0 ${middle.x} ${middle.y} A 50 50 0 0 0 ${end.x} ${end.y} Z`
  }, [{name:"sweep", label:"Slice angle", default:270, min:0, max:360, axis:"angle", point: values => piePoint(values[0])}]),
  "chord": base("Chord", "Basic shapes", ([start, sweep]) => {
    const first = piePoint(start), middle = piePoint(start + sweep / 3), last = piePoint(start + sweep)
    return `M ${first.x} ${first.y} A 50 50 0 0 0 ${middle.x} ${middle.y} A 50 50 0 ${sweep > 270 ? 1 : 0} 0 ${last.x} ${last.y} Z`
  }, [
    {name: "start-angle", label: "Start endpoint", default: 0, min: 0, max: 360, axis: "angle", point: values => piePoint(values[0])},
    {name: "sweep", label: "End endpoint", default: 240, min: .5, max: 360, axis: "angle", point: values => piePoint(values[0] + values[1])},
  ]),
  "teardrop": base("Teardrop", "Basic shapes", values => `M 50 0 C 75 32 95 52 82 78 C 68 ${100-v(values,0,6)} 32 ${100-v(values,0,6)} 18 78 C 5 52 25 32 50 0 Z`, [poi("bulge", "Bulge",6,0,25,p => ({x:50,y:94.5-.75*p}),"y")]),
  "frame": base("Frame", "Basic shapes", values => `${rect(0)} ${rect(0, v(values,0,15))}`, [poi("thickness", "Frame thickness",15,0,50,p => ({x:p,y:p}))]),
  "half-frame": base("Half frame", "Basic shapes", ([d]) => polygon([[0,0],[100,0],[100-d,d],[d,d],[d,100-d],[0,100]]), [poi("thickness", "Frame thickness", 25, 0, 50, p => ({x:p,y:p}))]),
  "corner": base("L corner", "Basic shapes", ([d]) => polygon([[0,0],[d,0],[d,100-d],[100,100-d],[100,100],[0,100]]), [poi("thickness", "Arm thickness", 35, 0, 100, p => ({x:p,y:0}))]),
  "diagonal-stripe": base("Diagonal stripe", "Basic shapes", ([d]) => polygon([[100-d,0],[100,0],[0,100],[0,100-d]]), [poi("width", "Stripe width", 40, 0, 100, p => ({x:100-p,y:0}))]),
  "plus": base("Plus", "Basic shapes", values => { const d=v(values,0,30); return polygon([[d,0],[100-d,0],[100-d,d],[100,d],[100,100-d],[100-d,100-d],[100-d,100],[d,100],[d,100-d],[0,100-d],[0,d],[d,d]]) }, [a("arm", "Arm width",30,0,50)]),
  "plaque": base("Plaque", "Basic shapes", ([r]) => `M ${r} 0 L ${100-r} 0 Q ${100-r} ${r} 100 ${r} L 100 ${100-r} Q ${100-r} ${100-r} ${100-r} 100 L ${r} 100 Q ${r} ${100-r} 0 ${100-r} L 0 ${r} Q ${r} ${r} ${r} 0 Z`, [poi("radius", "Corner cutout", 18, 0, 50, p => ({x:p,y:0}))]),
  "cylinder": base("Cylinder", "Basic shapes", values => { const d=v(values,0,16); return `M 5 ${d+2} C 5 2 95 2 95 ${d+2} L 95 ${100-d} C 95 98 5 98 5 ${100-d} Z M 5 ${d+2} C 5 ${d*2+2} 95 ${d*2+2} 95 ${d+2}` }, [poi("depth", "Cap depth",16,0,50,p => ({x:5,y:p+2}),"y")]),
  "cube": base("Cube", "Basic shapes", ([d]) => `M ${d} 0 L 100 0 L 100 ${100-d} L ${100-d} 100 L 0 100 L 0 ${d} Z M 0 ${d} L ${100-d} ${d} L 100 0 M ${100-d} ${d} L ${100-d} 100`, [poi("depth", "Depth", 25, 0, 50, p => ({x:p,y:0}))]),
  "donut": base("Donut", "Basic shapes", values => `${ellipse()} ${ellipse(50,50,v(values,0,25),v(values,0,25))}`, [poi("hole", "Hole radius",25,0,50,p => ({x:50+p,y:50}))]),
  "prohibited": base("No / prohibited", "Basic shapes", ([r]) => prohibitedPath(r), [poi("hole", "Inner radius", 35, 0, 50, p => ({x:50-p*Math.SQRT1_2,y:50+p*Math.SQRT1_2}))]),
  "block-arc": base("Block arc", "Basic shapes", ([r]) => `M 0 100 C 0 -33.333 100 -33.333 100 100 L ${50+r} 100 C ${50+r} ${100-r*2.66666} ${50-r} ${100-r*2.66666} ${50-r} 100 Z`, [poi("inner", "Inner radius", 30, 0, 50, p => ({x:50+p,y:100}))]),
  "folded-corner": base("Folded corner", "Basic shapes", ([d]) => `M 0 0 L 100 0 L 100 ${100-d} L ${100-d} 100 L 0 100 Z M 100 ${100-d} L ${100-d} ${100-d} L ${100-d} 100`, [poi("fold", "Fold size", 18, 0, 50, p => ({x:100-p,y:100}))]),
  "heart": base("Heart", "Basic shapes", values => { const d=v(values,0,22); return `M 50 90 C 42 80 5 55 5 28 C 5 5 35 0 50 ${d} C 65 0 95 5 95 28 C 95 55 58 80 50 90 Z` }, [poi("cleft", "Cleft depth",22,0,50,p => ({x:50,y:p}),"y")]),
  "lightning-bolt": base("Lightning bolt", "Basic shapes", ([left = 20, right = 18]) => polygon([[55,0],[left,55],[45,55],[35,100],[100-right,38],[55,38]]), [
    {name:"width", label:"Left corner", default:20, min:5, max:35, axis:"x", opposite:"right-width", point: values => ({x:values[0],y:55})},
    {name:"right-width", label:"Right corner", default:18, min:5, max:35, axis:"x", opposite:"width", point: values => ({x:100-values[1],y:38})},
  ]),
  "sun": base("Sun", "Basic shapes", ([r]) => `${ellipse(50,50,25,25)} ${Array.from({length:8}, (_,i) => { const t=i*Math.PI/4; return polygon([[50+48*Math.cos(t),50+48*Math.sin(t)],[50+r*Math.cos(t-.2),50+r*Math.sin(t-.2)],[50+r*Math.cos(t+.2),50+r*Math.sin(t+.2)]]) }).join(" ")}`, [poi("ray", "Ray inner radius", 34, 25, 48, p => ({x:50+p*Math.cos(.2),y:50+p*Math.sin(.2)}))]),
  "moon": base("Moon", "Basic shapes", ([phase]) => {
    const control = 50 + (phase - 50) * .5523
    return `M 50 0 C 22.385 0 0 22.385 0 50 C 0 77.615 22.385 100 50 100 C ${control} 100 ${phase} 77.615 ${phase} 50 C ${phase} 22.385 ${control} 0 50 0 Z`
  }, [poi("phase", "Moon phase",20,0,100,p => ({x:p,y:50}))]),
  "cloud": base("Cloud", "Basic shapes", ([inner]) => cloudPath(inner), [poi("inner", "Inner radius",30,0,38,p=>({x:50+28*p/30,y:40-25*p/30}))]),
  "arc": {...base("Arc", "Basic shapes", ([p]) => `M 0 0 C ${p} 0 100 ${100-p} 100 100`, [poi("curve", "Curve control", 55.23, 0, 100, p => ({x:50+.375*p,y:50-.375*p}))]), open:true},
  "parentheses": {...base("Parentheses pair", "Basic shapes", values => { const d=v(values,0,20); return `M 38 5 C ${38-d} 25 ${38-d} 75 38 95 M 62 5 C ${62+d} 25 ${62+d} 75 62 95` }, [poi("curve", "Curve",20,0,38,p => ({x:38-.75*p,y:50}))]), open:true},
  "braces": {...base("Braces pair", "Basic shapes", values => { const d=v(values,0,12); return `M 42 5 Q ${42-d} 5 32 25 L 32 40 Q 32 50 20 50 Q 32 50 32 60 L 32 75 Q ${42-d} 95 42 95 M 58 5 Q ${58+d} 5 68 25 L 68 40 Q 68 50 80 50 Q 68 50 68 60 L 68 75 Q ${58+d} 95 58 95` }, [poi("curve", "Curve",12,0,42,p => ({x:39.5-.5*p,y:10}))]), open:true},
  "left-bracket": {...base("Left bracket", "Basic shapes", ([r]) => `M 75 0 L ${25+r} 0 Q 25 0 25 ${r} L 25 ${100-r} Q 25 100 ${25+r} 100 L 75 100`, [poi("radius", "Corner radius", 0, 0, 50, p => ({x:25+p,y:0}))]), open:true},
  "right-bracket": {...base("Right bracket", "Basic shapes", ([r]) => `M 25 0 L ${75-r} 0 Q 75 0 75 ${r} L 75 ${100-r} Q 75 100 ${75-r} 100 L 25 100`, [poi("radius", "Corner radius", 0, 0, 50, p => ({x:75-p,y:0}))]), open:true},
  "left-brace": {...base("Left brace", "Basic shapes", values => `M 70 5 Q 48 5 52 25 L 52 40 Q 52 50 ${v(values,0,25)} 50 Q 52 50 52 60 L 52 75 Q 48 95 70 95`, [poi("width", "Brace width",25,0,52,p => ({x:p,y:50}))]), open:true},
  "right-brace": {...base("Right brace", "Basic shapes", values => `M 30 5 Q 52 5 48 25 L 48 40 Q 48 50 ${100-v(values,0,25)} 50 Q 48 50 48 60 L 48 75 Q 52 95 30 95`, [poi("width", "Brace width",25,0,100,p => ({x:100-p,y:50}))]), open:true},
  "left-arrow": blockArrow("Left arrow", 2),
  "up-arrow": blockArrow("Up arrow", 3),
  "down-arrow": blockArrow("Down arrow", 1),
  "left-right-arrow": base("Left-right arrow", "Block arrows", ([d]) => polygon([[0,50],[d,0],[d,34],[100-d,34],[100-d,0],[100,50],[100-d,100],[100-d,66],[d,66],[d,100]]), [poi("head", "Head depth", 25, 8, 44, p => ({x:p,y:0}))]),
  "up-down-arrow": base("Up-down arrow", "Block arrows", ([d]) => turn(polygon([[0,50],[d,0],[d,34],[100-d,34],[100-d,0],[100,50],[100-d,100],[100-d,66],[d,66],[d,100]]), 1), [poi("head", "Head depth", 25, 8, 44, p => ({x:100,y:p}), "y")]),
  "quad-arrow": base("Quad arrow", "Block arrows", ([t]) => quadArrow(t), [poi("shaft", "Shaft half-width", 10, 4, 16, p => ({x:50+p,y:25}))]),
  "left-right-up-arrow": base("Left-right-up arrow", "Block arrows", ([t]) => polygon([[0,65],[25,40],[25,55],[50-t,55],[50-t,25],[25,25],[50,0],[75,25],[50+t,25],[50+t,55],[75,55],[75,40],[100,65],[75,90],[75,75],[25,75],[25,90]]), [poi("shaft", "Shaft half-width", 10, 4, 18, p => ({x:50+p,y:25}))]),
  "bent-arrow": base("Bent arrow", "Block arrows", ([t]) => `M 0 100 L 0 40 Q 0 10 30 10 L 70 10 L 70 0 L 100 25 L 70 50 L 70 ${10+t} L 30 ${10+t} Q ${t} ${10+t} ${t} 40 L ${t} 100 Z`, [poi("thickness", "Shaft thickness", 20, 8, 30, p => ({x:p,y:100}))]),
  "u-turn-arrow": base("U-turn arrow", "Block arrows", ([t]) => `M 0 100 L 0 38 C 0 -12 80 -12 80 38 L 80 60 L 100 60 L 70 90 L 40 60 L ${80-t} 60 L ${80-t} 38 C ${80-t} ${-12+t} ${t} ${-12+t} ${t} 38 L ${t} 100 Z`, [poi("thickness", "Shaft thickness", 18, 8, 28, p => ({x:p,y:100}))]),
  "left-up-arrow": base("Left-up arrow", "Block arrows", ([t]) => polygon([[0,75],[25,50],[25,65],[65,65],[65,25],[50,25],[75,0],[100,25],[85,25],[85,85],[25,85],[25,100]]).replace("65 65", `${65-t} ${65-t}`).replace("65 25", `${65-t} 25`).replace("25 65", `25 ${65-t}`), [poi("thickness", "Bend thickness", 0, -10, 15, p => ({x:65-p,y:65-p}))]),
  "bent-up-arrow": base("Bent-up arrow", "Block arrows", ([t]) => polygon([[0,100],[0,100-t],[65,100-t],[65,25],[50,25],[75,0],[100,25],[85,25],[85,100]]), [poi("thickness", "Base thickness", 20, 8, 40, p => ({x:0,y:100-p}), "y")]),
  "curved-left-arrow": curvedArrow("Curved left arrow", 2),
  "curved-right-arrow": curvedArrow("Curved right arrow", 0),
  "curved-up-arrow": curvedArrow("Curved up arrow", 3),
  "curved-down-arrow": curvedArrow("Curved down arrow", 1),
  "striped-right-arrow": base("Striped right arrow", "Block arrows", ([d]) => `M 25 35 L ${100-d} 35 L ${100-d} 0 L 100 50 L ${100-d} 100 L ${100-d} 65 L 25 65 Z M 0 35 L 5 35 L 5 65 L 0 65 Z M 12 35 L 19 35 L 19 65 L 12 65 Z`, [poi("head", "Head depth", 30, 15, 55, p => ({x:100-p,y:0}))]),
  "notched-right-arrow": base("Notched right arrow", "Block arrows", ([d]) => polygon([[0,30],[65,30],[65,0],[100,50],[65,100],[65,70],[0,70],[d,50]]), [poi("notch", "Notch depth", 15, 3, 40, p => ({x:p,y:50}))]),
  "home-plate": base("Pentagon arrow", "Block arrows", ([d]) => polygon([[0,0],[100-d,0],[100,50],[100-d,100],[0,100]]), [poi("head", "Point depth", 30, 5, 70, p => ({x:100-p,y:0}))]),
  "chevron": base("Chevron", "Block arrows", ([d]) => polygon([[0,0],[100-d,0],[100,50],[100-d,100],[0,100],[d,50]]), [poi("depth", "Point depth", 30, 5, 48, p => ({x:p,y:50}))]),
  "right-arrow-callout": arrowCallout("Right arrow callout", 0),
  "down-arrow-callout": arrowCallout("Down arrow callout", 1),
  "left-arrow-callout": arrowCallout("Left arrow callout", 2),
  "up-arrow-callout": arrowCallout("Up arrow callout", 3),
  "left-right-arrow-callout": base("Left-right arrow callout", "Block arrows", ([d]) => polygon([[0,50],[18,30],[18,42],[d,42],[d,15],[100-d,15],[100-d,42],[82,42],[82,30],[100,50],[82,70],[82,58],[100-d,58],[100-d,85],[d,85],[d,58],[18,58],[18,70]]), [poi("inset", "Box inset", 30, 20, 40, p => ({x:p,y:15}))]),
  "quad-arrow-callout": base("Quad arrow callout", "Block arrows", ([t]) => quadArrow(t, true), [poi("shaft", "Shaft half-width", 7, 3, 12, p => ({x:50+p,y:18}))]),
  "circular-arrow": base("Circular arrow", "Block arrows", ([t]) => `M 10 70 C -10 30 15 0 50 0 C 75 0 95 20 95 45 L 100 45 L 85 68 L 65 45 L ${95-t} 45 C ${95-t} ${20+t} 75 ${t} 50 ${t} C ${15+t} ${t} ${t} 30 ${10+t} 70 Z`, [poi("thickness", "Band thickness", 12, 5, 22, p => ({x:50,y:p}), "y")]),
  "equation-plus": base("Plus sign", "Equation shapes", ([t]) => crossPath(t), [poi("thickness", "Bar thickness", 24, 0, 100, p => ({x:50+p/2,y:0}))]),
  "equation-minus": base("Minus", "Equation shapes", ([r]) => `M ${r} 38 L ${100-r} 38 Q 100 38 100 ${38+r} L 100 ${62-r} Q 100 62 ${100-r} 62 L ${r} 62 Q 0 62 0 ${62-r} L 0 ${38+r} Q 0 38 ${r} 38 Z`, [poi("roundness", "Corner roundness", 0, 0, 12, p => ({x:p,y:38}))]),
  "multiply": base("Multiply", "Equation shapes", ([t]) => polygon([[t,0],[50,50-t],[100-t,0],[100,t],[50+t,50],[100,100-t],[100-t,100],[50,50+t],[t,100],[0,100-t],[50-t,50],[0,t]]), [poi("thickness", "Bar width", 20, 0, 50, p => ({x:p,y:0}))]),
  "divide": base("Divide", "Equation shapes", ([r]) => `M 0 40 L 100 40 L 100 60 L 0 60 Z ${ellipse(50,15,r,r)} ${ellipse(50,85,r,r)}`, [poi("dot", "Dot radius", 10, 0, 15, p => ({x:50+p,y:15}))]),
  "equal": base("Equal", "Equation shapes", ([t]) => `M 0 15 L 100 15 L 100 ${15+t} L 0 ${15+t} Z M 0 ${85-t} L 100 ${85-t} L 100 85 L 0 85 Z`, [poi("thickness", "Bar thickness", 20, 0, 35, p => ({x:50,y:15+p}), "y")]),
  "not-equal": {...base("Not equal", "Equation shapes", ([s]) => `M 0 25 L ${50-s} 25 L ${65-s} 0 L 80 0 L 65 25 L 100 25 L 100 42 L 55 42 L 45 58 L 100 58 L 100 75 L 35 75 L 20 100 L ${5+s} 100 L ${20+s} 75 L 0 75 L 0 58 L ${30+s} 58 L ${40+s} 42 L 0 42 Z`, [poi("slash", "Slash width", 0, -5, 5, p => ({x:50-p,y:25}))]),},
  "process": base("Process", "Flowchart", ([r]) => rect(r), [poi("roundness", "Corner roundness", 0, 0, 50, p => ({x:p,y:0}))]),
  "alternate-process": base("Alternate process", "Flowchart", ([r]) => rect(r), [poi("radius", "Corner radius", 15, 0, 50, p => ({x:p,y:0}))]),
  "decision": base("Decision", "Flowchart", ([p]) => polygon([[p,0],[100,50],[p,100],[0,50]]), [poi("apex", "Apex position", 50, 0, 100, p => ({x:p,y:0}))]),
  "data": base("Data", "Flowchart", ([s]) => polygon([[s,0],[100,0],[100-s,100],[0,100]]), [poi("slant", "Slant", 20, 0, 50, p => ({x:p,y:0}))]),
  "predefined-process": base("Predefined process", "Flowchart", ([m]) => `${rect()} M ${m} 0 L ${m} 100 M ${100-m} 0 L ${100-m} 100`, [poi("margin", "Side margin", 12, 0, 50, p => ({x:p,y:0}))]),
  "internal-storage": base("Internal storage", "Flowchart", ([m]) => `${rect()} M ${m} 0 L ${m} 100 M 0 ${m} L 100 ${m}`, [poi("margin", "Header margin", 15, 0, 50, p => ({x:p,y:p}))]),
  "document": base("Document", "Flowchart", ([d]) => `M 0 0 L 100 0 L 100 85 C 65 ${85-d} 35 ${85+d} 0 85 Z`, [poi("wave", "Wave depth", 20, 0, 35, p => ({x:25.46875,y:85+.28125*p}), "y")]),
  "multidocument": base("Multiple documents", "Flowchart", ([d]) => `M 0 15 L 85 15 L 85 85 C 55 ${85-d} 30 ${85+d} 0 85 Z M 8 8 L 93 8 L 93 78 M 15 0 L 100 0 L 100 70`, [poi("wave", "Wave depth", 15, 0, 30, p => ({x:21.71875,y:85+.28125*p}), "y")]),
  "terminator": base("Terminator", "Flowchart", ([r]) => `M ${r} 25 L ${100-r} 25 C 100 25 100 75 ${100-r} 75 L ${r} 75 C 0 75 0 25 ${r} 25 Z`, [poi("roundness", "End roundness", 25, 0, 50, p => ({x:p,y:25}))]),
  "preparation": base("Preparation", "Flowchart", ([p]) => polygon([[p,0],[100-p,0],[100,50],[100-p,100],[p,100],[0,50]]), [poi("point", "Point depth", 22, 0, 50, p => ({x:p,y:0}))]),
  "manual-input": base("Manual input", "Flowchart", ([s]) => polygon([[0,s],[100,0],[100,100],[0,100]]), [poi("slope", "Top slope", 22, 0, 100, p => ({x:0,y:p}), "y")]),
  "manual-operation": base("Manual operation", "Flowchart", ([s]) => polygon([[0,0],[100,0],[100-s,100],[s,100]]), [poi("inset", "Bottom inset", 20, 0, 50, p => ({x:p,y:100}))]),
  "flowchart-connector": base("Connector", "Flowchart", ([r]) => roundFlow(r), [poi("curvature", "Curvature", 27.615, 0, 50, p => ({x:25-.375*p,y:25-.375*p}))]),
  "offpage-connector": base("Off-page connector", "Flowchart", ([p]) => polygon([[0,0],[100,0],[100,p],[50,100],[0,p]]), [poi("point", "Shoulder height", 75, 0, 100, p => ({x:100,y:p}), "y")]),
  "card": base("Card", "Flowchart", ([p]) => polygon([[p,0],[100,0],[100,100],[0,100],[0,p]]), [poi("corner", "Clipped corner", 25, 0, 100, p => ({x:p,y:0}))]),
  "punched-tape": base("Punched tape", "Flowchart", ([d]) => `M 0 15 C 30 ${15+d} 70 ${15-d} 100 15 L 100 85 C 70 ${85-d} 30 ${85+d} 0 85 Z`, [poi("wave", "Wave depth", 20, 0, 35, p => ({x:24.0625,y:15+.28125*p}), "y")]),
  "summing-junction": base("Summing junction", "Flowchart", ([r]) => `${roundFlow(r)} M 15 15 L 85 85 M 15 85 L 85 15`, [poi("curvature", "Curvature", 27.615, 0, 50, p => ({x:25-.375*p,y:25-.375*p}))]),
  "or": base("Or", "Flowchart", ([r]) => `${roundFlow(r)} M 0 50 L 100 50 M 50 0 L 50 100`, [poi("curvature", "Curvature", 27.615, 0, 50, p => ({x:25-.375*p,y:25-.375*p}))]),
  "collate": base("Collate", "Flowchart", ([p]) => polygon([[0,0],[100,0],[50,p],[100,100],[0,100],[50,p]]), [poi("waist", "Waist height", 50, 0, 100, p => ({x:50,y:p}), "y")]),
  "sort": base("Sort", "Flowchart", ([p]) => `${polygon([[50,0],[100,p],[50,100],[0,p]])} M 0 ${p} L 100 ${p}`, [poi("division", "Division height", 50, 0, 100, p => ({x:0,y:p}), "y")]),
  "extract": base("Extract", "Flowchart", ([p]) => polygon([[p,0],[100,100],[0,100]]), [poi("apex", "Apex position", 50, 0, 100, p => ({x:p,y:0}))]),
  "merge": base("Merge", "Flowchart", ([p]) => polygon([[0,0],[100,0],[p,100]]), [poi("apex", "Apex position", 50, 0, 100, p => ({x:p,y:100}))]),
  "stored-data": base("Stored data", "Flowchart", ([r]) => `M ${r} 0 L 100 0 C ${100-r} 0 ${100-r} 100 100 100 L ${r} 100 C 0 100 0 0 ${r} 0 Z`, [poi("curve", "End curvature", 20, 0, 100, p => ({x:p,y:0}))]),
  "delay": base("Delay", "Flowchart", ([r]) => `M 0 0 L ${100-r} 0 C 100 0 100 100 ${100-r} 100 L 0 100 Z`, [poi("curve", "End curvature", 45, 0, 100, p => ({x:100-p,y:0}))]),
  "sequential-access-storage": base("Sequential access storage", "Flowchart", ([t]) => `${ellipse(45,45,45,45)} M 45 90 L 100 90 L 100 ${90-t} L 75 ${90-t}`, [poi("tail", "Tail height", 10, 0, 90, p => ({x:100,y:90-p}), "y")]),
  "magnetic-disk": base("Magnetic disk", "Flowchart", ([d]) => cylinderPath(d), [poi("depth", "Cap depth", 15, 0, 30, p => ({x:0,y:p}), "y")]),
  "direct-access-storage": base("Direct access storage", "Flowchart", ([d]) => turn(cylinderPath(d), 1), [poi("depth", "Cap depth", 15, 0, 30, p => ({x:100-p,y:0}))]),
  "display": base("Display", "Flowchart", ([d]) => `M ${d} 0 L 80 0 C 100 0 100 100 80 100 L ${d} 100 L 0 50 Z`, [poi("point", "Point depth", 20, 0, 80, p => ({x:p,y:0}))]),
  "seal-1": base("Explosion 1", "Stars and banners", ([p]) => irregularStar(12,p,0), [poi("inner", "Inner radius", 26, 8, 38, p => ({x:50+p*Math.sin(Math.PI/12),y:50-p*Math.cos(Math.PI/12)}))]),
  "seal-2": base("Explosion 2", "Stars and banners", ([p]) => irregularStar(16,p,1), [poi("inner", "Inner radius", 32, 8, 38, p => ({x:50+p*Math.sin(Math.PI/16),y:50-p*Math.cos(Math.PI/16)}))]),
  "star-3": starPreset(3, 16),
  "star-4": starPreset(4, 12),
  "star-6": starPreset(6, 25),
  "star-7": starPreset(7, 30),
  "star-8": starPreset(8, 30),
  "star-10": starPreset(10, 34),
  "star-12": starPreset(12, 34),
  "star-16": starPreset(16, 36),
  "star-24": starPreset(24, 39),
  "star-32": starPreset(32, 41),
  "ribbon-up": ribbonPreset("Ribbon up", false, false),
  "ribbon-down": ribbonPreset("Ribbon down", true, false),
  "curved-ribbon-up": ribbonPreset("Curved ribbon up", false, true),
  "curved-ribbon-down": ribbonPreset("Curved ribbon down", true, true),
  "vertical-scroll": base("Vertical scroll", "Stars and banners", ([d]) => scrollPath(d), [poi("curl", "Curl depth", 10, 4, 18, p => ({x:80,y:p}), "y")]),
  "horizontal-scroll": base("Horizontal scroll", "Stars and banners", ([d]) => turn(scrollPath(d),1), [poi("curl", "Curl depth", 10, 4, 18, p => ({x:100-p,y:80}))]),
  "wave": base("Wave", "Stars and banners", ([d]) => `M 0 20 C 35 ${20-d} 65 ${20+d} 100 20 L 100 80 C 65 ${80+d} 35 ${80-d} 0 80 Z`, [poi("amplitude", "Wave amplitude", 30, 5, 45, p => ({x:25.46875,y:20-.28125*p}), "y")]),
  "double-wave": base("Double wave", "Stars and banners", ([d]) => `M 0 20 Q 12.5 ${20-d} 25 20 Q 37.5 ${20+d} 50 20 Q 62.5 ${20-d} 75 20 Q 87.5 ${20+d} 100 20 L 100 80 Q 87.5 ${80+d} 75 80 Q 62.5 ${80-d} 50 80 Q 37.5 ${80+d} 25 80 Q 12.5 ${80-d} 0 80 Z`, [poi("amplitude", "Wave amplitude", 25, 5, 40, p => ({x:12.5,y:20-p/2}), "y")]),
  "rectangular-callout": calloutPreset("Rectangular callout", "rectangle"),
  "rounded-rectangular-callout": calloutPreset("Rounded rectangular callout", "rounded"),
  "oval-callout": calloutPreset("Oval callout", "oval"),
  "cloud-callout": thoughtCalloutPreset,
  "line-callout-1": lineCalloutPreset("Line callout 1", false),
  "line-callout-2": lineCalloutPreset("Line callout 2", true),
} satisfies Record<string, GraphicShapePreset>

// Block arrows share three controls. A head's width is perpendicular to its
// direction, independently of where its base starts along the shaft.
type ArrowPoint = {x: number, y: number}
const arrowTurnPoint = (point: ArrowPoint, direction: number) => {
  let {x, y} = point
  for(let i = 0; i < direction; i++) [x, y] = [100-y, x]
  return {x, y}
}
const arrowControl = (name: string, label: string, value: number, min: number, max: number,
  point: (values: number[]) => ArrowPoint, axis: "x" | "y", direction: number): GraphicShapeAdjustment => ({
  name, label, default: value, min, max, axis: direction % 2 ? axis === "x" ? "y" : "x" : axis,
  point: values => arrowTurnPoint(point(values), direction),
})
const arrowPreset = (label: string, draw: (values: number[]) => string, values: [number, number, number],
  controls: [(values: number[]) => ArrowPoint, "x" | "y"][], direction = 0, normalized = false,
  limits?: (values: number[], index: number) => [number, number], extra?: GraphicShapeAdjustment): GraphicShapePreset => ({
  ...base(label, "Block arrows", values => turn(draw(values), direction), [
    arrowControl("shaft", "Shaft thickness", values[0], 0, 50, ...controls[0], direction),
    arrowControl("head-start", "Arrowhead start", values[1], 0, 100, ...controls[1], direction),
    arrowControl("head-width", "Arrowhead thickness", values[2], normalized ? 1 : 0, 100, ...controls[2], direction),
    ...(extra ? [extra] : []),
  ]),
  ...(normalized ? {normalizedAdjustment: "head-width"} : {}),
  adjustmentLimits: limits ?? (([shaft, , head], index) => index === 0 ? [0, head] : index === 2 ? [Math.max(normalized ? 1 : 0, shaft), 100] : index === 3 && extra ? [extra.min, extra.max] : [0, 100]),
})
const horizontalArrowControls: Parameters<typeof arrowPreset>[3] = [
  [([t]) => ({x: 0, y: 50-t}), "y"],
  [([t, s]) => ({x: s, y: 50-t}), "x"],
  [([, s, h]) => ({x: s, y: 50-h}), "y"],
]
const straightBlockArrow = (label: string, direction: number) => arrowPreset(label, ([t, s, h]) => polygon([
  [0,50-t],[s,50-t],[s,50-h],[100,50],[s,50+h],[s,50+t],[0,50+t],
]), [16,70,50], horizontalArrowControls, direction, true)
const doubleBlockArrow = (label: string, direction: number) => arrowPreset(label, ([t, d, h]) => polygon([
  [0,50],[d,50-h],[d,50-t],[100-d,50-t],[100-d,50-h],[100,50],[100-d,50+h],[100-d,50+t],[d,50+t],[d,50+h],
]), [16,25,50], [
  [([t]) => ({x:50,y:50-t}), "y"],
  [([t, d]) => ({x:d,y:50-t}), "x"],
  [([, d, h]) => ({x:d,y:50-h}), "y"],
], direction, true, ([t, , h], i) => i === 0 ? [0,h] : i === 1 ? [0,50] : [Math.max(1,t),100])
const multipleArrowControls: Parameters<typeof arrowPreset>[3] = [
  [([t, d]) => ({x:50+t,y:(d+50-t)/2}), "x"],
  [([t, d]) => ({x:50+t,y:d}), "y"],
  [([, d, h]) => ({x:50+h,y:d}), "x"],
]
const radialArrow = (values: number[], callout = false) => {
  const [t, d, h] = values
  const quarter = callout
    ? [[50,0],[50+h,d],[50+t,d],[50+t,30],[70,30],[70,50-t],[100-d,50-t],[100-d,50-h]]
    : [[50,0],[50+h,d],[50+t,d],[50+t,50-t],[100-d,50-t],[100-d,50-h]]
  const points: number[][] = []
  for(let direction = 0; direction < 4; direction++) for(const [x,y] of quarter) {
    const point = arrowTurnPoint({x,y}, direction)
    points.push([point.x,point.y])
  }
  return polygon(points)
}
const radialArrowLimits = ([t, d, h]: number[], i: number, callout = false): [number, number] => i === 0
  ? [0,Math.min(h,50-d,callout ? 20 : 50)] : i === 1 ? [0,Math.min(callout ? 30 : 50,50-h)] : [t,50-d]
const curvedBlockArrow = (label: string, direction: number) => arrowPreset(label, ([t, s, h]) =>
  `M 90 ${7-t} C ${-3-17*t/7} ${7-t} ${-3-17*t/7} ${75+t} ${s} ${75+t} L ${s} ${75+h} L 100 75 L ${s} ${75-h} L ${s} ${75-t} C ${-3+17*t/7} ${75-t} ${-3+17*t/7} ${7+t} 90 ${7+t} Z`,
[7,70,25], [
  [([t]) => ({x:90,y:7-t}), "y"],
  [([t, s]) => ({x:s,y:75-t}), "x"],
  [([, s, h]) => ({x:s,y:75-h}), "y"],
], direction, false, ([t, , h], i) => i === 0 ? [0,Math.min(20,h)] : i === 1 ? [0,100] : [t,50])
const elbowArrowControls: Parameters<typeof arrowPreset>[3] = [
  [([t]) => ({x:75+t,y:65}), "x"],
  [([t, d]) => ({x:75+t,y:d}), "y"],
  [([, d, h]) => ({x:75+h,y:d}), "x"],
]
const hiddenArrowParameter = (name: string, label: string, value: number, min: number, max: number): GraphicShapeAdjustment => ({
  name, label, default: value, min, max, axis: "x", hidden: true, point: () => ({x:0,y:0}),
})
const blockArrowCallout = (label: string, direction: number) => arrowPreset(label, ([t, s, h, b = 65]) => polygon([
  [0,0],[b,0],[b,50-t],[s,50-t],[s,50-h],[100,50],[s,50+h],[s,50+t],[b,50+t],[b,100],[0,100],
]), [10,80,25], [
  [([t, s, , b = 65]) => ({x:(b+s)/2,y:50-t}), "y"], ...horizontalArrowControls.slice(1),
], direction, false, ([t, s, h, b = 65], i) => i === 0 ? [0,Math.min(h,50)] : i === 1 ? [b,100] : i === 2 ? [t,50] : [0,s],
  hiddenArrowParameter("box", "Box width", 65, 0, 100))
const arrowPresets = {
  "left-arrow": straightBlockArrow("Left arrow", 2),
  "up-arrow": straightBlockArrow("Up arrow", 3),
  "down-arrow": straightBlockArrow("Down arrow", 1),
  "left-right-arrow": doubleBlockArrow("Left-right arrow", 0),
  "up-down-arrow": doubleBlockArrow("Up-down arrow", 1),
  "quad-arrow": arrowPreset("Quad arrow", values => radialArrow(values), [10,20,20], multipleArrowControls, 0, false, radialArrowLimits),
  "left-right-up-arrow": arrowPreset("Left-right-up arrow", ([t, d, h]) => polygon([
    [0,65],[d,65-h],[d,65-t],[50-t,65-t],[50-t,d],[50-h,d],[50,0],[50+h,d],[50+t,d],[50+t,65-t],[100-d,65-t],[100-d,65-h],[100,65],[100-d,65+h],[100-d,65+t],[d,65+t],[d,65+h],
  ]), [10,25,25], [
    [([t]) => ({x:50+t,y:40}), "x"], ...multipleArrowControls.slice(1),
  ], 0, false, ([t,d,h], i) => i === 0 ? [0,Math.min(h,50-d)] : i === 1 ? [0,Math.min(50,65-h)] : [t,65-d]),
  "bent-arrow": arrowPreset("Bent arrow", ([t, s, h]) =>
    `M ${10-t} 100 L ${10-t} 40 Q ${10-t} ${20-t} 30 ${20-t} L ${s} ${20-t} L ${s} ${25-h} L 100 25 L ${s} ${25+h} L ${s} ${20+t} L 30 ${20+t} Q ${10+t} ${20+t} ${10+t} 40 L ${10+t} 100 Z`,
  [10,70,25], [
    [([t]) => ({x:10-t,y:100}), "x"],
    [([t, s]) => ({x:s,y:20-t}), "x"],
    [([, s, h]) => ({x:s,y:25-h}), "y"],
  ], 0, false, ([t, , h], i) => i === 0 ? [0,Math.min(20,h-5)] : i === 1 ? [30,100] : [t+5,50]),
  "u-turn-arrow": arrowPreset("U-turn arrow", ([t, s, h]) =>
    `M ${9-t} 100 L ${9-t} 38 C ${9-t} ${-3-t} ${71+t} ${-3-t} ${71+t} 38 L ${71+t} ${s} L ${70+h} ${s} L 70 90 L ${70-h} ${s} L ${71-t} ${s} L ${71-t} 38 C ${71-t} ${-3+t} ${9+t} ${-3+t} ${9+t} 38 L ${9+t} 100 Z`,
  [9,60,30], [
    [([t]) => ({x:9-t,y:100}), "x"],
    [([t, s]) => ({x:71+t,y:s}), "y"],
    [([, s, h]) => ({x:70+h,y:s}), "x"],
  ], 0, false, ([t, , h], i) => i === 0 ? [0,Math.min(20,h-1)] : i === 1 ? [38,90] : [t+1,50]),
  "left-up-arrow": arrowPreset("Left-up arrow", ([t, d, h]) => polygon([
    [0,75],[d,75-h],[d,75-t],[75-t,75-t],[75-t,d],[75-h,d],[75,0],[75+h,d],[75+t,d],[75+t,75+t],[d,75+t],[d,75+h],
  ]), [10,25,25], elbowArrowControls, 0, false, ([t,d,h], i) => i === 0 ? [0,Math.min(h,75-d)] : i === 1 ? [0,75-h] : [t,75-d]),
  "bent-up-arrow": arrowPreset("Bent-up arrow", ([t, d, h]) => polygon([
    [0,90+t],[0,90-t],[75-t,90-t],[75-t,d],[75-h,d],[75,0],[75+h,d],[75+t,d],[75+t,90+t],
  ]), [10,25,25], [[([t]) => ({x:0,y:90-t}), "y"], ...elbowArrowControls.slice(1)]),
  "curved-left-arrow": curvedBlockArrow("Curved left arrow", 2),
  "curved-right-arrow": curvedBlockArrow("Curved right arrow", 0),
  "curved-up-arrow": curvedBlockArrow("Curved up arrow", 3),
  "curved-down-arrow": curvedBlockArrow("Curved down arrow", 1),
  "striped-right-arrow": arrowPreset("Striped right arrow", ([t, s, h]) =>
    `${polygon([[25,50-t],[s,50-t],[s,50-h],[100,50],[s,50+h],[s,50+t],[25,50+t]])} ${polygon([[0,50-t],[5,50-t],[5,50+t],[0,50+t]])} ${polygon([[12,50-t],[19,50-t],[19,50+t],[12,50+t]])}`,
  [15,70,50], [[([t]) => ({x:25,y:50-t}), "y"], ...horizontalArrowControls.slice(1)], 0, true,
  ([t, , h], i) => i === 0 ? [0,h] : i === 1 ? [25,100] : [Math.max(1,t),100]),
  "notched-right-arrow": arrowPreset("Notched right arrow", ([t, s, h, notch = 15]) => polygon([
    [0,50-t],[s,50-t],[s,50-h],[100,50],[s,50+h],[s,50+t],[0,50+t],[notch,50],
  ]), [20,65,50], horizontalArrowControls, 0, true, undefined, hiddenArrowParameter("notch", "Notch depth", 15, 3, 40)),
  "home-plate": arrowPreset("Pentagon arrow", ([t, s, h]) => polygon([
    [0,50-t],[s,50-h],[100,50],[s,50+h],[0,50+t],
  ]), [50,70,50], [horizontalArrowControls[0], [([, s, h]) => ({x:s,y:50+h}), "x"], horizontalArrowControls[2]], 0, true),
  "chevron": arrowPreset("Chevron", ([t, s, h, notch = 30]) => polygon([
    [0,50-t],[s,50-t],[s,50-h],[100,50],[s,50+h],[s,50+t],[0,50+t],[notch,50],
  ]), [50,70,50], horizontalArrowControls, 0, true, undefined, hiddenArrowParameter("notch", "Notch depth", 30, 5, 48)),
  "right-arrow-callout": blockArrowCallout("Right arrow callout", 0),
  "down-arrow-callout": blockArrowCallout("Down arrow callout", 1),
  "left-arrow-callout": blockArrowCallout("Left arrow callout", 2),
  "up-arrow-callout": blockArrowCallout("Up arrow callout", 3),
  "left-right-arrow-callout": arrowPreset("Left-right arrow callout", ([t,d,h,b = 30]) => polygon([
    [0,50],[d,50-h],[d,50-t],[b,50-t],[b,15],[100-b,15],[100-b,50-t],[100-d,50-t],[100-d,50-h],[100,50],[100-d,50+h],[100-d,50+t],[100-b,50+t],[100-b,85],[b,85],[b,50+t],[d,50+t],[d,50+h],
  ]), [8,18,20], [
    [([t, d, , b = 30]) => ({x:(b+d)/2,y:50-t}), "y"],
    [([t, d]) => ({x:d,y:50-t}), "x"],
    [([, d, h]) => ({x:d,y:50-h}), "y"],
  ], 0, false, ([t,d,h,b = 30], i) => i === 0 ? [0,Math.min(h,35)] : i === 1 ? [0,b] : i === 2 ? [t,50] : [d,50],
    hiddenArrowParameter("box", "Box inset", 30, 0, 50)),
  "quad-arrow-callout": arrowPreset("Quad arrow callout", values => radialArrow(values, true), [7,18,20], [
    [([t, d]) => ({x:50+t,y:(d+30)/2}), "x"], ...multipleArrowControls.slice(1),
  ], 0, false, (values, index) => radialArrowLimits(values, index, true)),
  "circular-arrow": arrowPreset("Circular arrow", ([t, s, h]) =>
    `M ${16-t} 70 C ${1-t} 30 ${21-t} ${6-t} 50 ${6-t} C 75 ${6-t} ${89+t} ${26-t} ${89+t} ${s} L ${85+h} ${s} L 85 68 L ${85-h} ${s} L ${89-t} ${s} C ${89-t} ${26+t} 75 ${6+t} 50 ${6+t} C ${21+t} ${6+t} ${1+t} 30 ${16+t} 70 Z`,
  [6,45,17.5], [
    [([t]) => ({x:50,y:6-t}), "y"],
    [([t, s]) => ({x:89+t,y:s}), "y"],
    [([, s, h]) => ({x:85+h,y:s}), "x"],
  ], 0, false, ([t, , h], i) => i === 0 ? [0,Math.min(15,h-4)] : i === 1 ? [0,68] : [t+4,45]),
} satisfies Record<string, GraphicShapePreset>

type ArrowPresetType = keyof typeof arrowPresets
const upgradeArrowValues: Record<ArrowPresetType, (values: number[]) => number[]> = {
  "left-arrow": ([d]) => [16,100-d,50], "up-arrow": ([d]) => [16,100-d,50], "down-arrow": ([d]) => [16,100-d,50],
  "left-right-arrow": ([d]) => [16,d,50], "up-down-arrow": ([d]) => [16,d,50],
  "quad-arrow": ([t]) => [t,20,20], "left-right-up-arrow": ([t]) => [t,25,25],
  "bent-arrow": ([t]) => [t/2,70,25], "u-turn-arrow": ([t]) => [t/2,60,30],
  "left-up-arrow": ([t]) => [10+t/2,25,25], "bent-up-arrow": ([t]) => [t/2,25,25],
  "curved-left-arrow": ([t]) => [t/2,70,25], "curved-right-arrow": ([t]) => [t/2,70,25],
  "curved-up-arrow": ([t]) => [t/2,70,25], "curved-down-arrow": ([t]) => [t/2,70,25],
  "striped-right-arrow": ([d]) => [15,100-d,50], "notched-right-arrow": ([d]) => [20,65,50,d],
  "home-plate": ([d]) => [50,100-d,50], "chevron": ([d]) => [50,100-d,50,d],
  "right-arrow-callout": ([b]) => [10,80,25,b], "down-arrow-callout": ([b]) => [10,80,25,b],
  "left-arrow-callout": ([b]) => [10,80,25,b], "up-arrow-callout": ([b]) => [10,80,25,b],
  "left-right-arrow-callout": ([b]) => [8,18,20,b], "quad-arrow-callout": ([t]) => [t,18,20],
  "circular-arrow": ([t]) => [t/2,45,17.5],
}
export const legacyArrowPresets = Object.fromEntries((Object.keys(arrowPresets) as ArrowPresetType[]).map(type => [type, {
  definition: originalGraphicShapePresets[type], upgrade: upgradeArrowValues[type],
}])) as Partial<Record<keyof typeof originalGraphicShapePresets, {definition: GraphicShapePreset, upgrade: (values: number[]) => number[]}>>
export const graphicShapePresets = {...originalGraphicShapePresets, ...arrowPresets} satisfies Record<string, GraphicShapePreset>
