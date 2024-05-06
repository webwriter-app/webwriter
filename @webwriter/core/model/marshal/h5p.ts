import {Node, Schema} from "prosemirror-model"

import { Environment } from "../environment"
import {docToBundle} from "./html"
import JSZip from "jszip"
import {html, render} from "lit"
import {unsafeStatic} from "lit/static-html.js"

export function docToH5PPackageDefinition() {
  
}

function parseH5PContent(content: H5PContent): any {
  const lib = content.library
  if(lib.startsWith("H5P.Column")) {
    const c = content as H5PContentColumn
    return c.content.map(el => parseH5PContent(el))
  }
  else if(lib.startsWith("H5P.AdvancedText") || lib.startsWith("H5P.Text") || lib.startsWith("H5P.Table")) {
    const c = content as H5PContentAdvancedText | H5PContentText | H5PContentTable
    // Sanitize when Sanitizer API is available
    return unsafeStatic(c.params.text)
  }
  else if(lib.startsWith("H5P.Image")) {
    const c = content as H5PContentImage
    return html`<img src=${c.params.file.path} />`
  }
  else if(lib.startsWith("H5P.Audio")) {
    const c = content as H5PContentAudio
    return html`<audio ?controls=${c.params.controls} ?autoplay=${c.params.autoplay}>
      ${c.params.files.map(s => html`<source src=${s.path} type=${s.mime} />`)}
    </audio>`
  }
  else if(lib.startsWith("H5P.Video")) {
    const c = content as H5PContentVideo
    return html`<video ?controls=${c.params.visuals.controls} ?autoplay=${c.params.playback.autoplay} ?loop=${c.params.playback.loop}>
      ${c.params.sources.map(s => html`<source src=${s.path} type=${s.mime} />`)}
    </video>`
  }
  else if(lib.startsWith("H5P.IFrameEmbed")) {
    const c = content as H5PContentIFrameEmbed
    return html`<iframe src=${c.params.source} width=${c.params.width} height=${c.params.height}></iframe>`
  }
  else {
    console.error(`Unknown H5P element '${lib}'`)
    return html`<b>Unknown H5P Element</b>: ${lib}`
  }
}

interface H5PBaseContent<Lib extends string = ""> {
  library: `${Lib} ${string}`,
  metadata?: {
    contentType: string,
    license: string,
    title: string,
    extraTitle?: string,
    authors: {name: string, role: "Author" | "Editor" | "Licensee" | "Originator"}[],
    changes: {date: string, author: string, log: string}[]
  },
  params?: Record<string, any>
  useSeparator?: string,
  subContentId?: string
}


interface H5PContentMarkTheWords {
  params: {
    media: {
      disableImageZooming?: boolean
    },
    overallFeedback: {from: number, to: number}[]
    checkAnswerButton: string,
    submitAnswerButton: string,
    tryAgainButton: string,
    showSolutionButton: string,
    behaviour: {
      enableRetry: boolean,
      enableSolutionsButton: boolean,
      enableCheckButton: boolean,
      showScorePoints: boolean
    },
    correctAnswer: string,
    incorrectAnswer: string,
    missedAnswer: string,
    displaySolutionDescription: string,
    scoreBarLabel: string,
    a11yFullTextLabel: string,
    a11yClickableTextLabel: string,
    a11ySolutionModeHeader: string,
    a11yCheckingHeader: string,
    a11yCheck: string,
    a11yShowSolution: string,
    a11yRetry: string,
    taskDescription: string,
    textField: string
  }
}

interface H5PContentTrueFalse extends H5PBaseContent<"H5P.TrueFalse"> {
  params: {
    media: {
      type: H5PContentImage | H5PContentAudio | H5PContentVideo,
      disabledImageZooming: boolean
    },
    correct: "true" | "false",
    behaviour: {
      enableRetry: boolean,
      enableSolutionsButton: boolean,
      enableCheckButton: boolean,
      confirmCheckDialog: boolean,
      confirmRetryDialog: boolean,
      autoCheck: boolean
    },
    l10n: {
      trueText: string,
      falseText: string,
      score: string,
      checkAnswer: string,
      submitAnswer: string,
      showSolutionButton: string,
      tryAgain: string,
      wrongAnswerMessage: string,
      correctAnswerMessage: string,
      scoreBarLabel: string,
      a11yCheck: string,
      a11yShowSolution: string,
      a11yRetry: string
    },
    confirmCheck: {
      header: string,
      body: string,
      cancelLabel: string,
      confirmLabel: string
    },
    confirmRetry: {
      header: string,
      body: string,
      cancelLabel: string,
      confirmLabel: string
    },
    question: string
  }
}



