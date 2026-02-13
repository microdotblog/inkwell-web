import { Controller } from "../stimulus.js";
import { deleteMicroBlogHighlight } from "../api/highlights.js";
import { deleteHighlight, getAllHighlights, getHighlightsForPost } from "../storage/highlights.js";

const EMPTY_POST_MESSAGE = "No highlights yet.";
const EMPTY_ALL_MESSAGE = "No highlights saved yet.";

export default class extends Controller {
	static targets = [
		"readerPane",
		"highlightsPane",
		"list",
		"toggle",
		"readerTab",
		"tabs",
		"readerView",
		"pane",
		"globalList"
	];

	connect() {
		this.activePostId = null;
		this.activePostSource = "";
		this.activePostHasTitle = false;
		this.highlights = [];
		this.globalHighlights = [];
		this.isVisible = false;
		this.handleHighlight = this.handleHighlight.bind(this);
		this.handleHighlightUpdate = this.handleHighlightUpdate.bind(this);
		this.handlePostOpen = this.handlePostOpen.bind(this);
		this.handleSummary = this.handleSummary.bind(this);
		this.handleWelcome = this.handleWelcome.bind(this);
		this.handleOpenAll = this.handleOpenAll.bind(this);
		this.handleSubscriptionsOpen = this.handleSubscriptionsOpen.bind(this);
		this.handleThemesOpen = this.handleThemesOpen.bind(this);
		window.addEventListener("highlight:create", this.handleHighlight);
		window.addEventListener("highlight:update", this.handleHighlightUpdate);
		window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("reader:summary", this.handleSummary);
		window.addEventListener("reader:welcome", this.handleWelcome);
		window.addEventListener("reader:blank", this.handleWelcome);
		window.addEventListener("highlights:open", this.handleOpenAll);
		window.addEventListener("subscriptions:open", this.handleSubscriptionsOpen);
		window.addEventListener("themes:open", this.handleThemesOpen);
		this.render();
		this.renderGlobal();
	}

	disconnect() {
		window.removeEventListener("highlight:create", this.handleHighlight);
		window.removeEventListener("highlight:update", this.handleHighlightUpdate);
		window.removeEventListener("post:open", this.handlePostOpen);
		window.removeEventListener("reader:summary", this.handleSummary);
		window.removeEventListener("reader:welcome", this.handleWelcome);
		window.removeEventListener("reader:blank", this.handleWelcome);
		window.removeEventListener("highlights:open", this.handleOpenAll);
		window.removeEventListener("subscriptions:open", this.handleSubscriptionsOpen);
		window.removeEventListener("themes:open", this.handleThemesOpen);
	}

	async handlePostOpen(event) {
		const post = event.detail?.post || null;
		this.hidePane();
		this.activePostId = post?.id || null;
		this.activePostSource = post?.source || "";
		this.activePostHasTitle = this.hasPostTitle(post?.title, post?.summary);
		this.highlights = await getHighlightsForPost(this.activePostId);
		this.showReader();
		this.render();
	}

	handleSummary() {
		this.hidePane();
		this.activePostId = null;
		this.activePostSource = "";
		this.activePostHasTitle = false;
		this.highlights = [];
		this.showReader();
		this.render();
	}

	handleWelcome() {
		this.hidePane();
		this.showReader();
	}

	async handleOpenAll() {
		await this.loadAllHighlights();
		this.showPane();
		this.renderGlobal();
	}

	handleSubscriptionsOpen() {
		this.hidePane();
	}

	handleThemesOpen() {
		this.hidePane();
	}

	handleHighlight(event) {
		const highlight = event.detail;
		if (!highlight) {
			return;
		}

		this.globalHighlights = this.prependHighlight(this.globalHighlights, highlight);
		if (highlight.post_id != this.activePostId) {
			if (this.isVisible) {
				this.renderGlobal();
			}
			return;
		}

		this.highlights = this.prependHighlight(this.highlights, highlight);
		this.render();
		if (this.isVisible) {
			this.renderGlobal();
		}
	}

