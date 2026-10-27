import type {DOMEditor} from "../src/domeditor"

const assert=(condition:unknown,message:string)=>{if(!condition) throw new Error(message)}

export async function checkGraphicEmptyLabelCaret() {
  const frame=document.createElement("iframe")
  frame.style.cssText="width:1000px;height:720px;border:0;max-width:none"
  frame.srcdoc='<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view=frame.contentWindow as Window & typeof globalThis & {editor?:DOMEditor,editorError?:string}
  try {
    for(let attempt=0;!view.editor && !view.editorError && attempt<250;attempt++) await new Promise(resolve=>setTimeout(resolve,20))
    assert(view.editor,view.editorError ?? "Empty label caret fixture did not initialize")
    const editor=view.editor!,doc=frame.contentDocument!
    const layout=async()=>{
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))
    }
    editor.features.graphic.actions.insertGraphic({type:"insertGraphic"})
    const graphic=doc.querySelector("svg")!
    graphic.setAttribute("viewBox","0 0 800 500")
    Object.assign(graphic.style,{width:"800px",height:"500px"})
    const types=["rectangle","ellipse","diamond","rounded-rectangle","rectangular-callout","text-box"] as const
    for(const type of types) for(const rotation of [0,35,90]) for(const zoom of [50,150]) {
      graphic.replaceChildren(doc.createComment("preserve authored sibling"))
      editor.features.selection.captureElement(graphic)
      editor.features.graphic.actions.addGraphicShape({type:"addGraphicShape",shape:type})
      let selected=editor.features.graphic.selectedShape!
      if(rotation) editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"rotation",value:String(rotation)})
      editor.features.graphic.actions.setGraphicParameter({type:"setGraphicParameter",name:"label",value:""})
      editor.features.graphic.actions.navigateGraphic({type:"navigateGraphic",operation:"set-zoom",zoom})
      await layout()
      selected=editor.features.graphic.selectedShape!
      const geometry=(selected.localName==="g" ? selected.querySelector("path,rect,polygon,ellipse") : selected) as SVGGraphicsElement
      assert(geometry,`${type}: missing authored shape geometry`)
      const geometryState=()=>JSON.stringify([...geometry.attributes].filter(attribute=>!["class","transform"].includes(attribute.name)).map(attribute=>[attribute.name,attribute.value]))
      const before=geometryState()
      const activate=()=>geometry.dispatchEvent(new view.MouseEvent("dblclick",{bubbles:true,button:0,composed:true}))
      const centerCaret=async(label:string)=>{
        await layout()
        const proxy=editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
        const caret=editor.appendix.querySelector<HTMLElement>('[part="graphic-text-caret"]')!
        assert(proxy && caret && editor.features.graphic.isTextInputFocused,`${type}/${rotation}/${zoom}/${label}: empty label did not focus input`)
        const bbox=geometry.getBBox(),matrix=geometry.getScreenCTM()!
        const center=new view.DOMPoint(bbox.x+bbox.width/2,bbox.y+bbox.height/2).matrixTransform(matrix)
        const rect=caret.getBoundingClientRect()
        assert(Math.abs(rect.left+rect.width/2-center.x)<1,`${type}/${rotation}/${zoom}/${label}: caret x center ${rect.left+rect.width/2} != geometry center ${center.x}`)
        assert(Math.abs(rect.top+rect.height/2-center.y)<1,`${type}/${rotation}/${zoom}/${label}: caret y center ${rect.top+rect.height/2} != geometry center ${center.y}`)
        assert(![...editor.appendix.children].some(element=>element.localName==="svg" && element.getAttribute("aria-hidden")==="true" && !element.hasAttribute("part")),`${type}: temporary measurement probe leaked`)
      }
      activate()
      selected=editor.features.graphic.selectedShape!
      await centerCaret("initial empty")
      if(type!=="text-box") assert(geometryState()===before,`${type}: centering empty caret changed source geometry`)
      const proxy=editor.appendix.querySelector<HTMLTextAreaElement>(".◆graphic-label-input")!
      for(const character of "typed label") {
        proxy.dispatchEvent(new view.KeyboardEvent("keydown",{key:character,bubbles:true,cancelable:true}))
        doc.execCommand("insertText",false,character)
      }
      const text=selected.querySelector("text")!
      assert(text.textContent==="typed label",`${type}: could not type test label`)
      const selection=doc.getSelection()!,range=doc.createRange()
      range.selectNodeContents(text);selection.removeAllRanges();selection.addRange(range)
      editor.features.mark.handleSVGTextInput(new view.InputEvent("beforeinput",{inputType:"deleteContentBackward",cancelable:true}))
      editor.features.graphic.rememberTextSelection()
      editor.features.graphic.focusTextInput()
      editor.features.graphic.refresh()
      assert(text.textContent==="",`${type}: delete-all did not empty label`)
      await centerCaret("after delete-all and refresh")
      proxy.dispatchEvent(new view.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}))
      await layout()
      assert(!editor.appendix.querySelector('.◆graphic-label-input, [part="graphic-text-caret"]'),`${type}: label editor leaked after Escape`)
      assert(!editor.toHTML(true).includes("◆"),`${type}: editor markers serialized`)
    }
  }
  finally {view.editor?.destroy();frame.remove()}
}
