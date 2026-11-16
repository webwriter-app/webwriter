import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "ഈ മൂല്യം ഇവിടെ അനുവദനീയമല്ല.",
  invalidDuration: "ദൈർഘ്യം നൽകുക, ഉദാഹരണത്തിന് 1:30 അല്ലെങ്കിൽ 90.",
} satisfies Catalog<SettingsMessages>
