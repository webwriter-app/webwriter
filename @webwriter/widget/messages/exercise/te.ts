import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "తనిఖీ చేయండి",
  reset: "రీసెట్ చేయండి",
  showSolution: "పరిష్కారం చూపండి",
  hideSolution: "పరిష్కారం దాచండి",
  required: "దయచేసి ఈ ప్రశ్నకు సమాధానం ఇవ్వండి.",
  summary: (correct, total) => (correct === total ? "అన్నీ సరైనవి." : `${total} లో ${correct} సరైనవి.`),
  feedbackOption: "అభిప్రాయం",
  feedbackOnCheck: "పాఠకుడు తనిఖీ చేసినప్పుడు",
  feedbackOnSubmit: "సమర్పించిన తర్వాత",
  requiredOption: "తప్పనిసరి",
} satisfies Catalog<ExerciseMessages>
