import { Fragment, DOMParser, DOMSerializer, Node } from "prosemirror-model"
import { EditorController } from "."
import { hasParentNode } from "prosemirror-utils"
import { MediaType, Package, removeMark, upsertHeadElement } from "#model/index.js"
import { textNodesUnder } from "#model/utility/index.js"
import { addComment, CommentData, deleteComment, updateComment } from "#model/schemas/resource/comment.js"
import { EditorState, Command as PmCommand, NodeSelection, TextSelection, Selection } from "prosemirror-state"
import { msg, str } from "@lit/localize"
import { undo, redo } from "prosemirror-history"
import { StateCommand as CmCommand } from "@codemirror/state"
import { undo as cmUndo, redo as cmRedo } from "@codemirror/commands"

export class EditingController extends EditorController {

  // PROSEMIRROR COMMANDS /////////////////////////////////////////////////////

	executingCommand = false
	
	exec = (command: PmCommand) => {
		this.executingCommand = true
		try {
			command(this.host.pmEditor.state, this.host.pmEditor.dispatch, this.host.pmEditor as any)
			this.host.pmEditor.focus()
		}
		catch (err) {
			throw err
		}
		finally {
			this.executingCommand = false
		}
	}

	execInCodeEditor = (command: CmCommand) => command({ state: this.host.cmEditor.state, dispatch: this.host.cmEditor.dispatch })

	updateWidgetsLang(value: string) {
		this.host.pmEditor.body.querySelectorAll(".ww-widget").forEach(el => (el as HTMLElement).lang = value)
	}



  // INSERTION OF CONTENT /////////////////////////////////////////////////////

	// Check whether inserting fragment at pos violates content constraints
  private checkConstraints(pos: number, fragment: Fragment): boolean {
    // standard constraints: no descendants of same type, no non-textblock descendants except at <body> level 
    const emptyParagraphActive = this.host.selection.activeElement?.tagName === "P" && !this.host.selection.activeElement.textContent && !this.host.selection.activeElement.querySelector(":not(br)")
    const insertPos = Math.max(this.host.state.selection.anchor + (emptyParagraphActive? -1: 0), 0)
    let domAtInsertPos = this.host.pmEditor.domAtPos(insertPos, -1).node as HTMLElement
    domAtInsertPos = domAtInsertPos.nodeType === 3? domAtInsertPos.parentNode! as HTMLElement: domAtInsertPos
    // for each ancestor node, check if any part of the fragment would violate the constraints
    return !hasParentNode(ancestor => {
      let violatingDescendant = false
      fragment.descendants(descendant => {
        if(violatingDescendant) {
          return false
        }
        const isInvalidNested = !descendant.isLeaf && !descendant.isTextblock && !ancestor.type.spec.allowContainerNesting
        const isInvalidReflexive = !ancestor.type.spec.allowReflexiveNesting && descendant.type.name === ancestor.type.name
        violatingDescendant = isInvalidReflexive
        if(violatingDescendant) {
          return false
        }
      })
      return violatingDescendant
    })(TextSelection.create(this.host.state.doc, insertPos))
    // if((!nodeType.spec.allowReflexive && domAtInsertPos.closest(tagName)) || hasParentNode(node => !node.isTextblock && !node.type.spec.allowContainerNesting)(TextSelection.create(state.doc, insertPos))) {
  }