	handleHighlightUpdate(event) {
		const highlight = event.detail;
		if (!highlight) {
			return;
		}

		this.globalHighlights = this.updateHighlightCollection(this.globalHighlights, highlight);
		if (highlight.post_id == this.activePostId) {
			this.highlights = this.updateHighlightCollection(this.highlights, highlight);
			this.render();
		}
		if (this.isVisible) {
			this.renderGlobal();
		}
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

	showPane() {
		if (this.isVisible) {
			this.resetScrollPosition();
			return;
		}

		window.dispatchEvent(new CustomEvent("subscriptions:close"));
		window.dispatchEvent(new CustomEvent("themes:close"));
		this.paneTarget.hidden = false;
		this.readerViewTarget.hidden = true;
		this.setReaderEmptyState(false);
		this.isVisible = true;
		this.resetScrollPosition();
	}

	hidePane() {
		if (!this.isVisible) {
			return;
		}
		this.paneTarget.hidden = true;
		this.readerViewTarget.hidden = false;
		this.isVisible = false;
	}

	render() {
		const count = this.highlights.length;
		const label = `${count} highlight${count == 1 ? "" : "s"}`;
		this.toggleTarget.textContent = label;
		this.toggleTarget.hidden = count == 0;
		this.tabsTarget.classList.toggle("is-single", count == 0);
		this.renderHighlightsList(this.listTarget, this.highlights, EMPTY_POST_MESSAGE);
	}

	renderGlobal() {
		if (!this.hasGlobalListTarget) {
			return;
		}
		this.renderHighlightsList(this.globalListTarget, this.globalHighlights, EMPTY_ALL_MESSAGE);
	}

	renderHighlightsList(target, highlights, empty_message) {
		if (!target) {
			return;
		}

		if (!highlights.length) {
			target.innerHTML = `<p class="highlights-empty">${this.escapeHtml(empty_message)}</p>`;
			return;
		}

		const items = highlights.map((highlight) => this.renderHighlightItem(highlight)).join("");
		target.innerHTML = items;
	}

	renderHighlightItem(highlight) {
		const highlight_id = this.escapeAttribute(highlight.id || "");
		const post_id = this.escapeAttribute(highlight.post_id || "");
		const text = this.escapeHtml((highlight.text || "").trim());
		const post_label = this.escapeHtml(this.getPostLabel(highlight));
		const post_url = this.resolvePostUrl(highlight);
		const safe_post_url = this.escapeAttribute(post_url);
		const date_text = this.escapeHtml(this.formatHighlightDate(highlight));
		const title_content = post_label || "Post";
		const is_external = /^https?:\/\//i.test(post_url);
		let title_markup = `<span class="highlight-post-title">${title_content}</span>`;
		if (post_url) {
			const target_attr = is_external ? " target=\"_blank\" rel=\"noopener noreferrer\"" : "";
			title_markup = `<a class="highlight-post-title highlight-post-link" href="${safe_post_url}"${target_attr}>${title_content}</a>`;
		}

		return `
			<div class="highlight-item" data-highlight-id="${highlight_id}" data-post-id="${post_id}">
				<div class="highlight-text">${text}</div>
				<div class="highlight-post-row">${title_markup}</div>
				<p class="highlight-date">${date_text}</p>
				<div class="highlight-actions">
					<button type="button" class="btn-sm" data-action="highlights#newPost">New Post...</button>
					<button type="button" class="btn-sm" data-action="highlights#copyHighlight">Copy</button>
					<button type="button" class="btn-sm is-destructive" data-action="highlights#deleteHighlight">Delete</button>
				</div>
			</div>
		`;
	}

	updateTabs(active_tab) {
		const is_reader = active_tab == "reader";
		this.readerTabTarget.setAttribute("aria-pressed", is_reader ? "true" : "false");
		this.toggleTarget.setAttribute("aria-pressed", is_reader ? "false" : "true");
	}

	newPost(event) {
		const highlight = this.getHighlightFromEvent(event);
		if (!highlight) {
			return;
		}

		const markdown = this.buildPostMarkdown(highlight);
		const encoded = encodeURIComponent(markdown);
		const url = `https://micro.blog/post?text=${encoded}`;
		window.open(url, "_blank", "noopener,noreferrer");
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

		this.highlights = this.highlights.filter((item) => !this.isSameHighlight(item, highlight));
		this.globalHighlights = this.globalHighlights.filter((item) => !this.isSameHighlight(item, highlight));
		this.render();
		if (this.isVisible) {
			this.renderGlobal();
		}

		if (remote_failed) {
			console.warn("Micro.blog highlight delete failed; local highlight removed");
		}
	}

	getHighlightFromEvent(event) {
		const item = event.currentTarget.closest(".highlight-item");
		if (!item) {
			return null;
		}

		const highlight_id = item.dataset.highlightId || "";
		const post_id = item.dataset.postId || "";
		const all_highlights = [...this.highlights, ...this.globalHighlights];
		return all_highlights.find((highlight) => {
			if (!highlight || highlight.id != highlight_id) {
				return false;
			}
			return String(highlight.post_id || "") == post_id;
		}) || null;
	}

	getHighlightText(event) {
		const item = event.currentTarget.closest(".highlight-item");
		if (!item) {
			return "";
		}

		const text_el = item.querySelector(".highlight-text");
		return text_el ? text_el.textContent.trim() : "";
	}

	buildPostMarkdown(highlight) {
		const post_label = this.getPostLabel(highlight);
		const post_url = (highlight.post_url || "").trim();
		const link = post_url ? `[${post_label}](${post_url})` : post_label;
		const quote = this.formatQuote(highlight.text || "");

		if (!quote) {
			return link;
		}

		return `${link}:\n\n${quote}`;
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

	getPostLabel(highlight) {
		const post_title = (highlight.post_title || "").trim();
		const fallback_source = (this.activePostSource || "").trim();
		const post_source = (highlight.post_source || fallback_source).trim();
		const post_has_title = (highlight.post_has_title != null)
			? highlight.post_has_title == true
			: this.activePostHasTitle;

		let label = post_title;
		if (!post_has_title || !label || label.toLowerCase() == "untitled") {
			label = post_source || "Post";
		}
		return label;
	}

	resolvePostUrl(highlight) {
		const post_url = (highlight.post_url || "").trim();
		if (/^https?:\/\//i.test(post_url)) {
			return post_url;
		}

		const post_id = (highlight.post_id || "").trim();
		if (!post_id) {
			return "";
		}
		return `#/post/${encodeURIComponent(post_id)}`;
	}

	formatHighlightDate(highlight) {
		const date = this.getHighlightDate(highlight);
		if (!date) {
			return "";
		}

		const date_text = new Intl.DateTimeFormat("en-US", {
			month: "numeric",
			day: "numeric",
			year: "numeric"
		}).format(date);
		const time_text = new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true
		}).format(date).toLowerCase();
		return `${date_text} ${time_text}`;
	}

