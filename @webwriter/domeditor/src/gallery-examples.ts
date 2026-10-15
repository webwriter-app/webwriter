import {galleryExample, type GalleryWidget} from "./widget-gallery"

const lessons = import.meta.glob("../examples/[0-9][0-9]-*.html", {query: "?raw", import: "default", eager: true}) as Record<string, string>

/** Existing authored lessons provide usable defaults for widgets without published snippets. */
export function galleryLessonExample(widget: GalleryWidget) {
  if(widget.member.kind !== "widget") return null
  for(const html of Object.values(lessons)) {
    const example = galleryExample(html, widget)
    if(example) return example
  }
  return null
}
