import type {DOMEditor} from "../src/domeditor"
import {graphicShapeSections} from "../src/graphic"
import type {RibbonButton} from "../src/components/ribbon-button"
import type {RibbonMenu} from "../src/components/ribbon-menu"

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if(!condition) throw new Error(message) }

/** Shape galleries fit tall viewports and remain scrollable in short ones. */
export async function checkShapeRibbonGalleries(nativeRootEditor: DOMEditor) {
  const shapeButtons=graphicShapeSections.flatMap(section=>section.rows.flatMap((row,rowIndex)=>[
    ...row.map((option,column)=>({label:option.label,category:section.label,path:option.path,pathFill:option.pathFill,galleryRowStart:column===0})),
    ...(section.label==="Basic" && rowIndex===0?[{label:"Import graphic",category:section.label,galleryColumns:3 as const}]:[]),
  ]))
  for(const height of [1000,480]) {
    const frame=document.createElement("iframe")
    frame.style.cssText=`width:1600px;height:${height}px;border:0;max-width:none`
    frame.srcdoc=height===1000
      ? '<!doctype html><style>body{margin:16px;font:16px system-ui}</style><app-ribbon></app-ribbon><script type="module" src="/src/components/ribbon.ts"></script>'
      : '<!doctype html><style>body{margin:16px;font:16px system-ui}ribbon-button{display:block;width:8rem}</style><ribbon-button></ribbon-button><script type="module" src="/src/components/ribbon-button.ts"></script>'
    nativeRootEditor.addAppendix(frame)
    const view=frame.contentWindow as Window & typeof globalThis
    try {
      const customElement=height===1000?"app-ribbon":"ribbon-button"
      for(let attempt=0;!view.customElements.get(customElement) && attempt<250;attempt++) await new Promise(resolve=>setTimeout(resolve,20))
      assert(view.customElements.get(customElement),"Shape gallery fixture did not initialize")
      const doc=frame.contentDocument!
      for(let attempt=0;!doc.querySelector(customElement) && attempt<250;attempt++) await new Promise(resolve=>setTimeout(resolve,20))
      let graphic:RibbonButton
      if(height===1000) {
        const ribbon=doc.querySelector<import("../src/components/ribbon").AppRibbon>("app-ribbon")!
        ribbon.activeMenu="Start"
        await ribbon.updateComplete
        graphic=ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[label="Graphic"]')!
      }
      else {
        graphic=doc.querySelector<RibbonButton>("ribbon-button")!
        graphic.label="Graphic"
        graphic.submenu=shapeButtons
        await graphic.updateComplete
      }
      await graphic.updateComplete
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>view.requestAnimationFrame(()=>resolve())))
      graphic.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-toggle")!.click()
      await graphic.updateComplete
      const menu=graphic.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
      await menu.updateComplete
      await new Promise<void>(resolve=>view.requestAnimationFrame(()=>view.requestAnimationFrame(()=>resolve())))
      const surface=menu.shadowRoot!.querySelector<HTMLElement>(".menu")!,bounds=menu.getBoundingClientRect()
      assert(bounds.top>=7.9 && bounds.bottom<=height-7.9,`${height}: shape gallery leaves the viewport ${JSON.stringify(bounds.toJSON())}`)
      assert(surface.scrollWidth<=surface.clientWidth+1,`${height}: shape gallery scrolls horizontally`)
      if(height===1000) assert(surface.scrollHeight<=surface.clientHeight+1,"Shape gallery scrolls despite having enough vertical space")
      else {
        assert(surface.scrollHeight>surface.clientHeight+1,
          `Shape gallery does not scroll in a short viewport: ${JSON.stringify({scrollHeight:surface.scrollHeight,clientHeight:surface.clientHeight,bounds:bounds.toJSON(),hostMaxHeight:view.getComputedStyle(menu).maxHeight,surfaceMaxHeight:view.getComputedStyle(surface).maxHeight,inline:menu.getAttribute("style")})}`)
        const items=surface.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
        items[items.length-1].focus()
        const last=items[items.length-1].getBoundingClientRect(),visible=surface.getBoundingClientRect()
        assert(last.bottom<=visible.bottom && last.top>=visible.top,"Final shape is not reachable in the short gallery")
      }
      assert(menu.shadowRoot!.querySelectorAll('[role="separator"]').length===3,"Gallery section dividers changed")
    }
    finally {frame.remove()}
  }

  const frame=document.createElement("iframe")
  frame.style.cssText="width:1000px;height:480px;border:0;max-width:none"
  frame.srcdoc='<!doctype html><style>body{margin:0;font:16px system-ui}</style><app-ribbon></app-ribbon><script type="module" src="/src/components/ribbon.ts"></script>'
  nativeRootEditor.addAppendix(frame)
  const view=frame.contentWindow as Window & typeof globalThis
  try {
    for(let attempt=0;!view.customElements.get("app-ribbon") && attempt<250;attempt++) await new Promise(resolve=>setTimeout(resolve,20))
    assert(view.customElements.get("app-ribbon"),"Compact File gallery fixture did not initialize")
    const ribbon=frame.contentDocument!.querySelector<import("../src/components/ribbon").AppRibbon>("app-ribbon")!
    for(let attempt=0;!ribbon.shadowRoot?.querySelector(".brand") && attempt<250;attempt++) await new Promise(resolve=>setTimeout(resolve,20))
    ribbon.expanded=false
    await ribbon.updateComplete
    const brand=ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!
    brand.click()
    await ribbon.updateComplete
    const fileMenu=ribbon.shadowRoot!.querySelector<RibbonMenu>("#ribbon-file-menu")!
    await fileMenu.updateComplete
    await new Promise<void>(resolve=>view.requestAnimationFrame(()=>view.requestAnimationFrame(()=>resolve())))
    const insertToggle=fileMenu.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show more Insert options"]')
    assert(insertToggle,"Compact File menu has no Insert options submenu")
    insertToggle.click()
    await fileMenu.updateComplete
    await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))
    const insertMenu=fileMenu.shadowRoot!.querySelector<RibbonMenu>('.submenu[data-submenu-key="Insert"] ribbon-menu')
    assert(insertMenu,"Insert submenu did not open")
    const graphicToggle=insertMenu.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show more Graphic options"]')
    assert(graphicToggle,"Insert submenu has no Graphic options gallery")
    graphicToggle.click()
    await insertMenu.updateComplete
    await new Promise<void>(resolve=>view.requestAnimationFrame(()=>view.requestAnimationFrame(()=>resolve())))
    const gallery=insertMenu.shadowRoot!.querySelector<HTMLElement>(".submenu.shape-gallery")
    assert(gallery,"Graphic shape gallery did not open in compact File menu")
    const bounds=gallery.getBoundingClientRect()
    assert(bounds.top>=7.9 && bounds.bottom<=472.1,
      `Compact File Graphic gallery leaves the viewport ${JSON.stringify(bounds.toJSON())}`)
    assert(gallery.scrollHeight>gallery.clientHeight+1,
      `Compact File Graphic gallery does not scroll: ${JSON.stringify({scrollHeight:gallery.scrollHeight,clientHeight:gallery.clientHeight,bounds:bounds.toJSON(),maxHeight:view.getComputedStyle(gallery).maxHeight})}`)
    const items=gallery.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    items[items.length-1].focus()
    await new Promise<void>(resolve=>view.requestAnimationFrame(()=>resolve()))
    const last=items[items.length-1].getBoundingClientRect(),visible=gallery.getBoundingClientRect()
    assert(last.bottom<=visible.bottom && last.top>=visible.top,"Final shape is not reachable in the compact File Graphic gallery")
  }
  finally {frame.remove()}
}
