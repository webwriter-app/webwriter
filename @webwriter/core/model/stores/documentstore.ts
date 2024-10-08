import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import {
  Schema,
  Node,
  NodeType,
  Attrs,
  DOMSerializer,
  DOMParser,
} from "prosemirror-model";
import { html_beautify as htmlBeautify } from "js-beautify";
import { formatHTMLToPlainText } from "../../../spell-check/htmlparser";
import {
  applyGrammarSuggestions,
  diffTokens,
  matchDiffs,
  tokenizeText,
  // diff,
  // matchSpellingSuggestions,
} from "../../../spell-check/text-tokenizer";
import { fetchGrammarCorrection } from "../../../spell-check/fetchers/correction-fetcher";

import {
  createEditorState,
  createWindow,
  DocumentClient,
  EditorStateWithHead,
  Environment,
  getActiveMarks,
  getHeadElement,
  Package,
  PackageStore,
  setHeadAttributes,
  upsertHeadElement,
} from "..";
import {
  filterObject,
  getFileExtension,
  groupBy,
  idle,
  range,
} from "../../utility";
import marshal, { getParserSerializerByExtension } from "../marshal";
import { redoDepth, undoDepth } from "prosemirror-history";
import {
  undo as cmUndo,
  redo as cmRedo,
  undoDepth as cmUndoDepth,
  redoDepth as cmRedoDepth,
} from "@codemirror/commands";
import { EditorView } from "prosemirror-view";
import { EditorState as CmEditorState } from "@codemirror/state";
import { html as cmHTML } from "@codemirror/lang-html";
import { basicSetup } from "codemirror";
import { Account, AccountStore } from "./accountstore";
import { HTMLParserSerializer } from "../marshal/html";
import { ChatCompletion } from "openai/resources";
import { ParserSerializer } from "../marshal/parserserializer";
import { LLMAccount, OpenAIAccount } from "../schemas/accounts";

export const CODEMIRROR_EXTENSIONS = [basicSetup, cmHTML()];

type FileFormat = keyof typeof marshal;

type Resource = {
  url?: URL | FileSystemFileHandle;
  editorState: EditorStateWithHead;
};

type Options = {
  schema?: Schema;
  url?: URL;
  editorState?: EditorStateWithHead;
  lang?: string;
};

type ImportMap = {
  imports?: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
};

/** Manages the document. A document is the app's central data format. The document has an `editorState`, storing all the document's data in the ProseMirror format. It is referred to with an URL, indicating whether the document is only in memory (not saved yet) or external such as on the user's hard drive (saved before at `url`). */
export class DocumentStore implements Resource {
  static cdnUrlToPackage(url: string) {
    const id = this.cdnProviders.reduce((acc, x) => acc.replace(x, ""), url);
    return Package.fromID(id);
  }

  static cdnProviders = [
    "https://cdn.skypack.dev",
    "https://esm.run",
    "https://esm.sh",
    "https://ga.jspm.io",
  ] as const;

  url?: URL | FileSystemFileHandle;
  editorState: EditorStateWithHead;
  codeState: CmEditorState | null = null;
  lastSavedState: EditorStateWithHead;
  initialState: EditorStateWithHead;

  ioState: "idle" | "saving" | "loading" | "loadingPreview" | "loadingGrammar" =
    "idle";

  constructor(
    { schema, url, editorState, lang }: Options,
    readonly Environment: Environment,
    readonly accounts: AccountStore
  ) {
    this.editorState =
      this.lastSavedState =
      this.initialState =
        editorState ?? createEditorState({ schema, lang });
  }

  cdnProvider: (typeof DocumentStore.cdnProviders)[number] = "https://esm.run";

  packageToCdnURL(pkg: Package) {
    return `${this.cdnProvider}/${pkg.name}@${pkg.version}`;
  }

  get changed() {
    if (this.codeState) {
      return (
        this.lastSavedCodeState.doc.length !== this.codeState.doc.length ||
        !this.lastSavedCodeState.doc.eq(this.codeState.doc) ||
        !this.lastSavedState.head$.doc.eq(this.editorState.head$.doc)
      );
    } else {
      return (
        this.lastSavedState.doc.nodeSize !== this.editorState.doc.nodeSize ||
        !this.lastSavedState.doc.eq(this.editorState.doc) ||
        !this.lastSavedState.head$.doc.eq(this.editorState.head$.doc)
      );
    }
  }

