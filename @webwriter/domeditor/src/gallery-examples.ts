import {galleryExample, type GalleryWidget} from "./widget-gallery"

const lessons = import.meta.glob("../examples/[0-9][0-9]-*.html", {query: "?raw", import: "default", eager: true}) as Record<string, string>

// These answer components have no published snippets and require their task context.
const task = (prompt: string, answer: string) => `<webwriter-quiz><webwriter-task><webwriter-task-prompt slot="prompt">${prompt}</webwriter-task-prompt>${answer}</webwriter-task></webwriter-quiz>`
const answerExamples = [
  task('<p>Put the stages of a plant’s life in order.</p><webwriter-quiz-hint slot="hint"><p>Start with the seed.</p></webwriter-quiz-hint>', `<webwriter-order solution='["seed","sprout","flower"]'><webwriter-order-item id="seed"><p>Seed</p></webwriter-order-item><webwriter-order-item id="sprout"><p>Sprout</p></webwriter-order-item><webwriter-order-item id="flower"><p>Flower</p></webwriter-order-item></webwriter-order>`),
  task('<p>Match each state of matter to an example.</p>', `<webwriter-pairing solution='[["solid","ice"],["liquid","water"]]'><webwriter-pairing-item id="solid"><p>Solid</p></webwriter-pairing-item><webwriter-pairing-item id="ice"><p>Ice cube</p></webwriter-pairing-item><webwriter-pairing-item id="liquid"><p>Liquid</p></webwriter-pairing-item><webwriter-pairing-item id="water"><p>Water</p></webwriter-pairing-item></webwriter-pairing>`),
  task('<p>Highlight the animals in this sentence.</p>', '<webwriter-mark>The robin eats a caterpillar beside the oak tree.</webwriter-mark>'),
  task('<p>What might happen to a puddle on a warm, sunny day? Explain your idea.</p>', '<webwriter-text free-text placeholder="Your explanation"></webwriter-text>'),
  task('<p>Practise saying: “Could I have a glass of water, please?”</p>', '<webwriter-speech></webwriter-speech>'),
]

/** Existing authored lessons provide usable defaults for widgets without published snippets. */
export function galleryLessonExample(widget: GalleryWidget) {
  if(widget.member.kind !== "widget") return null
  for(const html of Object.values(lessons)) {
    const example = galleryExample(html, widget)
    if(example) return example
  }
  if(widget.pkg.name === "@webwriter/quiz") {
    for(const html of answerExamples) {
      const example = galleryExample(html, widget)
      if(example) return example
    }
  }
  return null
}
