import { DocumentClient } from ".";
  
export class HTTPClient implements DocumentClient {

  isClientURL(url: URL) {
    return url.protocol === "https:" || url.protocol === "http:"
  }

  async loadDocument(url?: string | URL) {
    if (!url) {
      return undefined;
    }
    const response = await fetch(url);
    const blob = await response.blob();
    const content = await blob.text();
    return content;
  }
}