  get sameAsInitial() {
    return (
      JSON.stringify(this.editorState.doc) ===
      JSON.stringify(this.initialState.doc)
    );
  }

  get lastSavedCodeState() {
    return DocumentStore.editorToCodeState(this.lastSavedState);
  }

  get importMap(): ImportMap {
    let { node } = getHeadElement(this.editorState.head$) ?? {};
    return !node ? {} : JSON.parse(node.textContent);
  }

  set importMap(value: ImportMap) {
    const json = JSON.stringify(value);
    let { node, pos } = getHeadElement(this.editorState.head$) ?? {};
    const state = upsertHeadElement(
      this.editorState.head$,
      "script",
      node?.attrs ?? { type: "importmap" },
      this.editorState.head$.schema.text(json),
      (_, nPos) => pos === nPos
    );
    this.setHead(state);
  }

  /** Updates the document schema with the store's schema. */
  updateSchema(schema: Schema) {
    const oldSerializer = DOMSerializer.fromSchema(this.editorState.schema);
    const newParser = DOMParser.fromSchema(schema);
    const doc = newParser.parse(
      oldSerializer.serializeNode(this.editorState.doc)
    );
    const selection = new TextSelection(doc.resolve(0));
    const newState = createEditorState({
      ...this.editorState,
      schema,
      doc,
      selection,
      lang: this.lang,
    });
    if (this.sameAsInitial) {
      this.lastSavedState = newState;
    }
    this.editorState = newState;
  }

  get undoDepth() {
    return !this.codeState
      ? undoDepth(this.editorState)
      : cmUndoDepth(this.codeState);
  }

  get redoDepth() {
    return !this.codeState
      ? redoDepth(this.editorState)
      : cmRedoDepth(this.codeState);
  }

  /** Sets a new editor state for the given resource. */
  set(editorState: EditorStateWithHead) {
    this.editorState = editorState;
  }

  /** Sets a new editor state for the given resource. */
  setHead(head$: EditorState) {
    const state = this.editorState.apply(this.editorState.tr);
    this.set(Object.assign(state, { head$ }));
  }
  /** Saves a resource on an external file system. */
  async save(
    saveAs = false,
    serializer = this.serializer,
    client = this.client,
    filename = this.provisionalTitle
  ) {
    this.ioState = "saving";
    try {
      let newUrlOrHandle: URL | FileSystemFileHandle | undefined =
        saveAs || !this.url ? undefined : this.url;
      let newSerializer = serializer;
      if (!newUrlOrHandle && "pickSave" in client) {
        newUrlOrHandle = await client.pickSave();
        if (!newUrlOrHandle) {
          return;
        } else if (newUrlOrHandle instanceof FileSystemFileHandle) {
          const handle = newUrlOrHandle;
          console.log(handle);
          const foundPs = getParserSerializerByExtension(handle.name);
          newSerializer = foundPs ? new foundPs(this.Environment) : serializer;
          newSerializer =
            "serialize" in newSerializer ? newSerializer : this.serializer;
          const data = await newSerializer.serialize!(this.editorState);
          const returnedHandle = (await client.saveDocument(
            data,
            handle,
            filename
          )) as FileSystemFileHandle;
          if (returnedHandle) {
            this.lastSavedState = this.editorState;
            this.url = returnedHandle;
            return returnedHandle;
          }
        } else {
          const newUrl = newUrlOrHandle;
          const foundPs = getParserSerializerByExtension(newUrl?.pathname);
          newSerializer = foundPs ? new foundPs(this.Environment) : serializer;
          newSerializer =
            "serialize" in newSerializer ? newSerializer : this.serializer;
          const data = await newSerializer.serialize!(this.editorState);
          const url = (await client.saveDocument(
            data,
            newUrl,
            filename
          )) as URL;
          if (url) {
            this.lastSavedState = this.editorState;
            this.url = url;
            return url;
          }
        }
      }
    } catch (err) {
      throw err;
    } finally {
      this.ioState = "idle";
    }
  }
  /** Loads a resource from an external file system. */
  async load(
    url: Resource["url"] | undefined = undefined,
    parser = this.parser,
    client = this.client,
    schema = this.editorState.schema
  ) {
    this.ioState = "loading";
    try {
      let newUrl = url;
      let newParser = parser;
      if (!url && "pickLoad" in client) {
        newUrl = await client.pickLoad();
        if (!newUrl) {
          return;
        }
        const foundPs = getParserSerializerByExtension(
          newUrl instanceof FileSystemFileHandle
            ? newUrl.name
            : newUrl?.pathname
        );
        newParser = foundPs ? new foundPs(this.Environment) : parser;
      }
      const data = await client.loadDocument(newUrl as any);
      if (!data) {
        return;
      }
      const editorState = await newParser.parse(data as string, schema);
      this.editorState = this.lastSavedState = editorState;
      if (this.codeState) {
        this.deriveCodeState();
      }
      this.url = url;
      return data;
    } finally {
      this.ioState = "idle";
    }
  }

