// Keep related but distinct formats separate, including formats based on ZIP or XML.
const definitions: [label: string, key: string, ...aliases: string[]][] = [
  ["Plain text", ".txt", "text/plain"],
  ["CSV", ".csv", "text/csv"],
  ["TSV", ".tsv", "text/tab-separated-values"],
  ["JSON", ".json", "application/json"],
  ["XML", ".xml", "application/xml", "text/xml"],
  ["HTML", ".html", ".htm", "text/html"],
  ["XHTML", ".xhtml", ".xht", "application/xhtml+xml"],
  ["Markdown", ".md", ".markdown", "text/markdown"],
  ["CSS", ".css", "text/css"],
  ["JavaScript", ".js", ".mjs", "text/javascript", "application/javascript"],
  ["PDF", ".pdf", "application/pdf"],
  ["Word document", ".doc", "application/msword"],
  ["Word document (DOCX)", ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["Excel spreadsheet", ".xls", "application/vnd.ms-excel"],
  ["Excel spreadsheet (XLSX)", ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["PowerPoint presentation", ".ppt", "application/vnd.ms-powerpoint"],
  ["PowerPoint presentation (PPTX)", ".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["OpenDocument text", ".odt", "application/vnd.oasis.opendocument.text"],
  ["OpenDocument spreadsheet", ".ods", "application/vnd.oasis.opendocument.spreadsheet"],
  ["OpenDocument presentation", ".odp", "application/vnd.oasis.opendocument.presentation"],
  ["PNG", ".png", "image/png"],
  ["JPEG", ".jpg", ".jpeg", ".jpe", "image/jpeg"],
  ["GIF", ".gif", "image/gif"],
  ["SVG", ".svg", "image/svg+xml"],
  ["WebP", ".webp", "image/webp"],
  ["AVIF", ".avif", "image/avif"],
  ["BMP", ".bmp", "image/bmp"],
  ["TIFF", ".tif", ".tiff", "image/tiff"],
  ["MP3", ".mp3", "audio/mpeg", "audio/mp3"],
  ["WAV", ".wav", "audio/wav", "audio/wave", "audio/x-wav", "audio/vnd.wave"],
  ["FLAC", ".flac", "audio/flac", "audio/x-flac"],
  ["M4A audio", ".m4a", "audio/mp4", "audio/x-m4a"],
  ["MP4 video", ".mp4", ".m4v", "video/mp4", "video/x-m4v"],
  ["WebM video", ".webm", "video/webm"],
  ["WebM audio", ".weba", "audio/webm"],
  ["Ogg audio", ".ogg", ".oga", "audio/ogg"],
  ["Ogg video", ".ogv", "video/ogg"],
  ["WebVTT", ".vtt", "text/vtt"],
  ["SubRip subtitles", ".srt", "application/x-subrip"],
  ["ZIP archive", ".zip", "application/zip", "application/x-zip-compressed"],
  ["H5P", ".h5p", "application/x-h5p"],
  ["Moodle GIFT", ".gift"],
  ["JFLAP", ".jff"],
  ["PlantUML", ".puml", ".plantuml"],
  ["Mermaid", ".mmd", ".mermaid"],
  ["FASTA", ".fa", ".fasta"],
  ["Graphviz DOT", ".dot", ".gv", "text/vnd.graphviz"],
]

const knownFormats = new Map(definitions.flatMap(([label, key, ...aliases]) =>
  [key, ...aliases].map(alias => [alias, {key, label}] as const)))

export function groupWidgetFileFormats(formats: readonly string[]) {
  const groups = new Map<string, {label: string, formats: string[]}>()
  for(const format of formats) {
    const normalized = format.toLowerCase()
    const known = knownFormats.get(normalized)
    const key = known?.key ?? normalized
    let group = groups.get(key)
    if(!group) {
      const label = known?.label ?? (format.startsWith(".") ? format.slice(1).toUpperCase() : format)
      groups.set(key, group = {label, formats: []})
    }
    group.formats.push(format)
  }
  return [...groups.values()]
}
