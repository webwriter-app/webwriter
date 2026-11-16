import { defineMessages } from "../../messages.js";
import catalogs from "./catalogs.js";
const exerciseMessages = defineMessages(
  {
    check: "Check",
    reset: "Reset",
    showSolution: "Show solution",
    hideSolution: "Hide solution",
    required: "Please answer this question.",
    summary: (correct, total) => correct === total ? "Everything is correct." : `${correct} of ${total} correct.`,
    feedbackOption: "Feedback",
    feedbackOnCheck: "When the reader checks",
    feedbackOnSubmit: "After submitting",
    requiredOption: "Required"
  },
  catalogs
);
export {
  exerciseMessages
};
