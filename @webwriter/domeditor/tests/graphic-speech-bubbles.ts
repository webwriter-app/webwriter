import type {DOMEditor} from "../src/domeditor"
import {graphicPresetPath, readGraphicPreset, writeGraphicPreset} from "../src/graphic-shapes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

export async function checkGraphicSpeechBubbles() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:650px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?:DOMEditor,editorError?:string}
  try {
    for(let attempt=0;!view.editor && !view.editorError && attempt<250;attempt++) await new Promise(resolve=>setTimeout(resolve,20))
    assert(view.editor,view.editorError ?? "Speech bubble fixture did not initialize")
    const editor=view.editor!,doc=frame.contentDocument!
    const layout=async()=>{
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))
    }
    editor.features.graphic.actions.insertGraphic({type:"insertGraphic"})
    const graphic=doc.querySelector("svg")!
    graphic.setAttribute("viewBox","0 0 800 500")
    Object.assign(graphic.style,{width:"800px",height:"500px"})
    const bounds={x:200,y:140,width:320,height:190}
    const targets=[[50,-20],[-20,38],[120,38],[50,100],[120,90]]
    const measurement=doc.createElementNS("http://www.w3.org/2000/svg","svg")
    measurement.style.cssText="position:fixed;width:1px;height:1px;opacity:0;pointer-events:none"
    const probe=doc.createElementNS(measurement.namespaceURI,"path") as SVGPathElement
    probe.setAttribute("fill","none");probe.setAttribute("stroke","black");probe.setAttribute("stroke-width",".15");probe.setAttribute("stroke-linecap","round")
    probe.setAttribute("stroke-linejoin","round")
    measurement.append(probe);editor.appendix.append(measurement)
    const numbers=(value:string)=>value.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!.map(Number)
    const same=(actual:string,expected:string)=>{
      const a=numbers(actual),b=numbers(expected)
      return a.length===b.length && a.every((value,index)=>Math.abs(value-b[index])<.0001)
    }
    for(const type of ["rectangular-callout","rounded-rectangular-callout","oval-callout","cloud-callout","line-callout-1","line-callout-2"] as const) {
      for(const rotation of [0,35]) for(const [tipX,tipY] of targets) {
        graphic.replaceChildren(doc.createComment("preserve sibling"))
        editor.features.selection.captureElement(graphic)
        editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:type})
        const shape=editor.features.graphic.selectedShape!
        writeGraphicPreset(shape,readGraphicPreset(shape)!,bounds)
        editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"rotation",value:String(rotation)})
        const state=readGraphicPreset(shape)!
        editor.features.selection.captureElement(graphic)
        await layout()
        const original=shape.getAttribute("d")!
        const handle=editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="adjust-end-x"]')!
        assert(handle,`${type}: missing connector tip handle`)
        const box=handle.getBoundingClientRect()
        const local=new view.DOMPoint(box.x+box.width/2,box.y+box.height/2).matrixTransform(shape.getScreenCTM()!.inverse())
        probe.setAttribute("d",original)
        assert(editor.appendix.querySelectorAll(".◆graphic-specific-handles button").length===2,`${type}: expected one tip and one roundness POI`)
        assert(!editor.appendix.querySelector('[data-graphic-handle="adjust-start-x"]'),`${type}: connector start still has a POI`)
        assert(probe.isPointInStroke(local),`${type}: visible connector handle is off the authored contour`)

        const values=[...state.values]; values[0]=tipX;values[1]=tipY
        const point=state.definition.adjustments[0].point(values)
        const target={x:bounds.x+point.x/100*bounds.width,y:bounds.y+point.y/100*bounds.height}
        const destination=new view.DOMPoint(target.x,target.y).matrixTransform(shape.getScreenCTM()!)
        const pointer={bubbles:true,composed:true,button:0,pointerId:97}
        editor.doc.stopCapturing()
        handle.dispatchEvent(new view.PointerEvent("pointerdown",{...pointer,clientX:box.x+box.width/2,clientY:box.y+box.height/2}))
        doc.dispatchEvent(new view.PointerEvent("pointermove",{...pointer,buttons:1,clientX:destination.x,clientY:destination.y}))
        await layout()
        assert(shape.getAttribute("d")===original,`${type}/${tipX}/${tipY}: preview mutated source geometry`)
        const preview=editor.appendix.querySelector<SVGPathElement>(".◆graphic-preview path")!
        assert(preview,`${type}: missing preview`)
        const expected=graphicPresetPath(type,bounds,values),actual=preview.getAttribute("d")!
        assert(same(actual,expected),`${type}/${tipX}/${tipY}: preview differs from the requested tip geometry`)
        doc.dispatchEvent(new view.PointerEvent("pointerup",{...pointer,clientX:destination.x,clientY:destination.y}))
        await layout()
        assert(same(shape.getAttribute("d")!,expected),`${type}: commit differs from preview`)
        editor.doc.stopCapturing();editor.doc.undo();await layout()
        assert(graphic.querySelector("path")!.getAttribute("d")===original,`${type}: undo failed`)
        assert(graphic.firstChild?.nodeType===Node.COMMENT_NODE,`${type}: authored sibling was lost`)
        assert(!editor.toHTML(true).includes("◆"),`${type}: editor artifact serialized`)
      }
    }
  }
  finally { view.editor?.destroy();frame.remove() }
}
