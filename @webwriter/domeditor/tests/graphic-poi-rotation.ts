import type {DOMEditor} from "../src/domeditor"
import {graphicPathGeometry, graphicShapeGeometry} from "../src/graphic"
import {readGraphicPreset} from "../src/graphic-shapes"

const assert=(condition:unknown,message:string)=>{if(!condition) throw new Error(message)}

export async function checkGraphicPOIRotation() {
  const frame=document.createElement("iframe")
  frame.style.cssText="width:1000px;height:750px;border:0;max-width:none"
  frame.srcdoc='<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view=frame.contentWindow as Window & typeof globalThis & {editor?:DOMEditor,editorError?:string}
  try {
    for(let attempt=0;!view.editor && !view.editorError && attempt<250;attempt++) await new Promise(resolve=>setTimeout(resolve,20))
    assert(view.editor,view.editorError ?? "Rotated POI fixture did not initialize")
    const editor=view.editor!,doc=frame.contentDocument!
    const layout=async()=>{
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))
    }
    const screenPoints=(shape:SVGGraphicsElement)=>{
      const geometry=graphicShapeGeometry(shape)!,preset=readGraphicPreset(geometry)
      const bounds=preset?.type==="square-rectangle" ? preset.bounds : null
      const points=(bounds ? [{x:bounds.x,y:bounds.y},{x:bounds.x+bounds.width,y:bounds.y},{x:bounds.x+bounds.width,y:bounds.y+bounds.height},{x:bounds.x,y:bounds.y+bounds.height}]
        : graphicPathGeometry(geometry)?.points) ?? (geometry.localName==="line"
        ? [1,2].map(i=>({x:Number(geometry.getAttribute(`x${i}`)),y:Number(geometry.getAttribute(`y${i}`))}))
        : geometry.getAttribute("points")!.split(/\s+/).map(pair=>{const [x,y]=pair.split(",").map(Number);return {x,y}}))
      return points.map(({x,y})=>new view.DOMPoint(x,y).matrixTransform(geometry.getScreenCTM()!))
    }
    const near=(actual:DOMPoint[],expected:{x:number,y:number}[],message:string)=>{
      assert(actual.length===expected.length,`${message}: point count changed`)
      actual.forEach((point,index)=>assert(Math.hypot(point.x-expected[index].x,point.y-expected[index].y)<.15,`${message}: point ${index} shifted by ${Math.hypot(point.x-expected[index].x,point.y-expected[index].y)}px`))
    }
    for(const standalone of [false,true]) for(const rotation of [35,90,-40]) for(const [type,name] of [["square-rectangle","path-point-0"],["hexagon","vertex-0"],["line","line-start"],["bezier","path-point-1"]] as const) {
      doc.querySelector("svg")?.remove()
      editor.features.graphic.actions.insertGraphic({type:"insertGraphic",...(standalone ? {shape:type} : {})})
      if(!standalone) editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:type})
      let graphic=doc.querySelector("svg")!,shape=editor.features.graphic.selectedShape!
      editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"rotation",value:String(rotation)})
      await layout()
      const label=`${type}/${rotation}/${standalone ? "standalone" : "canvas"}`,pointIndex=name==="path-point-1" ? 1 : 0
      const original=screenPoints(shape)
      if(!standalone) {
        doc.dispatchEvent(new view.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}))
        assert(!editor.features.graphic.selectedShapes.length,`${label}: shape did not deselect`)
        const box=shape.getBoundingClientRect(),pointer={bubbles:true,composed:true,button:0,pointerId:86}
        graphic.dispatchEvent(new view.PointerEvent("pointerdown",{...pointer,clientX:box.left-15,clientY:box.top-15}))
        doc.dispatchEvent(new view.PointerEvent("pointermove",{...pointer,buttons:1,clientX:box.right+15,clientY:box.bottom+15}))
        doc.dispatchEvent(new view.PointerEvent("pointerup",pointer))
        await layout()
        assert(editor.features.graphic.selectedShape===shape && editor.features.graphic.selectedShapes.length===1,`${label}: box selection did not select the single shape`)
        const handles=[...editor.appendix.querySelectorAll<HTMLElement>(".◆graphic-specific-handles .◆graphic-handle")]
        assert(handles.length>0 && handles.every(handle=>!handle.hidden && handle.getBoundingClientRect().width>0),`${label}: box selection lost its visible POIs`)
        assert(!editor.features.graphic.textEditingRange,`${label}: box selection entered text editing`)
      }
      const drag=async(outcome:"commit"|"cancel")=>{
        const before=screenPoints(shape),handle=editor.appendix.querySelector<HTMLElement>(`[data-graphic-handle="${name}"]`)!
        assert(handle,`${label}: missing POI`)
        const box=handle.getBoundingClientRect(),start={x:box.x+box.width/2,y:box.y+box.height/2}
        const pointer={bubbles:true,composed:true,button:0,pointerId:84}
        handle.dispatchEvent(new view.PointerEvent("pointerdown",{...pointer,clientX:start.x,clientY:start.y}))
        let expected=before.map(({x,y})=>({x,y}))
        for(const [dx,dy] of [[-160,-110],[-210,-140]]) {
          expected=before.map(({x,y},index)=>index!==pointIndex ? {x,y} : {x:start.x+dx,y:start.y+dy})
          doc.dispatchEvent(new view.PointerEvent("pointermove",{...pointer,buttons:1,altKey:true,clientX:start.x+dx,clientY:start.y+dy}))
          await layout()
          const preview=editor.appendix.querySelector<SVGGraphicsElement>(".◆graphic-preview > :not(defs)")!
          assert(preview,`${label}: missing preview`)
          near(screenPoints(preview),expected,`${label}/${outcome}: preview`)
          near(screenPoints(shape),before,`${label}: preview mutated source`)
        }
        doc.dispatchEvent(new view.PointerEvent(outcome==="commit" ? "pointerup" : "pointercancel",pointer))
        await layout()
        near(screenPoints(shape),outcome==="commit" ? expected : before,`${label}/${outcome}`)
        assert(!editor.appendix.querySelector(".◆graphic-preview"),`${label}: preview leaked`)
      }
      await drag("cancel")
      await drag("commit")
      const committed=screenPoints(shape)
      editor.doc.stopCapturing();editor.doc.undo();await layout()
      graphic=doc.querySelector("svg")!;shape=graphic.querySelector<SVGGraphicsElement>("path,polygon,line")!
      near(screenPoints(shape),original,`${label}: undo`)
      editor.doc.redo();await layout()
      graphic=doc.querySelector("svg")!;shape=graphic.querySelector<SVGGraphicsElement>("path,polygon,line")!
      near(screenPoints(shape),committed,`${label}: redo`)
      // Re-select current DOM nodes, then continue editing the expanded shape.
      shape.dispatchEvent(new view.PointerEvent("pointerdown",{bubbles:true,button:0,pointerId:85}))
      doc.dispatchEvent(new view.PointerEvent("pointerup",{bubbles:true,button:0,pointerId:85}))
      await drag("commit")
      assert(!editor.toHTML(true).includes("◆"),`${label}: editor marker serialized`)
    }
  }
  finally {view.editor?.destroy();frame.remove()}
}
