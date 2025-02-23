import { msg } from "@lit/localize";
import { html, ReactiveController, ReactiveControllerHost, TemplateResult } from "lit";
import { ZodSchema, z } from "zod";
import { ViewModelMixin } from "..";
import { EditorStateWithHead, RootStore } from "#model/index.js";
import { HTMLParserSerializer } from "#model/marshal/html.js";


export class BackupController implements ReactiveController {
  host: InstanceType<ReturnType<typeof ViewModelMixin>>;
  store: RootStore;

  constructor(
    host: InstanceType<ReturnType<typeof ViewModelMixin>>,
    store: RootStore
  ) {
    this.store = store;
    (this.host = host).addController(this);
  }

  lastBackup: number = 0
  pendingBackup: number | undefined
  parserSerializer = new HTMLParserSerializer()

  updatePool: EditorStateWithHead[] = []

  async hostConnected() {
    this.host.addEventListener("update", (e: any) => this.requestBackup(e.detail.editorState), {passive: true})
  }

  async requestBackup(state: EditorStateWithHead) {
    if(!this.store.ui.autosave) {
      return
    }
    this.updatePool.push(state)
    if(!this.pendingBackup) {
      this.pendingBackup = setTimeout(async () => {
        const length = this.updatePool.length
        const last = this.updatePool.at(-1)!
        await this.backup(last)
        this.updatePool = this.updatePool.slice(length)
        this.pendingBackup = undefined
      }, 1000) as unknown as number
    }
  }

  backup = async (state: EditorStateWithHead) => {
    if(!this.store.ui.autosave || !this.store.document.changed) {
      return
    }
    this.lastBackup = Date.now()
    const filename = this.store.document.url
      ? this.store.document.id
      : "unnamed"
    const html = await this.parserSerializer.serialize(state, true)
    const opfsRoot = await navigator.storage.getDirectory()
    const backupDir = await opfsRoot.getDirectoryHandle("backup", {create: true})
    const fileHandle = await backupDir.getFileHandle(filename, {create: true});
    const writable = await fileHandle.createWritable()
    await writable.write(html)
    await writable.close()
  }

  async clear() {
    const filename = this.store.document.url
      ? this.store.document.id
      : "unnamed"
    const opfsRoot = await navigator.storage.getDirectory()
    const backupDir = await opfsRoot.getDirectoryHandle("backup")
    await backupDir.removeEntry(filename)
  }

  async restore() {
    if(!this.store.ui.autosave) {
      return
    }
    const filename = this.store.document.url
      ? this.store.document.id
      : "unnamed"
    const opfsRoot = await navigator.storage.getDirectory()
    let fileHandle
    try {
      const backupDir = await opfsRoot.getDirectoryHandle("backup")
      fileHandle = await backupDir.getFileHandle(filename);
    }
    catch(err) {
      return
    }
    if(filename === "unnamed" || confirm(msg("An autosaved version of this explorable is available. Load it?"))) {
      const file = await fileHandle.getFile()
      const html = await file.text()
      const doc = await this.parserSerializer.parse(html, this.store.document.editorState.schema)
      this.store.document.set(doc)
    }
    await this.clear()
  }

  hostDisconnected() {}

}
