export class Block {
    constructor(attributes, content = null) {
        if (!attributes?.type) {
            throw TypeError("Missing required 'type' attribute in Block");
        }
        let attrs = { type: "", ...attributes };
        this.attributes = { ...attrs };
        this.content = content;
    }
}
export class Document {
    constructor(id, url, attributes = { type: "document" }, content = []) {
        this.content = [];
        this.id = id;
        this.url = url;
        this.attributes = attributes;
        this.content = content;
    }
    get revisions() {
        const dateModified = this.attributes?.dateModified;
        const author = this.attributes?.author;
        return Array.isArray(author) ? author.map((author, i) => ({ author, date: dateModified[i] })) : [];
    }
}
export class WWURL extends URL {
    constructor(url, base) {
        super(url, base);
        const protocol = this.protocol.slice(0, -1);
        const format = this.wwformat;
    }
    get wwformat() {
        return this.pathname.slice((this.pathname.lastIndexOf(".") - 1 >>> 0) + 2);
    }
    set wwformat(value) {
        const i = this.pathname.lastIndexOf(this.wwformat);
        this.pathname = this.pathname.slice(0, i) + (i > -1 ? "." : "") + value;
    }
}
