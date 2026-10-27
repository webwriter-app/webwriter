import type {DOMEditor} from "../src/domeditor"
import {cloneWithoutEditorMarkers} from "../src/utility"

const assert=(condition:unknown,message:string)=>{if(!condition) throw new Error(message)}

export type GraphicLabelResizeProfile={
  first:{elapsedMs:number,measurements:number}
  warm:{elapsedMs:number,measurements:number}
}

/** Profiles real native SVG resize previews while verifying warm glyph metrics
 * are reused and the authored shape changes only at commit. */
export async function checkGraphicLabelResizePerformance():Promise<GraphicLabelResizeProfile> {
  const frame=document.createElement("iframe")
  frame.style.cssText="width:900px;height:650px;border:0;max-width:none"
  frame.srcdoc='<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view=frame.contentWindow as Window & typeof globalThis & {editor?:DOMEditor,editorError?:string}
  const counters={getSubStringLength:0,getStartPositionOfChar:0,getEndPositionOfChar:0,getBBox:0}
  const restore:Array<()=>void>=[]
  try {
    for(let attempt=0;!view.editor && !view.editorError && attempt<250;attempt++) await new Promise(resolve=>setTimeout(resolve,20))
    assert(view.editor,view.editorError ?? "Label resize fixture did not initialize")
    const editor=view.editor!,doc=frame.contentDocument!
    const layout=async()=>{
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))
    }
    const patch=(prototype:object,name:keyof typeof counters)=>{
      const own=Object.getOwnPropertyDescriptor(prototype,name)
      const original=(prototype as Record<string,unknown>)[name]
      if(typeof original!=="function") return
      Object.defineProperty(prototype,name,{...(own??{}),configurable:true,writable:true,value:function(this:SVGTextContentElement,...args:unknown[]) {
        counters[name]++
        return original.apply(this,args)
      }})
      restore.push(()=>own ? Object.defineProperty(prototype,name,own) : delete (prototype as Record<string,unknown>)[name])
    }
    const textPrototype=view.SVGTextElement.prototype
    const graphicsPrototype=view.SVGGraphicsElement.prototype
    for(const name of ["getSubStringLength","getStartPositionOfChar","getEndPositionOfChar"] as const) patch(textPrototype,name)
    patch(graphicsPrototype,"getBBox")
    editor.features.graphic.actions.insertGraphic({type:"insertGraphic"})
    const graphic=doc.querySelector("svg")!
    graphic.setAttribute("viewBox","0 0 800 500")
    Object.assign(graphic.style,{width:"800px",height:"500px"})
    editor.features.selection.captureElement(graphic)
    editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:"rectangle"})
    editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"width",value:"280"})
    editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"height",value:"160"})
    const content="A long rich label with Unicode: naïve café, 👩‍💻😀 é, مرحبًا بالعالم, 漢字, and repeated words for wrapping. ".repeat(5)
    editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"label",value:content})
    await layout()
    const shape=graphic.querySelector("g")!
    const text=shape.querySelector("text")!
    text.innerHTML=`<tspan>${content.slice(0,170)}</tspan><tspan font-weight="700">${content.slice(170,310)}</tspan><tspan>${content.slice(310)}</tspan>`
    await layout()
    editor.doc.syncFromDOM()
    assert(text.textContent===content,"fixture rich text content was altered")
    const authored=()=> (cloneWithoutEditorMarkers(shape,true) as Element).outerHTML
    const original=authored()
    const resize=async(cancel:boolean):Promise<{elapsedMs:number,measurements:number}>=>{
      const before=counters.getSubStringLength+counters.getStartPositionOfChar+counters.getEndPositionOfChar+counters.getBBox
      const east=editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-e"]')!
      assert(east,"rectangle is missing east resize handle")
      const box=east.getBoundingClientRect(),start={x:box.x+box.width/2,y:box.y+box.height/2}
      const pointer={bubbles:true,composed:true,button:0,pointerId:114,altKey:true}
      editor.doc.stopCapturing()
      const started=view.performance.now()
      east.dispatchEvent(new view.PointerEvent("pointerdown",{...pointer,clientX:start.x,clientY:start.y}))
      for(let index=1;index<=20;index++) {
        doc.dispatchEvent(new view.PointerEvent("pointermove",{...pointer,buttons:1,clientX:start.x+index*4,clientY:start.y}))
        await layout()
      }
      const preview=editor.appendix.querySelector<SVGGElement>(".◆graphic-preview")
      assert(preview,"resize did not create a preview")
      assert(authored()===original,"resize preview mutated authored label or shape")
      if(cancel) {
        doc.dispatchEvent(new view.PointerEvent("pointercancel",pointer))
        await layout()
        assert(authored()===original,"cancelled resize changed authored DOM")
        assert(!editor.appendix.querySelector(".◆graphic-preview"),"cancelled resize left preview UI")
      }
      else {
        doc.dispatchEvent(new view.PointerEvent("pointerup",{...pointer,clientX:start.x+80,clientY:start.y}))
        await layout()
        assert(authored()!==original,"committed resize did not update the shape")
      }
      const elapsedMs=view.performance.now()-started
      const after=counters.getSubStringLength+counters.getStartPositionOfChar+counters.getEndPositionOfChar+counters.getBBox
      return {elapsedMs,measurements:after-before}
    }
    const first=await resize(false)
    editor.doc.undo();await layout()
    assert(authored()===original,"undo did not restore the authored label and geometry")
    const warm=await resize(false)
    assert(warm.measurements<first.measurements*.25,`warm resize repeated native glyph measurements (${warm.measurements} vs ${first.measurements})`)
    editor.doc.undo();await layout()
    assert(authored()===original,"second undo did not restore authored DOM")
    await resize(true)
    assert(authored()===original,"cancelled resize did not preserve authored DOM")
    assert(text.textContent===content,"resize changed authored rich label text")
    assert(!editor.toHTML(true).includes("◆"),"resize markers leaked into serialized HTML")
    return {first,warm}
  }
  finally {
    restore.reverse().forEach(undo=>undo())
    view.editor?.destroy();frame.remove()
  }
}