	insertMember = async (id: string, insertableName: string) => {
    const state = this.host.pmEditor.state
    const members = this.host.app.store.packages.getPackageMembers(id)
    let insertedRootPos: number | undefined = undefined
    if(id.endsWith("-snippet") || insertableName.startsWith("./snippets/")) {
      const source = (members[insertableName] as any)?.source
      let htmlStr = source
      if(id.endsWith("-snippet")) {
        const sid = Package.fromID(id).name.split("-")[1]
        const snippet = await this.host.app.store.packages.getSnippet(sid)
        htmlStr = snippet.html
      }
      else if(!source) {
        const url = this.host.app.store.packages.importMap.resolve(id + insertableName.slice(1) + ".html")
        htmlStr = await (await fetch(url, {headers: {"Accept": "text/html"}})).text()
      }
      // const tagNames = this.host.app.store.packages.widgetTagNames
      const parser = DOMParser.fromSchema(state.schema)
      const template = this.host.pmEditor.document.createElement("template")
      template.innerHTML = htmlStr
      // Apply translations if available
      const translations = (JSON.parse(template.content.querySelector("script.snippet-localization")?.innerHTML ?? "null")) as null | Record<`${string}#${string}`, Record<string, string>>
      if(translations) {
        const lang = this.host.app.store.ui.locale
        const textNodes = textNodesUnder(template.content as any)
        const counts: Record<string, number> = {}
        for(const textNode of textNodes) {
          const text = textNode.textContent!
          counts[text] = (counts[text] ?? 0) + 1
          const translation = translations[`${text}#${counts[text]}`]?.[lang]
          if(translation) {
            textNode.textContent = translation
          }
        }
        template.content.querySelectorAll("script.snippet-localization").forEach(el => el.remove())
      }
      const emptyParagraphActive = this.host.selection.activeElement?.tagName === "P" && !this.host.selection.activeElement.textContent && !this.host.selection.activeElement.querySelector(":not(br)")
      const slice = parser.parseSlice(template.content)
      let tr = this.host.pmEditor.state.tr.deleteSelection()
      const insertPos = Math.max(tr.selection.anchor - (emptyParagraphActive? 1: 0), 0)
      if(!this.checkConstraints(insertPos, slice.content)) {
        return
      }
      tr = tr.insert(insertPos, slice.content)
      // Find new selection: It should be as deep as possible into the first branch of the inserted slice. If the deepest node found is a textblock, make a TextSelection at the start of it. Otherwise, make a NodeSelection of it.
      let selection: Selection | null = null
      let widgetPos = -1
      slice.content.descendants((node, pos, parent, index) => {
        if(node.content.size === 0) {
          const r = tr.doc.resolve(insertPos + pos)
          if(node.type.spec.widget) {
            widgetPos = insertPos + pos
          }
          else {
            selection = node.isTextblock? TextSelection.findFrom(r, 1): NodeSelection.findFrom(r, 1)
          }
          return true
        }
      })
      if(selection) {
        tr = tr.setSelection(selection).scrollIntoView()
      }
      this.host.pmEditor.dispatch(tr)
      this.host.pmEditor.focus()
      insertedRootPos = widgetPos
    }
    else if(insertableName.startsWith("./widgets/")) {
      const tagName = insertableName.replace("./widgets/", "")
      const nodeName = tagName.replaceAll("-", "_")
      const nodeType = this.host.pmEditor.state.schema.nodes[nodeName]
      const id = `ww-${crypto.randomUUID()}`
      const node = nodeType.createAndFill({id})
      const state = this.host.pmEditor.state
      const emptyParagraphActive = this.host.selection.activeElement?.tagName === "P" && !this.host.selection.activeElement.textContent && !this.host.selection.activeElement.querySelector(":not(br)")
      const emptyDoc = this.host.state.doc.content.size === 0
      const insertPos = Math.max(state.selection.anchor + (emptyParagraphActive? -1: 0), 0)
      if(!this.checkConstraints(insertPos, Fragment.from(node))) {
        return
      }
      let tr = state.tr.insert(insertPos, node!)
      if(this.host.selection.isGapSelected) {
        tr = tr.setSelection(NodeSelection.create(tr.doc, this.host.selection.selection.from))
      }
      else if(this.host.selection.isAllSelected || emptyDoc) {
        tr = tr.setSelection(NodeSelection.create(tr.doc, 0))
      }
      else {
        tr = tr.setSelection(NodeSelection.near(tr.doc.resolve(emptyParagraphActive? insertPos + 2: insertPos)))
      }
      this.host.pmEditor.dispatch(tr)
      this.host.pmEditor.focus()
      insertedRootPos = insertPos
    }
    else if(insertableName.startsWith("./themes/")) {
      const old = this.host.app.store.document.themeName
      const toInsert = id + insertableName.slice(1)
      const value = old === toInsert? "base": toInsert
      const allThemes = this.host.app.store.packages.allThemes as any
      this.host.app.store.document.setHead(upsertHeadElement(
        this.host.state.head$,
        "style",
        {data: {"data-ww-theme": value}},
        this.host.state.head$.schema.text(allThemes[value].source),
        node => node.attrs?.data && node.attrs.data["data-ww-theme"] !== undefined
      )) 
    }
    else if(insertableName === "clipboard") {
      const items = await navigator.clipboard.read()
      const htmlStrs = await Promise.all(items
        .filter(x => x.types.includes("text/html"))
        .map(x => x.getType("text/html").then(blob => blob.text()))
      )
      this.host.pmEditor.pasteHTML(htmlStrs.join("\n"))
    }
    await Promise.race([
      new Promise(r => setTimeout(r)),
      new Promise(r => setTimeout(r, 5000))
    ])
    if(insertedRootPos !== undefined) {
      const insertedRoot = this.host.pmEditor.nodeDOM(insertedRootPos) as HTMLElement
      if(insertedRoot) {
        this.initializedElements.add(insertedRoot.id)
        insertedRoot.focus()
      }
    }
	}

