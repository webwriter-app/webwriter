import type {DOMEditor} from "../src/domeditor"
import {graphicShapeGeometry} from "../src/graphic"
const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)}

export async function checkGraphicLabels() {
  const frame=document.createElement("iframe")
  frame.style.cssText="width:1000px;height:700px;border:0;max-width:none"
  frame.srcdoc='<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view=frame.contentWindow as Window & typeof globalThis & {editor?:DOMEditor,editorError?:string}
  try {
    for(let i=0;!view.editor&&!view.editorError&&i<250;i++)await new Promise(resolve=>setTimeout(resolve,20))
    assert(view.editor,view.editorError??"Label fixture did not initialize")
    const editor=view.editor!,doc=frame.contentDocument!
    const layout=async()=>{await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()));await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))}
    editor.features.graphic.actions.insertGraphic({type:"insertGraphic"})
    const graphic=doc.querySelector("svg")!
    graphic.setAttribute("viewBox","0 0 1000 600");Object.assign(graphic.style,{width:"900px",height:"540px"})
    const content="Shape labels wrap within the shape and shrink when necessary. The geometry and the chosen font remain unchanged, and the label remains fully readable."
    for(const type of ["rectangle","ellipse","diamond","heart","right-arrow-callout","left-right-up-arrow","cube"] as const) {
      graphic.replaceChildren(doc.createComment("keep"));editor.features.selection.captureElement(graphic)
      editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:type})
      const set=(name:string,value:string)=>editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name,value})
      set("width","340");set("height","180");set("x","200");set("y","180")
      const original=editor.features.graphic.selectedShape!,geometry=graphicShapeGeometry(original)!
      const geometryState=()=>JSON.stringify(["d","points","x","y","width","height","cx","cy","r","rx","ry"].map(name=>geometry.getAttribute(name)))
      const before=geometryState()
      set("label",content)
      await layout()
      const group=editor.features.graphic.selectedShape!,text=group.querySelector("text")!
      const check=(label:string)=>{
        const box=geometry.getBBox(),glyphs=text.getBBox()
        const relative=DOMMatrix.fromMatrix(geometry.getScreenCTM()!).inverse().multiply(DOMMatrix.fromMatrix(text.getScreenCTM()!))
        for(const [x,y] of [[glyphs.x,glyphs.y],[glyphs.x+glyphs.width,glyphs.y+glyphs.height]]) {
          const point=relative.transformPoint(new DOMPoint(x,y))
          assert(point.x>=box.x-1 && point.x<=box.x+box.width+1 && point.y>=box.y-1 && point.y<=box.y+box.height+1,`${type}/${label}: label escapes shape bounds`)
        }
        const center=relative.transformPoint(new DOMPoint(glyphs.x+glyphs.width/2,glyphs.y+glyphs.height/2))
        assert(Math.abs(center.x-box.x-box.width/2)<2 && Math.abs(center.y-box.y-box.height/2)<2,`${type}/${label}: fitted label is not centered`)
        assert(text.textContent===content,`${type}/${label}: wrapping changed source text`)
      }
      check("default")
      assert(geometryState()===before,`${type}: labeling changed geometry`)
      assert(new Set(text.getAttribute("y")!.split(/\s+/)).size>1,`${type}: label did not wrap`)
      assert(Number(text.style.scale)<1,`${type}: tall text did not shrink`)
      assert(text.getAttribute("font-size")==="48",`${type}: fitting replaced chosen font size`)
      set("width","520");set("height","700")
      await layout();check("expanded")
      assert(!text.style.scale,`${type}: label did not relax its scale when enlarged (${text.style.scale}, ${JSON.stringify(geometry.getBBox())}, ${JSON.stringify(text.getBBox())})`)
      const bold=doc.createElementNS("http://www.w3.org/2000/svg","tspan"),link=doc.createElementNS("http://www.w3.org/2000/svg","a")
      bold.setAttribute("font-weight","700");bold.textContent=content.slice(0,30)
      link.setAttribute("href","https://example.test/");link.textContent=content.slice(30)
      text.replaceChildren(bold,link)
      const node=link.firstChild!
      doc.getSelection()!.setBaseAndExtent(node,3,node,8)
      await layout();check("rich")
      assert(text.firstChild===bold && text.lastChild===link && link.firstChild===node,`${type}: layout rebuilt rich runs`)
      assert(doc.getSelection()!.anchorNode===node && doc.getSelection()!.focusNode===node,`${type}: layout replaced selection endpoints`)
      editor.features.selection.captureElement(graphic)
      editor.features.graphic.actions.manageGraphicLayer({type:"manageGraphicLayer",operation:"select",index:0})
      set("rotation","35")
      await layout();check("rotated")
      set("font-size","72")
      await layout();check("larger font")
      assert(text.getAttribute("font-size")==="72",`${type}: fitting changed the chosen font`)
      set("width","280");set("height","120")
      await layout();check("narrowed")
      const oldCap=text.style.inlineSize
      editor.doc.stopCapturing()
      set("width","450")
      await layout();check("width edit")
      editor.doc.undo();await layout()
      assert(text.style.inlineSize===oldCap,`${type}: undo did not restore label wrap width`)
      editor.doc.redo();await layout();check("redo")
      assert(!editor.toHTML(true).includes("◆"),`${type}: label serialized editing artifacts`)
    }
    graphic.replaceChildren();editor.features.selection.captureElement(graphic)
    editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:"rectangle"})
    editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"width",value:"260"})
    editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"height",value:"120"})
    const rectangle=graphic.querySelector("rect")!
    rectangle.dispatchEvent(new view.MouseEvent("dblclick",{bubbles:true,button:0}))
    const proxy=editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
    assert(proxy,"label did not enter editing")
    for(const character of content) {
      doc.execCommand("insertText",false,character)
      assert(editor.features.graphic.isTextInputFocused,"wrapping lost native typing focus")
    }
    await layout()
    const text=graphic.querySelector("text")!
    assert(text.textContent===content && Number(text.style.scale)<1,"native typing did not wrap and fit")
    assert(editor.features.selection.captureSelectedElement===graphic,"native wrapped label lost capture")
    proxy.dispatchEvent(new view.KeyboardEvent("keydown",{bubbles:true,cancelable:true,key:"Escape"}))
    const original=rectangle.outerHTML
    editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"label",value:"Short"})
    await layout()
    assert(!text.style.scale && rectangle.outerHTML===original,"short label did not regain font size or changed geometry")
    editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"label",value:content})
    await layout()
    const width=rectangle.getAttribute("width"),scale=text.style.scale
    editor.doc.stopCapturing()
    const east=editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-e"]')!,box=east.getBoundingClientRect()
    const pointer={bubbles:true,composed:true,button:0,pointerId:109,altKey:true}
    const start={clientX:box.x+box.width/2,clientY:box.y+box.height/2}
    east.dispatchEvent(new view.PointerEvent("pointerdown",{...pointer,...start}))
    doc.dispatchEvent(new view.PointerEvent("pointermove",{...pointer,buttons:1,clientX:start.clientX+120,clientY:start.clientY}))
    await layout()
    const preview=editor.appendix.querySelector(".◆graphic-preview text") as SVGTextElement
    assert(preview && Number(preview.style.scale || 1)>Number(scale || 1),"resize preview did not relax label scaling")
    const previewScale=preview.style.scale
    assert(rectangle.getAttribute("width")===width && text.style.scale===scale,"preview changed authored label or shape")
    doc.dispatchEvent(new view.PointerEvent("pointerup",{...pointer,clientX:start.clientX+120,clientY:start.clientY}))
    await layout()
    assert(Number(rectangle.getAttribute("width"))>Number(width) && text.style.scale===previewScale,"resize commit differs from its label preview")
    editor.doc.undo();await layout()
    assert(rectangle.getAttribute("width")===width && text.style.scale===scale,`resize undo lost label fit (${rectangle.getAttribute("width")}/${width}, ${text.style.scale}/${scale})`)
    assert(!editor.toHTML(true).includes("◆"),"native labels serialized UI")
  }
  finally {view.editor?.destroy();frame.remove()}
}
