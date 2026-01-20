import { Controller } from "../stimulus.js";
import { fetchReadableContent } from "../api/content.js";
import { markRead, markUnread } from "../storage/reads.js";

export default class extends Controller {
  static targets = ["content", "title", "meta", "markUnread", "avatar"];

  connect() {
    this.handlePostOpen = this.handlePostOpen.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    window.addEventListener("post:open", this.handlePostOpen);
    window.addEventListener("keydown", this.handleKeydown);
    this.showPlaceholder();
  }

  disconnect() {
    window.removeEventListener("post:open", this.handlePostOpen);
    window.removeEventListener("keydown", this.handleKeydown);
  }

  async handlePostOpen(event) {
    const { post } = event.detail;
    if (!post) {
      return;
    }

    this.currentPostTitle = post.title || "Untitled";
    this.currentPostId = post.id;
    this.currentPostRead = Boolean(post.is_read);
    this.markUnreadTarget.disabled = false;
    this.updateReadButton();
    this.setTitle(this.currentPostTitle);
    this.metaTarget.textContent = `${post.source} - ${this.formatDate(post.published_at)}`;
    this.contentTarget.innerHTML = "<p class=\"loading\">Loading readable view...</p>";
    this.avatarTarget.hidden = false;
    this.avatarTarget.src = post.avatar_url || "/images/avatar-placeholder.svg";
    this.avatarTarget.alt = "";
    this.contentTarget.dataset.postTitle = this.currentPostTitle;

    const payload = await fetchReadableContent(post.id);
    const html = payload.html || `<p>${post.summary || "No preview available yet."}</p>`;
    this.currentPostTitle = payload.title || post.title || "Untitled";
    this.setTitle(this.currentPostTitle);
    this.metaTarget.textContent = payload.byline || `${post.source} - ${this.formatDate(post.published_at)}`;
    this.contentTarget.innerHTML = html;
    this.contentTarget.dataset.postId = post.id;
    this.contentTarget.dataset.postUrl = post.url;
    this.contentTarget.dataset.postTitle = this.currentPostTitle;
    this.dispatch("ready", { detail: { postId: post.id }, prefix: "reader" });
  }

  showPlaceholder() {
    this.currentPostId = null;
    this.currentPostRead = false;
    this.markUnreadTarget.disabled = true;
    this.updateReadButton();
    this.avatarTarget.hidden = true;
    this.avatarTarget.src = "/images/avatar-placeholder.svg";
    this.avatarTarget.alt = "";
    this.setTitle("Select a post");
    this.contentTarget.dataset.postTitle = "";
    this.contentTarget.innerHTML = "<p class=\"loading\">Choose a post from the timeline to begin reading.</p>";
  }

  async toggleRead() {
    if (!this.currentPostId) {
      return;
    }

    try {
      if (this.currentPostRead) {
        await markUnread(this.currentPostId);
      }
      else {
        await markRead(this.currentPostId);
      }
    }
    catch (error) {
      console.warn("Failed to toggle read state", error);
    }

    this.currentPostRead = !this.currentPostRead;
    this.updateReadButton();
    const eventName = this.currentPostRead ? "post:read" : "post:unread";
    window.dispatchEvent(new CustomEvent(eventName, { detail: { postId: this.currentPostId } }));
  }

  handleKeydown(event) {
    if (this.shouldIgnoreKey(event)) {
      return;
    }

    if (event.key.toLowerCase() === "u") {
      event.preventDefault();
      this.toggleRead();
    }
  }

  shouldIgnoreKey(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return true;
    }

    const target = event.target;
    if (!target) {
      return false;
    }

    if (target.isContentEditable) {
      return true;
    }

    const tagName = target.tagName;
    return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
  }

  updateReadButton() {
    if (!this.markUnreadTarget) {
      return;
    }

    this.markUnreadTarget.textContent = this.currentPostRead ? "Mark Unread" : "Mark Read";
  }

  setTitle(title) {
    const trimmed = title ? title.trim() : "";
    const label = this.truncateTitle(trimmed || "Untitled");
    this.titleTarget.textContent = label;
    this.titleTarget.title = trimmed || "Untitled";
  }

  truncateTitle(title) {
    const words = title.trim().split(/\s+/);
    if (words.length <= 3) {
      return title;
    }

    return `${words.slice(0, 3).join(" ")}...`;
  }

  formatDate(isoDate) {
    const date = new Date(isoDate);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric"
    }).format(date);
  }
}
