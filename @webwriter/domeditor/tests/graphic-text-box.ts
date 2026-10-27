import type {DOMEditor} from "../src/domeditor"
import {readGraphicPreset} from "../src/graphic-shapes"

const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)}
const near=(a:number,b:number,message:string)=>assert(Math.abs(a-b)<.02,`${message}: ${a} / ${b}`)

export async function checkGraphicTextBox() {
  const frame=document.createElement("iframe")
  frame.style.cssText="width:1000px;height:700px;border:0;max-width:none"
  frame.srcdoc='<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view=frame.contentWindow as Window & typeof globalThis & {editor?:DOMEditor,editorError?:string}
  try {
    for(let i=0;!view.editor&&!view.editorError&&i<250;i++)await new Promise(resolve=>setTimeout(resolve,20))
    assert(view.editor,view.editorError??"Text box fixture did not initialize")
    const editor=view.editor!,doc=frame.contentDocument!
    const layout=async()=>{await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()));await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))}
    editor.features.graphic.actions.insertGraphic({type:"insertGraphic"})
    const graphic=doc.querySelector("svg")!
    graphic.setAttribute("viewBox","0 0 1000 700")
    Object.assign(graphic.style,{width:"900px",height:"630px"})
    editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:"text-box"})
    const shape=editor.features.graphic.selectedShape!,path=shape.querySelector("path")!,text=shape.querySelector("text")!
    const bounds=()=>readGraphicPreset(path)!.bounds
    const center={x:bounds().x+bounds().width/2,y:bounds().y+bounds().height/2}
    const set=(name:string,value:string)=>editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name,value})
    const check=(label:string)=>{
      const box=bounds(),glyphs=text.getBBox()
      assert(box.width>0 && box.height>0 && box.width<=496.02,`${label}: text box exceeds its content cap`)
      assert(glyphs.x>=box.x-1 && glyphs.y>=box.y-1 && glyphs.x+glyphs.width<=box.x+box.width+1 && glyphs.y+glyphs.height<=box.y+box.height+1,`${label}: native glyph bounds escape fitted contour (${JSON.stringify({box,glyphs:{x:glyphs.x,y:glyphs.y,width:glyphs.width,height:glyphs.height}})})`)
      assert(path.getAttribute("fill")==="none" && path.getAttribute("stroke")==="none",`${label}: added background/border`)
      assert(!editor.appendix.querySelector(".◆graphic-measurement"),`${label}: measurement leaked`)
    }
    check("initial")
    const short=bounds()
    assert(short.width<200 && short.height<100,"initial text field is still a large fixed box")
    const content="The text box should grow with its content and wrap cleanly into several lines without changing the actual text."
    set("label",content)
    await layout()
    check("wrapped")
    assert(bounds().height>short.height*2,"long text did not grow vertically")
    assert(text.textContent===content,"soft wrapping changed text content")
    assert(new Set(text.getAttribute("y")!.split(/\s+/)).size>2,"text did not wrap into multiple native baselines")
    near(bounds().x+bounds().width/2,center.x,"growth changed horizontal center")
    near(bounds().y+bounds().height/2,center.y,"growth changed vertical center")
    set("label","Supercalifragilisticexpialidocious".repeat(4))
    await layout();check("long word")
    set("label","A😀 e\u0301 family 👩‍👩‍👧‍👧, punctuation, and CJK 文字の折り返し ".repeat(5))
    await layout();check("unicode")
    set("label","English mixed with שלום עולם, مرحبا بالعالم and more text. ".repeat(4))
    await layout();check("bidirectional text")
    set("label","First\nSecond")
    await layout();check("hard break")
    assert(text.textContent==="First\nSecond","hard line break was lost")
    set("label","X")
    const smaller=bounds()
    assert(smaller.width<short.width,"box did not shrink with content")
    set("font-size","72")
    assert(bounds().height>smaller.height,"font-size did not resize field")
    set("rotation","35")
    const transform=shape.getAttribute("transform")
    set("label",content)
    await layout();check("rotated wrap")
    assert(shape.getAttribute("transform")===transform,"typing changed the rotation center")
    const bold=doc.createElementNS("http://www.w3.org/2000/svg","tspan")
    bold.setAttribute("font-weight","700");bold.textContent="Bold and "
    const link=doc.createElementNS("http://www.w3.org/2000/svg","a")
    link.setAttribute("href","https://example.test/")
    link.textContent="linked text with several extra words ".repeat(4)
    text.replaceChildren(bold,link)
    const run=link.firstChild!
    doc.getSelection()!.setBaseAndExtent(run,2,run,8)
    await layout();check("rich text")
    assert(text.firstChild===bold && text.lastChild===link && link.firstChild===run,"layout rebuilt rich text runs")
    assert(doc.getSelection()!.anchorNode===run && doc.getSelection()!.focusNode===run,"layout replaced selection endpoints")
    editor.features.selection.captureElement(graphic)
    // Re-select the shape before opening the input proxy.
    editor.features.graphic.actions.manageGraphicLayer({type:"manageGraphicLayer",operation:"select",index:0})
    set("rotation","0");set("font-size","48");set("label","Edit me")
    text.dispatchEvent(new view.MouseEvent("dblclick",{bubbles:true,button:0}))
    const proxy=editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
    assert(proxy,"text field did not enter editing")
    const typed="Typing grows the field and wraps it while the caret remains inside native SVG text."
    for(const character of typed) {
      doc.execCommand("insertText",false,character)
      assert(editor.features.graphic.isTextInputFocused,"layout lost the text input focus")
    }
    await layout();check("native input")
    assert(text.textContent===typed,"native input lost text during wrapping")
    assert(editor.features.selection.captureSelectedElement===graphic,"text layout lost graphic capture")
    const previousCaret=editor.appendix.querySelector<HTMLElement>('[part="graphic-text-caret"]')!
    const beforeBreak=previousCaret.getBoundingClientRect().top
    proxy.dispatchEvent(new view.KeyboardEvent("keydown",{bubbles:true,cancelable:true,key:"Enter",shiftKey:true}))
    await layout()
    assert(text.textContent===typed+"\n","manual line break was lost")
    assert(previousCaret.getBoundingClientRect().top>beforeBreak+20,"caret did not move to the new empty line")
    doc.execCommand("insertText",false,"Next line")
    await layout();check("input after hard break")
    assert(text.textContent===typed+"\nNext line","typing after a new line failed")
    proxy.dispatchEvent(new view.KeyboardEvent("keydown",{bubbles:true,cancelable:true,key:"a",metaKey:true}))
    proxy.dispatchEvent(new view.KeyboardEvent("keydown",{bubbles:true,cancelable:true,key:"Backspace"}))
    await layout()
    assert(!text.textContent && bounds().width<40 && bounds().height<100,"deleting text did not shrink the field to an empty line")
    doc.execCommand("insertText",false,"Restored text")
    await layout();check("restored empty field")
    proxy.dispatchEvent(new view.KeyboardEvent("keydown",{bubbles:true,cancelable:true,key:"Escape"}))
    editor.doc.stopCapturing()
    const original=text.textContent,originalBounds={...bounds()}
    set("label","Small")
    await layout()
    editor.doc.undo();await layout()
    assert(shape.querySelector("text")!.textContent===original,"content-fit undo lost text")
    near(readGraphicPreset(shape.querySelector("path"))!.bounds.height,originalBounds.height,"undo lost fitted height")
    editor.doc.redo();await layout()
    assert(shape.querySelector("text")!.textContent==="Small","content-fit redo failed")
    editor.features.graphic.actions.manageGraphicLayer({type:"manageGraphicLayer",operation:"select",index:0})
    set("font-size","32");set("label",content);set("width","496")
    await layout()
    const beforeResize=bounds(),beforeCap=text.style.inlineSize
    const visibleResize=[...editor.appendix.querySelectorAll<HTMLButtonElement>('[data-graphic-handle^="resize-"]')].filter(handle=>!handle.hidden)
    assert(visibleResize.length===2,"content-sized field exposed vertical sizing handles")
    const east=editor.appendix.querySelector<HTMLButtonElement>('[data-graphic-handle="resize-e"]')!,edge=east.getBoundingClientRect()
    const pointer={bubbles:true,composed:true,button:0,pointerId:108,altKey:true}
    const start={clientX:edge.x+edge.width/2,clientY:edge.y+edge.height/2}
    east.dispatchEvent(new view.PointerEvent("pointerdown",{...pointer,...start}))
    doc.dispatchEvent(new view.PointerEvent("pointermove",{...pointer,buttons:1,clientX:start.clientX-100,clientY:start.clientY}))
    await layout()
    doc.dispatchEvent(new view.PointerEvent("pointermove",{...pointer,buttons:1,clientX:start.clientX-160,clientY:start.clientY}))
    await layout()
    const preview=editor.appendix.querySelector<SVGGElement>(".◆graphic-preview g")!
    assert(preview && readGraphicPreset(preview.querySelector("path"))!.bounds.height>beforeResize.height,"width preview did not reflow text")
    const previewBounds=readGraphicPreset(preview.querySelector("path"))!.bounds
    assert(text.style.inlineSize===beforeCap,"resize preview changed authored wrap width")
    doc.dispatchEvent(new view.PointerEvent("pointerup",{...pointer,clientX:start.clientX-160,clientY:start.clientY}))
    await layout();check("resize commit")
    near(bounds().x,previewBounds.x,"width commit moved the preview")
    near(bounds().height,previewBounds.height,"width commit changed the preview layout")
    assert(parseFloat(text.style.inlineSize)<parseFloat(beforeCap) && bounds().height>beforeResize.height,"width resize did not commit intrinsic text layout")
    editor.doc.undo();await layout()
    assert(text.style.inlineSize===beforeCap,"width undo did not restore wrap cap")
    near(bounds().height,beforeResize.height,"width undo did not restore intrinsic height")
    assert(!editor.toHTML(true).includes("◆"),"text field serialized editing artifacts")
  }
  finally {view.editor?.destroy();frame.remove()}
}
