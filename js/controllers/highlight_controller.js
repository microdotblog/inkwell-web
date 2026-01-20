import { Controller } from "../stimulus.js";
import { saveHighlight } from "../storage/highlights.js";

export default class extends Controller {
  static targets = ["content", "toolbar"];

  connect() {
    this.handleSelection = this.handleSelection.bind(this);
    this.hideToolbar = this.hideToolbar.bind(this);
    this.contentTarget.addEventListener("mouseup", this.handleSelection);
    this.contentTarget.addEventListener("keyup", this.handleSelection);
    document.addEventListener("scroll", this.hideToolbar, true);
  }

  disconnect() {
    this.contentTarget.removeEventListener("mouseup", this.handleSelection);
    this.contentTarget.removeEventListener("keyup", this.handleSelection);
    document.removeEventListener("scroll", this.hideToolbar, true);
  }

  handleSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      this.hideToolbar();
      return;
    }

    const range = selection.getRangeAt(0);
    if (!this.contentTarget.contains(range.commonAncestorContainer)) {
      this.hideToolbar();
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      this.hideToolbar();
      return;
    }

    this.currentSelection = text;
    const rect = range.getBoundingClientRect();
    const containerRect = this.element.getBoundingClientRect();
    const top = rect.top - containerRect.top + this.element.scrollTop - 48;
    const left = rect.left - containerRect.left + this.element.scrollLeft;

    this.toolbarTarget.style.top = `${Math.max(12, top)}px`;
    this.toolbarTarget.style.left = `${Math.max(12, left)}px`;
    this.toolbarTarget.hidden = false;
  }

  async create() {
    const text = this.currentSelection;
    if (!text) {
      return;
    }

    const highlight = {
      id: `hl-${Date.now()}`,
      post_id: this.contentTarget.dataset.postId || "",
      post_url: this.contentTarget.dataset.postUrl || "",
      post_title: this.contentTarget.dataset.postTitle || "",
      text,
      html: text,
      start_offset: null,
      end_offset: null,
      intent: "highlight",
      created_at: new Date().toISOString()
    };

    try {
      await saveHighlight(highlight);
    }
    catch (error) {
      console.warn("Failed to save highlight", error);
    }

    window.dispatchEvent(new CustomEvent("highlight:create", { detail: highlight }));
    this.clearSelection();
  }

  clearSelection() {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    this.currentSelection = "";
    this.hideToolbar();
  }

  hideToolbar() {
    this.toolbarTarget.hidden = true;
  }
}