  insertText(text: string) {
    const tr = this.host.pmEditor.state.tr
    tr.replaceSelectionWith(this.host.pmEditor.state.schema.text(text))
    this.host.pmEditor.dispatch(tr)
    this.host.pmEditor.focus()
  }

  changeMarkField(markName: string, key: string, value: any) {
    const { from, to } = this.state.selection
    const markType = this.state.schema.marks[markName]
    const tr = this.state.tr
      .removeMark(from, to, markType)
      .addMark(from, to, markType.create({ [key]: value }))
    this.pmEditor.dispatch(tr)
  }

  removeMark(markType: string) {
    this.exec(removeMark(markType))
  }

  initializedElements = new Set<string>()

  shouldBeEditable = (state: EditorState) => !this.host.ownerDocument.fullscreenElement

  setHeadingLevel(el: HTMLHeadingElement, level: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
    this.exec((state, dispatch, view) => {
      if(!["h1", "h2", "h3", "h4", "h5", "h6"].includes(state.selection.$anchor.node().type.name)) {
        return false
      }
      const pos = view!.posAtDOM(el, 0) - 1
      const type = state.schema.nodes[level]
      dispatch && dispatch(this.host.state.tr.setNodeMarkup(pos, type))
      return true
    })
  }

  setNodeAttribute(el: HTMLElement, key: string, value?: string | boolean, tag?: string) {
    this.exec((state, dispatch, view) => {     
      const pos = this.host.pmEditor.posAtDOM(el, 0, 1) - 1
      const resolved = state.doc.resolve(pos)
      const node = resolved.nodeAfter ?? resolved.nodeBefore
      const builtinAttr = key in (state.schema.nodes[node!.type.name].spec.attrs ?? {})
      const dataAttr = key.startsWith("data-")
      let v = value
      if(value === true) {
        v = ""
      }
      else if(value === false) {
        v = undefined
      }
      let tr = state.tr
      if(builtinAttr) {
        tr = tr.setNodeMarkup(
          pos,
          tag? state.schema.nodes[tag]: undefined,
          {...node!.attrs, [key]: v}
        )
        // tr.setNodeAttribute(pos, key, v)
      }
      else if(dataAttr) {
        tr = tr.setNodeMarkup(
          pos,
          tag? state.schema.nodes[tag]: undefined,
          {...node!.attrs, data: {...node!.attrs.data, [key]: v}}
        )
      }
      else {
        tr = tr.setNodeMarkup(
          pos,
          tag? state.schema.nodes[tag]: undefined,
          {...node!.attrs, "=custom": {...node!.attrs["=custom"], [key]: v}}
        )
      }
      this.host.pmEditor.dispatch(tr)
      this.host.pmEditor.focus()
      return true
    })
  }

  addComment() {
    this.exec(addComment())
  }

  updateComment(id: string, change: Partial<CommentData>, i=0) {
    this.exec(updateComment(id, change, i))
  }

  deleteComment(id: string, i=0) {
    this.exec(deleteComment(id, i))
  }

