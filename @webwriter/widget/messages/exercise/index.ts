import {defineMessages} from "../../messages.js"
import catalogs from "./catalogs.js"

/** The texts of the Exercise helper. */
export type ExerciseMessages = {
  /** Label of the `check` action. */
  check: string
  /** Label of the `reset` action. */
  reset: string
  /** Label of the `showSolution` action while the solution is hidden. */
  showSolution: string
  /** Label of the `showSolution` action while the solution is shown. */
  hideSolution: string
  /** Validation message of a required exercise without a response. */
  required: string
  /** The summary that is spoken when feedback appears. */
  summary: (correct: number, total: number) => string
  /** Drawer label of the feedback option, and of its two choices. */
  feedbackOption: string
  feedbackOnCheck: string
  feedbackOnSubmit: string
  /** Drawer label of the `required` option. */
  requiredOption: string
}

/** The messages of the Exercise helper with their catalogs. */
export const exerciseMessages = defineMessages<ExerciseMessages>(
  {
    check: "Check",
    reset: "Reset",
    showSolution: "Show solution",
    hideSolution: "Hide solution",
    required: "Please answer this question.",
    summary: (correct, total) => (correct === total ? "Everything is correct." : `${correct} of ${total} correct.`),
    feedbackOption: "Feedback",
    feedbackOnCheck: "When the reader checks",
    feedbackOnSubmit: "After submitting",
    requiredOption: "Required",
  },
  catalogs,
)
