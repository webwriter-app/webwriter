import { EditorStateWithHead } from "../core/model";
import { DOMSerializer } from "prosemirror-model";

export function formatHTMLToPlainText(html: string): string {
  // Create a DOM parser to parse the HTML string
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Recursive function to traverse and extract text content
  function extractText(node: Node): string {
    let text = "";

    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        // Add text content
        text += (child as Text).textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = (child as Element).tagName.toLowerCase();

        // Add line breaks before certain elements
        if (
          tagName === "p" ||
          tagName === "h1" ||
          tagName === "h2" ||
          tagName === "h3"
        ) {
          text += "\n";
        }

        text += extractText(child);

        // Add line breaks after certain elements
        if (
          tagName === "p" ||
          tagName === "h1" ||
          tagName === "h2" ||
          tagName === "h3" ||
          tagName === "br"
        ) {
          text += "\n";
        }
      }
    });

    return text;
  }

  // Extract text from the document body
  const plainText = extractText(doc.body);

  // Remove extra line breaks and trim whitespace
  return plainText
    .replace(/\n\s*\n/g, "\n\n") // Replace multiple line breaks with a single double line break
    .trim(); // Trim leading and trailing whitespace
}