	inspect() {
    alert(msg("This feature is not implemented yet"))
  }
  edit() {
    alert(msg("This feature is not implemented yet"))
  }
  transform() {
    alert(msg("This feature is not implemented yet"))
  }
  copy() {
    const serializer = this.host.pmEditor.clipboardSerializer ?? DOMSerializer.fromSchema(this.host.state.schema)
    const fragment = this.host.selection.selection.content().content
    const documentFragment = serializer.serializeFragment(fragment, {document: this.host.pmEditor.document}) as DocumentFragment
    const dom = this.host.pmEditor.document.createElement("div")
    dom.appendChild(documentFragment)

    const clipboardItem = new ClipboardItem({
      "text/html": new Blob([dom.innerHTML], {type: "text/html"}),
      "text/plain": new Blob([dom.innerText], {type: "text/plain"}),
    })
    return navigator.clipboard.write([clipboardItem])
  }

  delete() {
    const tr = this.host.state.tr.deleteSelection()
    this.host.pmEditor.dispatch(tr)
  }

  cut() {
    this.copy()?.then(() => this.delete())
  }

  paste() {
    this.insertMember("@webwriter/core", "clipboard")
  }

	undo() {
		this.host.mode !== "source"
			? this.exec(undo)
			: this.execInCodeEditor(cmUndo)
	}

	redo() {
		this.host.mode !== "source"
			? this.exec(redo)
			: this.execInCodeEditor(cmRedo)
	}

	async pin() {
		const html = this.host.selection.selectionAsHTML
		await this.host.app.store.packages.addSnippet({id: 0, html})
		this.host.editingStatus = undefined
	}

	deleteWidget(widget: Element) {
		widget.remove()
		this.host.deletingWidget = null
	}

  setMetaValue(key: string, value: any) {
		const state = this.host.pmEditor.state
		let docObj = state.doc.toJSON()
		docObj.attrs.meta = {...state.doc.attrs["meta"], [key]: value}
		const nextState = state.reconfigure({plugins: state.plugins})
		nextState.doc = Node.fromJSON(this.host.pmEditor.state.schema, docObj)
		this.host.pmEditor.updateState(nextState)
	}

  setStyleOnSelection(style: CSSStyleDeclaration) {
    this.host.selection.topLevelElementsInSelection.forEach(el => Object.assign(el.style, style))
  }

  

  // COPY & PASTE /////////////////////////////////////////////////////////////

	private static createMediaElement(blob: Blob) {
    const mediaType = new MediaType("#" + blob.type).supertype
    if(!mediaType) {
      return null
    }
    else {
      const media = document.createElement(mediaType === "image"? "picture": mediaType)
      const source = document.createElement(mediaType === "image"? "img": "source")
      source["src"] = URL.createObjectURL(blob)
      if(mediaType !== "image") {
        (source as HTMLSourceElement).type = blob.type
      }
      else {
        source.setAttribute("data-type", blob.type)
      }
      media.setAttribute("data-filename", (blob as any).name)
      media.appendChild(source)
      return media
    }
  }

  private static async createScriptElement(blob: Blob, plain=false) {
    const script = document.createElement("script")
    if(!plain) {
      script.src = URL.createObjectURL(blob)
    }
    else {
      script.innerHTML = await blob.text()
    }
    script.type = blob.type
    script.setAttribute("data-filename", (blob as any).name)
    return script
  }

  private static createEmbedElement(blob: Blob) {
    const embed = document.createElement("embed")
    embed.src = URL.createObjectURL(blob)
    embed.type = blob.type
    embed.setAttribute("data-filename", (blob as any).name)
    return embed
  }

  private static wrapWithFigureElement(contentElement: Element, caption: string) {
    const figure = document.createElement("figure")
    figure.appendChild(contentElement)
    const figcaption = document.createElement("figcaption")
    figcaption.innerText = caption
    figure.appendChild(figcaption)
    return figure
  }

  private static elementsToHTMLString(elements: Element[]): string {
    return elements.map(el => el.outerHTML).join("\n")
  }

