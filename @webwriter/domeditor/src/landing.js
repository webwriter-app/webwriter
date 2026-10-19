import {legacyEditorURL} from "./page-routing"
import "./components/example-preview"
import "./components/layout-showcase"
import "./components/widget-gallery"

// Old bookmarks and invitations used the origin root as the editor entry.
const editorURL = legacyEditorURL(location.href)
if(editorURL) location.replace(editorURL.href)
