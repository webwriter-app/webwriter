import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "రద్దు చేయబడింది.",
  notAllowed: "రద్దు చేయబడింది. ఇక్కడ ఇది ఇకపై అనుమతించబడదు.",
} satisfies Catalog<SharedMessages>
