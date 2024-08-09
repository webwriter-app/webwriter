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

// Example usage
const htmlInput = `
<body>
  <h1>Test Dokument</h1>
  <p>Normaler Text <b>Bold</b> <i>Italic</i></p>
  <p></p>
  <p><span>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla mattis leo nisi, vel malesuada magna lacinia sit amet. Phasellus porta eu diam at dignissim. Cras faucibus lobortis posuere. Mauris turpis lacus, vestibulum eget odio vel, ultricies laoreet lectus. Nullam accumsan feugiat ex. Nunc ac erat nec magna pulvinar facilisis. Nam et mi at libero eleifend luctus sed ac urna. Nunc porttitor, ipsum ac dapibus pellentesque, est purus vulputate sem, nec dapibus leo neque posuere tellus. Quisque bibendum lectus quis lacus eleifend, placerat facilisis sapien iaculis. Quisque viverra lacinia eros, non tempor sapien malesuada eu.</span></p>
  <webwriter-slides class="ww-widget ww-v0.1.1">
    <webwriter-slide class="ww-widget ww-v0.1.1" active="">
      <h1>Slides</h1>
      <p></p>
      <p>Slide 1 Text&nbsp;</p>
    </webwriter-slide>
    <webwriter-slide class="ww-widget ww-v0.1.1">
      <p>Slide 2 Text</p>
    </webwriter-slide>
  </webwriter-slides>
  <p></p>
</body>
`;

console.log(formatHTMLToPlainText(htmlInput));