  previewSrc: string;

  /** Open a preview for this document. */
  async preview(serializer = new HTMLParserSerializer(this.Environment)) {
    this.ioState = "loadingPreview";
    try {
      this.previewSrc && URL.revokeObjectURL(this.previewSrc);
      const htmlString = await serializer.serialize(this.editorState);
      const blob = new Blob([htmlString], { type: "text/html" });
      this.previewSrc = URL.createObjectURL(blob);
      return this.previewSrc;
    } finally {
      this.ioState = "idle";
    }
  }

  isSpellchecking = false;

  /** Does a spell check on the document text */
  async spellcheck() {
    this.ioState = "loadingGrammar";

    // get raw editor html
    const state = this.editorState;
    const serializer = DOMSerializer.fromSchema(state.schema);
    const dom = serializer.serializeNode(state.doc) as HTMLElement;
    const html = htmlBeautify(dom.outerHTML, {
      indent_size: 2,
      wrap_attributes: "force-aligned",
      inline_custom_elements: false,
    });

    // get plain text
    const text = formatHTMLToPlainText(html);

    // get apiKey
    const llmAccount: LLMAccount = this.accounts.getAccount(
      "llm"
    ) as LLMAccount;
    const apiKey = llmAccount.data.apiKey;
    const company = llmAccount.data.company;
    const model = llmAccount.data.model;

    // send text to spellchecker
    const res = await fetchGrammarCorrection(text, apiKey, company, model);
    if (!res) {
      console.error("no response from spellchecker!");
      return;
    }

    const correctedText = res.choices[0].message.content;
    if (!correctedText) {
      console.error("no corrected text!");
      return;
    }
    console.log("original:", text, "corrected:", correctedText);

    // tokenize both texts
    const originalTokens = tokenizeText(text);
    const correctedTokens = tokenizeText(correctedText);

    // get token differences
    const diffs = diffTokens(originalTokens, correctedTokens);
    console.log(diffs);
    const suggestions = matchDiffs(diffs);
    console.log("suggestions:", suggestions);

    // highlight differences in content using transactions
    const transaction = applyGrammarSuggestions(state, suggestions);

    // Create a new EditorStateWithHead applying the transaction
    const newState = this.editorState.apply(transaction) as EditorStateWithHead;
    newState["head$"] = this.editorState["head$"];

    // Update the editorState
    this.editorState = newState;
    this.ioState = "idle";
  }

  get empty() {
    const defaultState = createEditorState({ schema: this.editorState.schema });
    return this.editorState.doc.eq(defaultState.doc);
  }

  get inMemory() {
    return !this.url;
  }

  get activeMarks() {
    return getActiveMarks(this.editorState);
  }

  get activeNodes() {
    const { editorState: s } = this;
    const nodes = [] as Node[];
    s.doc.nodesBetween(s.selection.from, s.selection.to, (node) => {
      nodes.push(node);
    });
    return nodes;
  }

  get activePos() {
    const { editorState: s } = this;
    const posList = [] as number[];
    s.doc.nodesBetween(s.selection.from, s.selection.to, (node, pos) => {
      posList.push(pos);
    });
    return posList;
  }

