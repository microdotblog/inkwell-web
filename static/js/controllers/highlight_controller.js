import { Controller } from "../stimulus.js";
import { createMicroBlogHighlight } from "../api/highlights.js";
import { saveHighlight, updateHighlight } from "../storage/highlights.js";

export default class extends Controller {
  static targets = ["content", "toolbar"];

  connect() {
    this.handleSelection = this.handleSelection.bind(this);
    this.hideToolbar = this.hideToolbar.bind(this);
		this.handleSummary = this.handleSummary.bind(this);
    this.contentTarget.addEventListener("mouseup", this.handleSelection);
    this.contentTarget.addEventListener("keyup", this.handleSelection);
		window.addEventListener("reader:summary", this.handleSummary);
    document.addEventListener("scroll", this.hideToolbar, true);
  }

  disconnect() {
    this.contentTarget.removeEventListener("mouseup", this.handleSelection);
    this.contentTarget.removeEventListener("keyup", this.handleSelection);
		window.removeEventListener("reader:summary", this.handleSummary);
    document.removeEventListener("scroll", this.hideToolbar, true);
  }

  handleSelection() {
		if (this.isSummaryMode()) {
			this.hideToolbar();
			return;
		}

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

		const raw_text = selection.toString();
		const trimmed_text = raw_text.trim();
		if (!trimmed_text) {
			this.hideToolbar();
			return;
		}

		this.currentSelection = trimmed_text;
		this.currentSelectionRaw = raw_text;
		this.currentSelectionRange = range.cloneRange();

		const rect = range.getBoundingClientRect();
		const container_rect = this.element.getBoundingClientRect();
		const toolbar = this.toolbarTarget;
		toolbar.hidden = false;
		toolbar.style.visibility = "hidden";

		const toolbar_width = toolbar.offsetWidth || toolbar.getBoundingClientRect().width;
		const top = rect.top - container_rect.top + this.element.scrollTop - 48;
		const selection_center = rect.left - container_rect.left + this.element.scrollLeft + (rect.width / 2);
		let left = selection_center - (toolbar_width / 2);
		const padding = 12;
		const max_left = Math.max(padding, this.element.clientWidth - toolbar_width - padding);

		if (left < padding) {
			left = padding;
		}
		if (left > max_left) {
			left = max_left;
		}

		toolbar.style.top = `${Math.max(padding, top)}px`;
		toolbar.style.left = `${left}px`;
		toolbar.style.visibility = "visible";
  }

  async create() {
		if (this.isSummaryMode()) {
			return;
		}

		const text = this.currentSelection;
		if (!text) {
			return;
		}

		const selection_payload = this.getSelectionPayload();
		const selection_text = selection_payload.selection_text || text;

		const highlight = {
			id: `hl-${Date.now()}`,
			post_id: this.contentTarget.dataset.postId || "",
			post_url: this.contentTarget.dataset.postUrl || "",
			post_title: this.contentTarget.dataset.postTitle || "",
			post_source: this.contentTarget.dataset.postSource || "",
			post_has_title: this.contentTarget.dataset.postHasTitle == "true",
			text,
			html: text,
			start_offset: selection_payload.start_offset,
			end_offset: selection_payload.end_offset,
			intent: "highlight",
			created_at: new Date().toISOString()
		};

		try {
			await saveHighlight(highlight);
		}
		catch (error) {
			console.warn("Failed to save highlight", error);
		}

		this.syncHighlightToMicroBlog(highlight, {
			text: selection_text,
			start_offset: selection_payload.start_offset,
			end_offset: selection_payload.end_offset
		});

		window.dispatchEvent(new CustomEvent("highlight:create", { detail: highlight }));
		this.clearSelection();
  }

	newPost() {
		if (this.isSummaryMode()) {
			return;
		}

		const text = this.currentSelection;
		if (!text) {
			return;
		}

		const post_url = (this.contentTarget.dataset.postUrl || "").trim();
		if (!post_url) {
			return;
		}

		const post_title = (this.contentTarget.dataset.postTitle || "").trim();
		const post_source = (this.contentTarget.dataset.postSource || "").trim();
		const post_has_title = this.contentTarget.dataset.postHasTitle == "true";
		let link_title = post_title;
		if (!post_has_title || !link_title || link_title.toLowerCase() == "untitled") {
			link_title = post_source || "Post";
		}
		const link = `[${link_title}](${post_url})`;
		const quote = this.formatQuote(text);
		const markdown = quote ? `${link}:\n\n${quote}` : link;
		const encoded = encodeURIComponent(markdown);
		window.location.href = `https://micro.blog/post?text=${encoded}`;
		this.clearSelection();
	}

  clearSelection() {
		const selection = window.getSelection();
		if (selection) {
			selection.removeAllRanges();
		}
		this.currentSelection = "";
		this.currentSelectionRaw = "";
		this.currentSelectionRange = null;
		this.hideToolbar();
  }

	formatQuote(text) {
		const trimmed = (text || "").trim();
		if (!trimmed) {
			return "";
		}

		return trimmed
			.split(/\r?\n/)
			.map((line) => `> ${line}`)
			.join("\n");
	}

  hideToolbar() {
		this.toolbarTarget.hidden = true;
		this.toolbarTarget.style.visibility = "";
  }

	getSelectionPayload() {
		const selection_range = this.currentSelectionRange;
		if (!selection_range) {
			return {
				selection_text: this.currentSelectionRaw || this.currentSelection,
				start_offset: null,
				end_offset: null
			};
		}

		try {
			const root_range = document.createRange();
			root_range.selectNodeContents(this.contentTarget);
			root_range.setEnd(selection_range.startContainer, selection_range.startOffset);
			const start_offset = root_range.toString().length;
			const selection_text = selection_range.toString();
			const end_offset = start_offset + selection_text.length;

			return { selection_text, start_offset, end_offset };
		}
		catch (error) {
			return {
				selection_text: this.currentSelectionRaw || this.currentSelection,
				start_offset: null,
				end_offset: null
			};
		}
	}

	async syncHighlightToMicroBlog(highlight, { text, start_offset, end_offset }) {
		if (!highlight || !highlight.post_id || !text) {
			return;
		}

		try {
			const response_data = await createMicroBlogHighlight({
				post_id: highlight.post_id,
				text,
				start_offset,
				end_offset
			});
			const highlight_id = response_data?.id ? String(response_data.id) : "";
			if (!highlight_id) {
				return;
			}

			const updated_highlight = await updateHighlight(
				highlight.post_id,
				highlight.id,
				{ highlight_id }
			);
			if (updated_highlight) {
				window.dispatchEvent(new CustomEvent("highlight:update", { detail: updated_highlight }));
			}
		}
		catch (error) {
			console.warn("Failed to save highlight to Micro.blog", error);
		}
	}

	handleSummary() {
		this.hideToolbar();
	}

	isSummaryMode() {
		return this.element.classList.contains("is-summary");
	}
}