interface H5PContentIFrameEmbed extends H5PBaseContent<"H5P.IFrameEmbed"> {
  params: {
    resizeSupported: boolean,
    width: string,
    minWidth: string,
    height: string,
    source: string
  }
}

interface H5PContentInteractiveVideo extends H5PBaseContent<"H5P.InteractiveVideo"> {}
interface H5PContentCoursePresentation extends H5PBaseContent<"H5P.CoursePresentation"> {}
interface H5PContentMultipleChoice extends H5PBaseContent<"H5P.MultipleChoice"> {}
interface H5PContentQuestionSet extends H5PBaseContent<"H5P.QuestionSet"> {}
interface H5PContentFillInTheBlanks extends H5PBaseContent<"H5P.FillInTheBlanks"> {}
interface H5PContentDragTheWords extends H5PBaseContent<"H5P.DragTheWords"> {}
interface H5PContentColumn extends H5PBaseContent<"H5P.Column"> {
  content: H5PContent[]
}
interface H5PContentDragAndDrop extends H5PBaseContent<"H5P.DragAndDrop"> {}
interface H5PContentImageHotspots extends H5PBaseContent<"H5P.ImageHotspots"> {}
interface H5PContentAccordion extends H5PBaseContent<"H5P.Accordion"> {}
interface H5PContentDialogCards extends H5PBaseContent<"H5P.DialogCards"> {}
interface H5PContentSingleChoiceSet extends H5PBaseContent<"H5P.SingleChoiceSet"> {
  params: {
    choices: {
      subContentId: string,
      question: string,
      answers: string[]
    }[],
    overallFeedback: {
      from: number,
      to: number,
      feedback: string
    }[],
    behaviour: {
      autoContinue: boolean,
      timeoutCorrect: number,
      timeoutWrong: number,
      enableRetry: boolean,
      enableSolutionsButton: boolean
    },
    l10n: {
      nextButtonLabel: string,
      showSolutionButtonLabel: string,
      retryButtonLabel: string,
      solutionViewTitle: string,
      correctText: string,
      incorrectText: string,
      shouldSelect: string,
      shouldNotSelect: string,
      muteButtonLabel: string,
      closeButtonLabel: string,
      slideOfTotal: string,
      scoreBarLabel: string,
      solutionListQuestionNumber: string,
      a11yShowSolution: string,
      a11yRetry: string
    }
  }
}
interface H5PContentMemoryGame extends H5PBaseContent<"H5P.MemoryGame"> {}
interface H5PContentFlashcards extends H5PBaseContent<"H5P.Flashcards"> {}
interface H5PContentDocumentationTool extends H5PBaseContent<"H5P.DocumentationTool"> {}
interface H5PContentTrueFalse extends H5PBaseContent<"H5P.TrueFalse"> {}
interface H5PContentMarkTheWords extends H5PBaseContent<"H5P.MarkTheWords"> {}
interface H5PContentImageSlider extends H5PBaseContent<"H5P.ImageSlider"> {}
interface H5PContentIFrameEmbed extends H5PBaseContent<"H5P.IFrameEmbed"> {}
interface H5PContentEssay extends H5PBaseContent<"H5P.Essay"> {}
interface H5PContentArithmeticQuiz extends H5PBaseContent<"H5P.ArithmeticQuiz"> {}
interface H5PContentTimeline extends H5PBaseContent<"H5P.Timeline"> {}
interface H5PContentSpeakTheWordsSet extends H5PBaseContent<"H5P.SpeakTheWordsSet"> {}
interface H5PContentFindMultipleHotspots extends H5PBaseContent<"H5P.FindMultipleHotspots"> {}
interface H5PContentSpeakTheWords extends H5PBaseContent<"H5P.SpeakTheWords"> {}
interface H5PContentFindTheHotspot extends H5PBaseContent<"H5P.FindTheHotspot"> {}
interface H5PContentImageSequencing extends H5PBaseContent<"H5P.ImageSequencing"> {}
interface H5PContentFindTheWords extends H5PBaseContent<"H5P.FindTheWords"> {}
interface H5PContentImageJuxtaposition extends H5PBaseContent<"H5P.ImageJuxtaposition"> {}
interface H5PContentSummary extends H5PBaseContent<"H5P.Summary"> {}
interface H5PContentImagePairing extends H5PBaseContent<"H5P.ImagePairing"> {}
interface H5PContentAudioRecorder extends H5PBaseContent<"H5P.AudioRecorder"> {}
interface H5PContentAgamotto extends H5PBaseContent<"H5P.Agamotto"> {}
interface H5PContentDictation extends H5PBaseContent<"H5P.Dictation"> {}
interface H5PContentGuessTheAnswer extends H5PBaseContent<"H5P.GuessTheAnswer"> {}
interface H5PContentCollage extends H5PBaseContent<"H5P.Collage"> {}
interface H5PContentBranchingScenario extends H5PBaseContent<"H5P.BranchingScenario"> {}
interface H5PContentPersonalityQuiz extends H5PBaseContent<"H5P.PersonalityQuiz"> {}
interface H5PContentQuestionnaire extends H5PBaseContent<"H5P.Questionnaire"> {}
interface H5PContentVirtualTour extends H5PBaseContent<"H5P.VirtualTour"> {}
interface H5PContentChart extends H5PBaseContent<"H5P.Chart"> {}
interface H5PContentInteractiveBook extends H5PBaseContent<"H5P.InteractiveBook"> {}
interface H5PContentKewArCode extends H5PBaseContent<"H5P.KewArCode"> {}
interface H5PContentAdventCalendar extends H5PBaseContent<"H5P.AdventCalendar"> {}
interface H5PContentCrossword extends H5PBaseContent<"H5P.Crossword"> {}
interface H5PContentSortTheParagraphs extends H5PBaseContent<"H5P.SortTheParagraphs"> {}
interface H5PContentImageChoice extends H5PBaseContent<"H5P.ImageChoice"> {}
interface H5PContentCornellNotes extends H5PBaseContent<"H5P.CornellNotes"> {}
interface H5PContentARScavenger extends H5PBaseContent<"H5P.ARScavenger"> {}
interface H5PContentStructureStrip extends H5PBaseContent<"H5P.StructureStrip"> {}
interface H5PContentInformationWall extends H5PBaseContent<"H5P.InformationWall"> {}
interface H5PContentGameMap extends H5PBaseContent<"H5P.GameMap"> {}
interface H5PContentTwitterUserFeed extends H5PBaseContent<"H5P.TwitterUserFeed"> {}
interface H5PContentTable extends H5PBaseContent<"H5P.Table"> {
  params: {
    text: string
  }
}

