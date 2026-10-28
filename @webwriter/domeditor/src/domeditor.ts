import {DOMEditor as CoreDOMEditor, type DOMEditorOptions} from "./domeditor-core"
import {appendSerializedAssets} from "./serialization"

import {DependencyFeature} from "./features/dependencies"
import {StateFeature} from "./features/state"
import {TemplateFeature} from "./features/template"
import {DistributionFeature} from "./features/distribution"
import {InsertionFeature} from "./features/insertion"
import {PlaceholderFeature} from "./features/placeholder"
import {CommentFeature} from "./features/comment"
import {AttributionFeature} from "./features/attribution"
import {ProofreadingFeature} from "./features/proofreading"
import {CollaborationFeature} from "./features/collaboration"

export type {DOMEditorOptions, EditingAction} from "./domeditor-core"

/** Authoring adds export assets to the shared, in-frame editing engine. */
export class DOMEditor extends CoreDOMEditor {
  constructor(options: DOMEditorOptions = {}) {
    super({...options,
      bundleOfflineModules: options.bundleOfflineModules ?? (async (...args) => (await import("./offline-module-bundler")).bundleOfflineModules(...args)),
      appendSerializedAssets: options.appendSerializedAssets ?? appendSerializedAssets}, editor => ({
      "dependency": new DependencyFeature(editor),
      "state": new StateFeature(editor),
      "template": new TemplateFeature(editor),
      "distribution": new DistributionFeature(editor),
      "insertion": new InsertionFeature(editor),
      "placeholder": new PlaceholderFeature(editor),
      "comment": new CommentFeature(editor),
      "attribution": new AttributionFeature(editor),
      "proofreading": new ProofreadingFeature(editor),
      "collaboration": new CollaborationFeature(editor),
    }))
  }
}