  private static textScriptTypes = [
    "text", "application/AML", "application/ATF", "application/ATFX", "application/ATXML", "application/batch-SMTP", "application/call-completion", "application/ccex", "application/cdmi-", "application/cybercash", "application/dashdelta", "application/dca-rft", "application/DCD", "application/dec-dx", "application/dii", "application/dit", "application/ecmascript", "application/express", "application/ibe-pp-data", "application/iges", "application/IOTP", "application/javascript", "application/jose", "application/json", "application/jwt", "application/link-format", "application/linkset", "application/lxf", "application/mathematica", "application/mbox", "application/moss-keys", "application/mosskey-", "application/n-quads", "application/n-triples", "application/nasdata", "application/news-", "application/node", "application/ODX", "application/passport", "application/pem-certificate-chain", "application/pgp-", "application/postscript", "application/relax-ng-compact-syntax", "application/remote-printing", "application/sdp", "application/SGML", "application/sgml-open-catalog", "application/sieve", "application/smil", "application/sparql-query", "application/sql", "application/srgs", "application/trickle-ice-sdpfrag", "application/trig", "application/vq-rtcpxr", "application/x-www-form-urlencoded", "application/xml", "application/xml-dtd", "application/xml-external-parsed-entity", "application/yaml", "application/yang"
  ]
  private static metaformatTypes = ["+jwt", "+xml", "+json", "+json-seq"]
  private static dataURLScriptTypes = ["application", "message", "model", "multipart", "font"]
  private static mediaTypes = ["image", "audio", "video"]
  private static embedTypes = ["application/pdf"]

  blobsToElements = async (blobs: Blob[]) => {
    const elements = []
    // https://www.iana.org/assignments/media-types/media-types.xhtml
    for(const blob of blobs) {
      const mediaType = new MediaType("#" + blob.type)
      /*
      if(blob.size > 1.5e+6) {
        throw new EmbedTooLargeError(msg("Files larger than 1.5MB can not be embedded."))
      }*/
      if(blob.size > 1e+7 && blob.size <= 5e+8) {
        console.warn(str`File ${(blob as any).name} is larger than 10MB. It is not recommended to embed files this large.`)
      }
      
      if(blob.size > 20e+8) {
        throw new EmbedTooLargeError(`File ${(blob as any).name} is larger than 2GB. Files larger than 2GB can not be embedded.`)
      }
      else if(EditingController.textScriptTypes.some(v => blob.type.startsWith(v)) || EditingController.metaformatTypes.some(v => mediaType.subtype.endsWith(v))) {
        const element = EditingController.createScriptElement(blob, true)
        elements.push(element)
      }
      else if(EditingController.embedTypes.some(v => blob.type.startsWith(v))) {
        const element = EditingController.createEmbedElement(blob)
        elements.push(element) 
      }
      else if(EditingController.mediaTypes.some(v => blob.type.startsWith(v))) {
        const element = EditingController.createMediaElement(blob)
        element? elements.push(element): null
      }
      else if(EditingController.dataURLScriptTypes.some(v => blob.type.startsWith(v))) {
        const element = EditingController.createScriptElement(blob, true)
        elements.push(element)
      }
      else {
        console.warn(msg("WebWriter does not support media of type ") + blob.type)
      }
    }
    const figures = await Promise.all(elements)
    return figures 
  }

  transformPastedHTML = (html: string) => {
    return html.replaceAll(/style=["']?((?:.(?!["']?\s+(?:\S+)=|\s*\/?[>"']))+.)["']?/g, "")
  }

  handleCodeChange() {}

  handleDropOrPaste = (ev: DragEvent | ClipboardEvent) => {
    const DragEvent = this.host.pmEditor.window.DragEvent
    const data = ev instanceof DragEvent? ev.dataTransfer: ev.clipboardData
    if((data?.files?.length ?? 0) > 0) {
      const files = [...(data?.files as any)].filter(file => file) as File[]
      let elements = [] as Element[]
      try {
        this.blobsToElements(files).then(elements => {
          const htmlString = EditingController.elementsToHTMLString(elements)
          this.host.pmEditor.pasteHTML(htmlString)
        })
      }
      catch(err) {
        if(err instanceof EmbedTooLargeError) {
          console.warn(err.message)
          return
        }
        else {
          throw err
        }
      }
      return false
    }
  }
}

export class EmbedTooLargeError extends Error {}