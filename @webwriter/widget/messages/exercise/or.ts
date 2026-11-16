import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "ଯାଞ୍ଚ କରନ୍ତୁ",
  reset: "ରିସେଟ୍ କରନ୍ତୁ",
  showSolution: "ସମାଧାନ ଦେଖାନ୍ତୁ",
  hideSolution: "ସମାଧାନ ଲୁଚାନ୍ତୁ",
  required: "ଦୟାକରି ଏହି ପ୍ରଶ୍ନର ଉତ୍ତର ଦିଅନ୍ତୁ।",
  summary: (correct, total) => (correct === total ? "ସବୁ ଠିକ୍ ଅଛି।" : `${total} ମଧ୍ୟରୁ ${correct} ଠିକ୍।`),
  feedbackOption: "ମତାମତ",
  feedbackOnCheck: "ପାଠକ ଯାଞ୍ଚ କଲେ",
  feedbackOnSubmit: "ଦାଖଲ ପରେ",
  requiredOption: "ବାଧ୍ୟତାମୂଳକ",
} satisfies Catalog<ExerciseMessages>