  get activeAttributes() {
    return this.activeNodes.flatMap((node) => {
      return Object.entries(node.attrs).map(([key, value]) => {
        return { node, key, value };
      });
    });
  }

  get activeAttributesByKey() {
    return groupBy(this.activeAttributes, "key");
  }

  get activeNodeNames() {
    return this.activeNodes.map((node) => node.type.name);
  }

  get activeMarkNames() {
    return this.activeMarks.map((mark) => mark.type.name);
  }

  get docAttributes() {
    return this.editorState.doc.attrs;
  }

  getActiveDocAttributeValue(key: string) {
    return this.docAttributes[key];
  }

  isMarkActive(markName: string) {
    return this.activeMarks.some((mark) => mark.type.name === markName);
  }

  getActiveAttributeValue(key: string) {
    const all = (this.activeAttributesByKey[key] ?? []).map(
      ({ value }) => value
    );
    const unique = new Set(all.filter((v) => v));
    if (unique.size === 0) {
      return undefined;
    } else if (unique.size === 1) {
      return [...unique][0];
    } else {
      return null;
    }
  }

  hasActiveNode(
    type: string | NodeType,
    attrs?: Attrs,
    includeAncestors = false
  ) {
    const { editorState: s } = this;
    let matchFound = false;
    this.activeNodes.filter((node) => {
      const typeMatches =
        typeof type === "string" ? node.type.name === type : node.type === type;
      const attrsMatches =
        !attrs || Object.keys(attrs).every((k) => attrs[k] === node.attrs[k]);
      if (typeMatches && attrsMatches) {
        matchFound = true;
      }
    });
    if (includeAncestors) {
      const resolvedPos = s.selection.$anchor;
      const ancestors = range(0, resolvedPos.depth).map((i) =>
        resolvedPos.node(i)
      );
    }
    return matchFound;
  }

  get activeNodeMap() {
    return Object.fromEntries(this.activeNodes.map((n) => [n.type.name, n]));
  }

  get activeMarkMap() {
    return Object.fromEntries(this.activeMarks.map((m) => [m.type.name, m]));
  }

  getActiveComputedStyles(view: EditorView) {
    const { getComputedStyle } = view.dom.ownerDocument.defaultView!;
    return this.activePos
      .map((pos) => view.nodeDOM(pos) as Element)
      .map((element) => getComputedStyle(element));
  }

  /** Return the text content of the first element, if any, limited to 50 characters and with trimmed whitespace. */
  get provisionalTitle() {
    let firstChildContent;
    if (this.codeState) {
      const parser = new window.DOMParser();
      const doc = parser.parseFromString(
        this.codeState.doc.toString(),
        "text/html"
      );
      firstChildContent = doc.body.children.item(0)?.textContent;
    } else {
      firstChildContent = this.editorState.doc.firstChild?.textContent;
    }
    return firstChildContent?.replaceAll(/\s+/g, " ").trim().slice(0, 50);
  }

  setCodeState(state: CmEditorState) {
    this.codeState = state;
  }

  static editorToCodeState(state: EditorStateWithHead) {
    const serializer = DOMSerializer.fromSchema(state.schema);
    const dom = serializer.serializeNode(state.doc) as HTMLElement;
    const html = htmlBeautify(dom.outerHTML, {
      indent_size: 2,
      wrap_attributes: "force-aligned",
      inline_custom_elements: false,
    });
    return CmEditorState.create({
      doc: html,
      extensions: CODEMIRROR_EXTENSIONS,
    });
  }

  static codeToEditorState(
    codeState: CmEditorState,
    editorState: EditorStateWithHead
  ) {
    const { schema, plugins, head$ } = editorState;
    const value = codeState.doc.toString();
    const dom = new window.DOMParser().parseFromString(value, "text/html");
    const doc = DOMParser.fromSchema(editorState.schema).parse(dom);
    return createEditorState({ schema, doc, plugins }, head$.doc);
  }

  deriveEditorState() {
    this.editorState =
      this.codeState && this.undoDepth > 0
        ? DocumentStore.codeToEditorState(this.codeState, this.editorState)
        : this.editorState;
    this.codeState = null;
  }