interface H5PContentText extends H5PBaseContent<"H5P.Text"> {
  params: {
    text: string
  }
}

interface H5PContentAdvancedText extends H5PBaseContent<"H5P.AdvancedText"> {
  params: {
    text: string
  }
}
interface H5PContentImage extends H5PBaseContent<"H5P.Image"> {
  params: {
    decorative: string,
    contentName: string,
    expandImage: string,
    minimizeImage: string,
    file: {
      path: string,
      mime: string,
      copyright: {license: string},
      width: number,
      height: number
    },
    alt: string
  }
}

interface H5PContentAudio extends H5PBaseContent<"H5P.Audio"> {
  params: {
    playerMode: "minimalistic" | "transparent" | "full",
    fitToWrapper: boolean,
    controls: boolean,
    autoplay: boolean,
    playAudio: string,
    pauseAudio: string,
    contentName: string,
    audioNotSupported: string,
    files: {path: string, mime: string, copyright: {license: string}}[]
  }
}
interface H5PContentVideo extends H5PBaseContent<"H5P.Video"> {
  params: {
    visuals: {
      fit: boolean,
      controls: boolean
    },
    playback: {
      autoplay: boolean,
      loop: boolean
    },
    l10n: {
      name: string,
      loading: string,
      noPlayers: string,
      noSources: string,
      aborted: string,
      networkFailure: string,
      cannotDecode: string,
      formatNotSupported: string,
      mediaEncrypted: string,
      unknownError: string,
      invalidYtId: string,
      unknownYtId: string,
      restrictedYt: string
    },
    sources: {path: string, mime: string, copyright: {license: string}, aspectRatio: string}[]
  }
}

