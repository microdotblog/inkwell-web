import { Controller } from "../stimulus.js";
import { deleteHighlight, getHighlightsForPost } from "../storage/highlights.js";

export default class extends Controller {
  static targets = ["readerPane", "highlightsPane", "list", "toggle", "readerTab"];

  connect() {
    this.activePostId = null;
    this.highlights = [];
    this.handleHighlight = this.handleHighlight.bind(this);
    this.handlePostOpen = this.handlePostOpen.bind(this);
    window.addEventListener("highlight:create", this.handleHighlight);
    window.addEventListener("post:open", this.handlePostOpen);
    this.render();
  }

  disconnect() {
    window.removeEventListener("highlight:create", this.handleHighlight);
    window.removeEventListener("post:open", this.handlePostOpen);
  }

  async handlePostOpen(event) {
    const { post } = event.detail;
    this.activePostId = post?.id || null;
    this.highlights = await getHighlightsForPost(this.activePostId);
    this.showReader();
    this.render();
  }

  handleHighlight(event) {
    const highlight = event.detail;
    if (!highlight || highlight.post_id !== this.activePostId) {
      return;
    }

    this.highlights = [highlight, ...this.highlights];
    this.render();
  }

  showHighlights() {
    if (!this.highlights.length) {
      return;
    }

    this.readerPaneTarget.hidden = true;
    this.highlightsPaneTarget.hidden = false;
    this.updateTabs("highlights");
  }

  showReader() {
    this.highlightsPaneTarget.hidden = true;
    this.readerPaneTarget.hidden = false;
    this.updateTabs("reader");
  }

  render() {
    const count = this.highlights.length;
    const label = `${count} highlight${count === 1 ? "" : "s"}`;
    this.toggleTarget.textContent = label;
    this.toggleTarget.hidden = count === 0;

    if (!count) {
      this.listTarget.innerHTML = "<p class=\"highlights-empty\">No highlights yet.</p>";
      return;
    }

    const items = this.highlights
      .map((highlight) => {
        return `
          <div class="highlight-item" data-highlight-id="${highlight.id}">
            <div class="highlight-text">${highlight.text}</div>
            <div class="highlight-actions">
              <button type="button" class="btn-sm" data-action="highlights#newPost">New Post...</button>
              <button type="button" class="btn-sm" data-action="highlights#copyHighlight">Copy</button>
              <button type="button" class="btn-sm is-destructive" data-action="highlights#deleteHighlight">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");

    this.listTarget.innerHTML = items;
  }

  updateTabs(activeTab) {
    const isReader = activeTab === "reader";
    this.readerTabTarget.setAttribute("aria-pressed", isReader ? "true" : "false");
    this.toggleTarget.setAttribute("aria-pressed", isReader ? "false" : "true");
  }

  newPost(event) {
    const highlight = this.getHighlightFromEvent(event);
    if (!highlight) {
      return;
    }

    const markdown = this.buildPostMarkdown(highlight);
    const encoded = encodeURIComponent(markdown);
    const url = `https://micro.blog/post?text=${encoded}`;
    window.location.href = url;
  }

  async copyHighlight(event) {
    const text = this.getHighlightText(event);
    if (!text) {
      return;
    }

    const button = event.currentTarget;
    try {
      await this.copyToClipboard(text);
      this.showCopiedState(button);
    }
    catch (error) {
      console.warn("Failed to copy highlight", error);
    }
  }

  async deleteHighlight(event) {
    const highlight = this.getHighlightFromEvent(event);
    if (!highlight) {
      return;
    }

    try {
      await deleteHighlight(highlight.post_id, highlight.id);
    }
    catch (error) {
      console.warn("Failed to delete highlight", error);
      return;
    }

    this.highlights = this.highlights.filter((item) => item.id !== highlight.id);
    this.render();
  }

  getHighlightFromEvent(event) {
    const item = event.currentTarget.closest(".highlight-item");
    if (!item) {
      return null;
    }

    const id = item.dataset.highlightId;
    return this.highlights.find((highlight) => highlight.id === id) || null;
  }

  getHighlightText(event) {
    const item = event.currentTarget.closest(".highlight-item");
    if (!item) {
      return "";
    }

    const textEl = item.querySelector(".highlight-text");
    return textEl ? textEl.textContent.trim() : "";
  }

  buildPostMarkdown(highlight) {
    const title = (highlight.post_title || "Post").trim();
    const url = (highlight.post_url || "").trim();
    const link = url ? `[${title}](${url})` : title;
    const quote = this.formatQuote(highlight.text || "");

    if (!quote) {
      return link;
    }

    return `${link}\n\n${quote}`;
  }

  formatQuote(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      return "";
    }

    return trimmed
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join("\n");
  }

  async copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  showCopiedState(button) {
    if (!button) {
      return;
    }

    if (!button.dataset.label) {
      button.dataset.label = button.textContent;
    }

    button.textContent = "✓ Copied";
    button.classList.add("is-copied");
  }
}