  deriveCodeState() {
    this.codeState = DocumentStore.editorToCodeState(this.editorState);
  }

  private get imports() {
    let imports: Record<string, string> = {};
    this.editorState.head$.doc.descendants((node) => {
      if (node.attrs.type === "importmap") {
        imports = JSON.parse(node.textContent).imports;
      }
    });
    return imports;
  }

  get packages() {
    return Object.fromEntries(
      Object.entries(this.imports)
        .filter(([k]) => k.startsWith("~webwriter-widget~"))
        .map(([k, v]) => [k, DocumentStore.cdnUrlToPackage(v)])
    );
  }

  set packages(pkgs: Record<string, Package>) {
    const imports = Object.fromEntries([
      ...Object.entries(this.imports).filter(
        ([k]) => !k.startsWith("_webwriter-widget_")
      ),
      ...Object.entries(pkgs).map(([name, pkg]) => [
        `_webwriter-widget_${name}`,
        this.packageToCdnURL(pkg),
      ]),
    ]);
    const text = JSON.stringify(imports);
    const headState = this.editorState.head$;
    let existingPos: number, existingNode: Node | undefined;
    headState.doc.descendants((node, pos, parent, index) => {
      if (node.attrs.type === "importmap") {
        existingPos = pos;
        existingNode = node;
        return false;
      }
    });
    if (existingPos! !== undefined && existingNode !== undefined) {
      let node = headState.schema.node(
        "script",
        { ...(existingNode as any), type: "importmap" },
        headState.schema.text(text)
      );
      const resolved = headState.doc.resolve(existingPos);
      const tr = headState.tr.replaceWith(
        resolved.pos,
        resolved.pos + existingNode.nodeSize,
        node
      );
      this.setHead(headState.apply(tr));
    } else {
      let node = headState.schema.node(
        "script",
        { type: "importmap" },
        headState.schema.text(text)
      );
      const lastPos = headState.doc.nodeSize - 2;
      const tr = headState.tr.insert(lastPos, node);
      this.setHead(headState.apply(tr));
    }
  }

  addPackage(pkg: Package) {
    this.packages = { ...this.packages, [pkg.name]: pkg };
  }

  get lang() {
    return this.head.doc.attrs.htmlAttrs?.lang ?? navigator.language;
  }

  set lang(value: string) {
    const htmlAttrs = this.head.doc.attrs?.htmlAttrs;
    this.setHead(
      this.head.apply(
        this.head.tr.setDocAttribute("htmlAttrs", { ...htmlAttrs, lang: value })
      )
    );
  }

  get head() {
    return this.editorState.head$;
  }

  get textContent() {
    return this.editorState.doc.textContent;
  }

  get graphemes() {
    const segmenter = new Intl.Segmenter(this.lang, {
      granularity: "grapheme",
    });
    return [...segmenter.segment(this.textContent)];
  }

  get words() {
    const segmenter = new Intl.Segmenter(this.lang, { granularity: "word" });
    return [...segmenter.segment(this.textContent)];
  }

  get sentences() {
    const segmenter = new Intl.Segmenter(this.lang, {
      granularity: "sentence",
    });
    return [...segmenter.segment(this.textContent)];
  }

  get graphemeCount() {
    return this.graphemes.length;
  }

  get wordCount() {
    return this.words.length;
  }

  get sentenceCount() {
    return this.sentences.length;
  }

  get themeName() {
    const { node } =
      getHeadElement(
        this.editorState.head$,
        (node) => node.type.name === "style" && node.attrs.data["data-ww-theme"]
      ) ?? {};
    return node?.attrs.data["data-ww-theme"];
  }

  get client() {
    const file = this.accounts.getClient("file", "file")!;
    return this.url ? this.accounts.clientFromURL(this.url) ?? file : file;
  }

  get parserSerializer() {
    const html = new HTMLParserSerializer(this.Environment);
    return this.url
      ? this.accounts.parserSerializerFromURL(this.url) ?? html
      : html;
  }

  get parser() {
    return this.parserSerializer;
  }

  get serializer() {
    const html = new HTMLParserSerializer(this.Environment);
    return "serialize" in this.parserSerializer ? this.parserSerializer : html;
  }
}
