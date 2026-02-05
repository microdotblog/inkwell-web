import { Controller } from "../stimulus.js";
import { deleteMicroBlogHighlight } from "../api/highlights.js";
import { deleteHighlight, getHighlightsForPost } from "../storage/highlights.js";

export default class extends Controller {
  static targets = ["readerPane", "highlightsPane", "list", "toggle", "readerTab", "tabs"];

  connect() {
    this.activePostId = null;
		this.activePostSource = "";
		this.activePostHasTitle = false;
    this.highlights = [];
    this.handleHighlight = this.handleHighlight.bind(this);
		this.handleHighlightUpdate = this.handleHighlightUpdate.bind(this);
    this.handlePostOpen = this.handlePostOpen.bind(this);
		this.handleSummary = this.handleSummary.bind(this);
    window.addEventListener("highlight:create", this.handleHighlight);
		window.addEventListener("highlight:update", this.handleHighlightUpdate);
    window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("reader:summary", this.handleSummary);
    this.render();
  }

  disconnect() {
    window.removeEventListener("highlight:create", this.handleHighlight);
		window.removeEventListener("highlight:update", this.handleHighlightUpdate);
    window.removeEventListener("post:open", this.handlePostOpen);
		window.removeEventListener("reader:summary", this.handleSummary);
  }

  async handlePostOpen(event) {
    const { post } = event.detail;
    this.activePostId = post?.id || null;
		this.activePostSource = post?.source || "";
		this.activePostHasTitle = this.hasPostTitle(post?.title, post?.summary);
    this.highlights = await getHighlightsForPost(this.activePostId);
    this.showReader();
    this.render();
  }

	handleSummary() {
		this.activePostId = null;
		this.activePostSource = "";
		this.activePostHasTitle = false;
		this.highlights = [];
		this.showReader();
		this.render();
	}

  handleHighlight(event) {
    const highlight = event.detail;
    if (!highlight || highlight.post_id != this.activePostId) {
      return;
    }

    this.highlights = [highlight, ...this.highlights];
    this.render();
  }

	handleHighlightUpdate(event) {
		const highlight = event.detail;
		if (!highlight || highlight.post_id != this.activePostId) {
			return;
		}

		const highlight_index = this.highlights.findIndex((item) => item.id == highlight.id);
		if (highlight_index < 0) {
			return;
		}

		this.highlights[highlight_index] = { ...this.highlights[highlight_index], ...highlight };
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
    this.toggleTarget.hidden = count == 0;
    this.tabsTarget.classList.toggle("is-single", count == 0);

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
		const new_window = window.open(url, "_blank", "noopener");
		if (!new_window) {
			window.location.href = url;
		}
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

		let remote_failed = false;
		if (highlight.highlight_id) {
			try {
				await deleteMicroBlogHighlight({
					post_id: highlight.post_id,
					highlight_id: highlight.highlight_id
				});
			}
			catch (error) {
				remote_failed = true;
				console.warn("Failed to delete Micro.blog highlight", error);
			}
		}

		try {
			await deleteHighlight(highlight.post_id, highlight.id);
		}
		catch (error) {
			console.warn("Failed to delete highlight locally", error);
			return;
		}

		this.highlights = this.highlights.filter((item) => item.id != highlight.id);
		this.render();

		if (remote_failed) {
			console.warn("Micro.blog highlight delete failed; local highlight removed");
		}
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
		const post_title = (highlight.post_title || "").trim();
		const fallback_source = (this.activePostSource || "").trim();
		const post_source = (highlight.post_source || fallback_source).trim();
		const post_has_title = (highlight.post_has_title != null)
			? highlight.post_has_title == true
			: this.activePostHasTitle;
		let link_title = post_title;
		if (!post_has_title || !link_title || link_title.toLowerCase() == "untitled") {
			link_title = post_source || "Post";
		}
		const post_url = (highlight.post_url || "").trim();
		const link = post_url ? `[${link_title}](${post_url})` : link_title;
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

	hasPostTitle(title, summary) {
		const normalized_title = (title || "").trim().replace(/\s+/g, " ");
		if (!normalized_title || normalized_title.toLowerCase() == "untitled") {
			return false;
		}

		const normalized_summary = (summary || "").trim().replace(/\s+/g, " ");
		if (normalized_summary) {
			if (normalized_summary == normalized_title) {
				return false;
			}

			const shared_prefix = normalized_title.startsWith(normalized_summary) ||
				normalized_summary.startsWith(normalized_title);
			const prefix_length = Math.min(normalized_title.length, normalized_summary.length);
			if (shared_prefix && prefix_length >= 40) {
				return false;
			}
		}

		return true;
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