type H5PContent = 
  | H5PContentInteractiveVideo // -> @webwriter/interactive-video
  | H5PContentCoursePresentation // -> @webwriter/slides
  | H5PContentMultipleChoice // -> @webwriter/quiz
  | H5PContentQuestionSet // -> @webwriter/quiz
  | H5PContentFillInTheBlanks // -> @webwriter/quiz
  | H5PContentDragTheWords // -> @webwriter/quiz
  | H5PContentColumn // -> HTML
  | H5PContentDragAndDrop // -> @webwriter/quiz
  | H5PContentImageHotspots // -> @webwriter/quiz
  | H5PContentAccordion // -> HTML
  | H5PContentDialogCards // unsupported -> @webwriter/flashcards
  | H5PContentSingleChoiceSet // -> @webwriter/quiz
  | H5PContentMemoryGame // -> @webwriter/quiz
  | H5PContentFlashcards // unsupported -> @webwriter/flashcards
  | H5PContentDocumentationTool // unsupported
  | H5PContentTrueFalse // -> @webwriter/quiz
  | H5PContentMarkTheWords // -> @webwriter/quiz
  | H5PContentImageSlider // unsupported -> @webwriter/slides
  | H5PContentIFrameEmbed // -> HTML
  | H5PContentEssay // -> @webwriter/quiz
  | H5PContentArithmeticQuiz // -> @webwriter/quiz
  | H5PContentTimeline // @webwriter/timeline
  | H5PContentSpeakTheWordsSet // -> @webwriter/quiz
  | H5PContentFindMultipleHotspots // -> @webwriter/quiz
  | H5PContentSpeakTheWords // -> @webwriter/quiz
  | H5PContentFindTheHotspot // -> @webwriter/quiz
  | H5PContentImageSequencing // -> @webwriter/quiz
  | H5PContentFindTheWords // -> @webwriter/quiz
  | H5PContentImageJuxtaposition // @webwriter/juxtaposition
  | H5PContentSummary // -> @webwriter/quiz
  | H5PContentImagePairing // -> @webwriter/quiz
  | H5PContentAudioRecorder // -> @webwriter/quiz
  | H5PContentAgamotto
  | H5PContentDictation // -> @webwriter/quiz
  | H5PContentGuessTheAnswer // -> @webwriter/quiz
  | H5PContentCollage
  | H5PContentBranchingScenario  // -> @webwriter/gamebook
  | H5PContentPersonalityQuiz // -> @webwriter/quiz
  | H5PContentQuestionnaire // -> @webwriter/quiz
  | H5PContentVirtualTour // IGNORE
  | H5PContentChart // -> @webwriter/chart
  | H5PContentInteractiveBook // -> @webwriter/slides
  | H5PContentKewArCode // -> HTML
  | H5PContentAdventCalendar // IGNORE
  | H5PContentCrossword // -> @webwriter/quiz
  | H5PContentSortTheParagraphs // -> @webwriter/quiz
  | H5PContentImageChoice // -> @webwriter/quiz
  | H5PContentCornellNotes
  | H5PContentARScavenger // IGNORE
  | H5PContentStructureStrip
  | H5PContentInformationWall
  | H5PContentGameMap // IGNORE
  | H5PContentTwitterUserFeed // IGNORE
  | H5PContentAdvancedText // -> HTML
  | H5PContentTable // -> HTML
  | H5PContentImage // -> HTML
  | H5PContentAudio // -> HTML
  | H5PContentVideo // -> HTML



export async function parse(data: string, schema: Schema) {
  // Read .h5p as zip
  // Get content/content.json
  const zip = new JSZip()
  await zip.loadAsync(data)
  const library = JSON.parse(await zip.file("content/library.json")?.async("string") ?? "null")
  const content = JSON.parse(await zip.file("content/content.json")?.async("string") ?? "null") as H5PContent | null
  if(content) {

  }
}

export async function serialize(explorable: Node, head: Node, bundle: Environment["bundle"], Path: Environment["Path"], FS: Environment["FS"]) {
  
  const {html, js, css} = await docToBundle(explorable, head, bundle, Path, FS)

  const script = html.createElement("script")
  script.type = "text/javascript"
  script.text = js
  html.head.appendChild(script)

  const style = html.createElement("style")
  style.textContent = css
  html.head.appendChild(style)

  return `<!DOCTYPE html>` + html.documentElement.outerHTML

}

export const label = "H5P Package"
export const extensions = ["h5p"]
export const isBinary = true