	getHighlightDate(highlight) {
		const created_at = this.parseDate(highlight?.created_at);
		if (created_at) {
			return created_at;
		}

		const published_at = this.parseDate(highlight?.post_published_at);
		if (published_at) {
			return published_at;
		}

		const local_id = typeof highlight?.id == "string" ? highlight.id : "";
		const local_match = local_id.match(/^hl-(\d+)$/);
		if (!local_match) {
			return null;
		}

		const timestamp = Number(local_match[1]);
		if (!Number.isFinite(timestamp)) {
			return null;
		}
		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) {
			return null;
		}
		return date;
	}

	parseDate(raw_value) {
		if (!raw_value) {
			return null;
		}

		const date = new Date(raw_value);
		if (Number.isNaN(date.getTime())) {
			return null;
		}
		return date;
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

	prependHighlight(collection, highlight) {
		const filtered = collection.filter((item) => !this.isSameHighlight(item, highlight));
		return [highlight, ...filtered];
	}

	updateHighlightCollection(collection, highlight) {
		const index = collection.findIndex((item) => this.isSameHighlight(item, highlight));
		if (index < 0) {
			return collection;
		}

		const updated = [...collection];
		updated[index] = { ...updated[index], ...highlight };
		return updated;
	}

	isSameHighlight(a, b) {
		if (!a || !b) {
			return false;
		}

		if (a.id != b.id) {
			return false;
		}

		return String(a.post_id || "") == String(b.post_id || "");
	}

	async loadAllHighlights() {
		try {
			this.globalHighlights = await getAllHighlights();
		}
		catch (error) {
			console.warn("Failed to load highlights", error);
			this.globalHighlights = [];
		}
	}

	setReaderEmptyState(is_empty) {
		this.element.classList.toggle("is-empty", is_empty);
	}

	resetScrollPosition() {
		this.element.scrollTop = 0;
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

	escapeHtml(value) {
		const text = value || "";
		return text.replace(/[&<>"']/g, (character) => {
			switch (character) {
				case "&":
					return "&amp;";
				case "<":
					return "&lt;";
				case ">":
					return "&gt;";
				case "\"":
					return "&quot;";
				case "'":
					return "&#39;";
				default:
					return character;
			}
		});
	}

	escapeAttribute(value) {
		return this.escapeHtml(value);
	}
}
