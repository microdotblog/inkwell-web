import { Controller } from "../stimulus.js";
import { deleteMicroBlogHighlight, fetchMicroBlogHighlightsFeed } from "../api/highlights.js";
import { fetchConversationReplies } from "../api/feeds.js";
import { DEFAULT_AVATAR_URL } from "../api/posts.js";
import { deleteHighlight, getAllHighlights, getHighlightsForPost, mergeRemoteHighlights } from "../storage/highlights.js";

const EMPTY_POST_MESSAGE = "No highlights yet.";
const EMPTY_ALL_MESSAGE = "No highlights saved yet.";

export default class extends Controller {
	static targets = [
		"readerPane",
		"highlightsPane",
		"repliesPane",
		"list",
		"repliesList",
		"toggle",
		"repliesToggle",
		"readerTab",
		"tabs",
		"readerView",
		"pane",
		"globalList",
		"content",
		"searchInput"
	];

	connect() {
		this.activePostId = null;
		this.activePostSource = "";
		this.activePostHasTitle = false;
		this.highlights = [];
		this.replies = [];
		this.conversation_home_page_url = "";
		this.globalHighlights = [];
		this.search_query = "";
		this.isVisible = false;
		this.post_load_token = 0;
		this.handleHighlight = this.handleHighlight.bind(this);
		this.handleHighlightUpdate = this.handleHighlightUpdate.bind(this);
		this.handlePostOpen = this.handlePostOpen.bind(this);
		this.handleSummary = this.handleSummary.bind(this);
		this.handleWelcome = this.handleWelcome.bind(this);
		this.handleReaderReady = this.handleReaderReady.bind(this);
		this.handleOpenAll = this.handleOpenAll.bind(this);
		this.handleSubscriptionsOpen = this.handleSubscriptionsOpen.bind(this);
		this.handleDiscoverOpen = this.handleDiscoverOpen.bind(this);
		this.handleReplyAvatarError = this.handleReplyAvatarError.bind(this);
		window.addEventListener("highlight:create", this.handleHighlight);
		window.addEventListener("highlight:update", this.handleHighlightUpdate);
		window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("reader:summary", this.handleSummary);
		window.addEventListener("reader:welcome", this.handleWelcome);
		window.addEventListener("reader:blank", this.handleWelcome);
		window.addEventListener("reader:ready", this.handleReaderReady);
		window.addEventListener("highlights:open", this.handleOpenAll);
		window.addEventListener("subscriptions:open", this.handleSubscriptionsOpen);
		window.addEventListener("discover:open", this.handleDiscoverOpen);
		this.element.addEventListener("error", this.handleReplyAvatarError, true);
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
		window.removeEventListener("reader:ready", this.handleReaderReady);
		window.removeEventListener("highlights:open", this.handleOpenAll);
		window.removeEventListener("subscriptions:open", this.handleSubscriptionsOpen);
		window.removeEventListener("discover:open", this.handleDiscoverOpen);
		this.element.removeEventListener("error", this.handleReplyAvatarError, true);
	}

	async handlePostOpen(event) {
		const post = event.detail?.post || null;
		this.hidePane();
		this.activePostId = post?.id || null;
		this.activePostSource = post?.source || "";
		this.activePostHasTitle = this.hasPostTitle(post?.title, post?.summary);
		this.post_load_token += 1;
		const load_token = this.post_load_token;
		this.highlights = [];
		this.resetConversation();
		this.showReader();
		this.render();
		this.restoreReaderHighlights();
		this.highlights = await getHighlightsForPost(this.activePostId);
		if (this.post_load_token != load_token) {
			return;
		}
		this.render();
		this.restoreReaderHighlights();
		this.loadConversation(post?.url, load_token);
	}

	handleSummary() {
		this.hidePane();
		this.activePostId = null;
		this.activePostSource = "";
		this.activePostHasTitle = false;
		this.highlights = [];
		this.resetConversation();
		this.showReader();
		this.render();
		this.restoreReaderHighlights();
	}

	handleWelcome() {
		this.hidePane();
		this.activePostId = null;
		this.activePostSource = "";
		this.activePostHasTitle = false;
		this.highlights = [];
		this.resetConversation();
		this.showReader();
		this.render();
		this.restoreReaderHighlights();
	}

	handleReaderReady(event) {
		const post_id = String(event.detail?.postId || "");
		if (!post_id) {
			return;
		}
		if (String(this.activePostId || "") != post_id) {
			return;
		}

		this.restoreReaderHighlights();
	}

	async handleOpenAll() {
		await this.loadAllHighlights();
		this.showPane();
		this.renderGlobal();
	}

	handleSubscriptionsOpen() {
		this.hidePane();
	}

	handleDiscoverOpen() {
		this.hidePane();
	}

	async loadConversation(post_url, load_token) {
		const trimmed_post_url = (post_url || "").trim();
		if (!trimmed_post_url) {
			return;
		}

		try {
			const payload = await fetchConversationReplies(trimmed_post_url);
			if (this.post_load_token != load_token) {
				return;
			}

			const not_found = payload?.not_found == true;
			this.replies = this.normalizeReplies(payload?.items);
			this.conversation_home_page_url = this.normalizeUrl(payload?.home_page_url);
			this.dispatchConversationState(not_found);
		}
		catch (error) {
			if (this.post_load_token != load_token) {
				return;
			}

			console.warn("Failed to fetch post conversation", error);
			this.replies = [];
			this.conversation_home_page_url = "";
			this.dispatchConversationState(false);
		}

		this.render();
	}

	resetConversation() {
		this.replies = [];
		this.conversation_home_page_url = "";
		this.dispatchConversationState(false);
	}

	dispatchConversationState(not_found) {
		const post_id = String(this.activePostId || "");
		window.dispatchEvent(new CustomEvent("reader:conversation", {
			detail: {
				postId: post_id,
				url: this.conversation_home_page_url,
				hasConversation: not_found != true && Boolean(this.conversation_home_page_url),
				notFound: not_found == true
			}
		}));
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
		this.restoreReaderHighlights();
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
			this.restoreReaderHighlights();
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
		this.repliesPaneTarget.hidden = true;
		this.updateTabs("highlights");
	}

	showReplies() {
		if (!this.replies.length) {
			return;
		}

		this.readerPaneTarget.hidden = true;
		this.highlightsPaneTarget.hidden = true;
		this.repliesPaneTarget.hidden = false;
		this.updateTabs("replies");
	}

	showReader() {
		this.repliesPaneTarget.hidden = true;
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
		this.isVisible = false;
		if (!this.hasVisibleOverlayPane()) {
			this.readerViewTarget.hidden = false;
		}
	}

	render() {
		const highlight_count = this.highlights.length;
		const highlight_label = `${highlight_count} highlight${highlight_count == 1 ? "" : "s"}`;
		this.toggleTarget.textContent = highlight_label;
		this.toggleTarget.hidden = highlight_count == 0;

		const reply_count = this.replies.length;
		const reply_label = `${reply_count} repl${reply_count == 1 ? "y" : "ies"}`;
		this.repliesToggleTarget.textContent = reply_label;
		this.repliesToggleTarget.hidden = reply_count == 0;

		const has_segments = highlight_count > 0 || reply_count > 0;
		this.tabsTarget.classList.toggle("is-single", !has_segments);

		if (this.repliesPaneTarget.hidden == false && reply_count == 0) {
			this.showReader();
		}

		this.renderHighlightsList(this.listTarget, this.highlights, EMPTY_POST_MESSAGE);
		this.renderReplies();
	}

	renderGlobal() {
		if (!this.hasGlobalListTarget) {
			return;
		}
		const filtered_highlights = this.filterGlobalHighlights();
		const empty_message = this.search_query
			? ""
			: EMPTY_ALL_MESSAGE;
		this.renderHighlightsList(this.globalListTarget, filtered_highlights, empty_message);
	}

	handleSearchInput(event) {
		this.search_query = (event.target?.value || "").trim().toLowerCase();
		this.renderGlobal();
	}

	filterGlobalHighlights() {
		const query = (this.search_query || "").trim().toLowerCase();
		if (!query) {
			return this.globalHighlights;
		}

		return this.globalHighlights.filter((highlight) => this.matchesHighlightQuery(highlight, query));
	}

	matchesHighlightQuery(highlight, query) {
		if (!highlight) {
			return false;
		}

		const text = `${highlight.text || ""}`.toLowerCase();
		const post_label = `${this.getPostLabel(highlight) || ""}`.toLowerCase();
		const post_source = `${highlight.post_source || ""}`.toLowerCase();
		const post_url = `${this.resolvePostUrl(highlight) || ""}`.toLowerCase();
		return text.includes(query) ||
			post_label.includes(query) ||
			post_source.includes(query) ||
			post_url.includes(query);
	}

	renderHighlightsList(target, highlights, empty_message) {
		if (!target) {
			return;
		}

		if (!highlights.length) {
			if (!empty_message) {
				target.innerHTML = "";
				return;
			}
			target.innerHTML = `<p class="highlights-empty">${this.escapeHtml(empty_message)}</p>`;
			return;
		}

		const items = highlights.map((highlight) => this.renderHighlightItem(highlight)).join("");
		target.innerHTML = items;
	}

	renderReplies() {
		if (!this.hasRepliesListTarget) {
			return;
		}
		if (!this.replies.length) {
			this.repliesListTarget.innerHTML = "";
			return;
		}

		const reply_markup = this.replies.map((reply) => this.renderReplyItem(reply)).join("");
		this.repliesListTarget.innerHTML = reply_markup;
	}

	renderReplyItem(reply) {
		const author_name = this.escapeHtml(this.getReplyAuthorName(reply));
		const author_url = this.normalizeUrl(reply?.author?.url || "");
		const author_avatar = this.normalizeUrl(reply?.author?.avatar || "") || DEFAULT_AVATAR_URL;
		const safe_avatar = this.escapeAttribute(author_avatar);
		const safe_author_url = this.escapeAttribute(author_url);
		const content_html = this.renderReplyContent(reply);
		const date_text = this.escapeHtml(this.formatReplyDate(reply?.date_published));
		const author_markup = author_url
			? `<a href="${safe_author_url}" target="_blank" rel="noopener noreferrer">${author_name}</a>`
			: author_name;

		return `
			<article class="reply-item">
				<img class="reply-avatar" src="${safe_avatar}" alt="" loading="lazy" width="30" height="30">
				<div class="reply-body">
					<p class="reply-author">${author_markup}</p>
					<div class="reply-content">${content_html}</div>
					<p class="reply-date">${date_text}</p>
				</div>
			</article>
		`;
	}

	renderReplyContent(reply) {
		const content_html = (reply?.content_html || "").trim();
		if (content_html) {
			return this.sanitizeHtml(content_html);
		}

		const content_text = `${reply?.content_text || ""}`.trim();
		if (!content_text) {
			return "";
		}

		const safe_text = this.escapeHtml(content_text).replace(/\r?\n/g, "<br>");
		return `<p>${safe_text}</p>`;
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
		this.readerTabTarget.setAttribute("aria-pressed", active_tab == "reader" ? "true" : "false");
		this.repliesToggleTarget.setAttribute("aria-pressed", active_tab == "replies" ? "true" : "false");
		this.toggleTarget.setAttribute("aria-pressed", active_tab == "highlights" ? "true" : "false");
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
		if (!window.confirm("Are you sure you want to delete this highlight?")) {
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
		if (String(highlight.post_id || "") == String(this.activePostId || "")) {
			this.restoreReaderHighlights();
		}
		if (this.isVisible) {
			this.renderGlobal();
		}

		if (remote_failed) {
			console.warn("Micro.blog highlight delete failed; local highlight removed");
		}
	}

	restoreReaderHighlights() {
		const content_el = this.getReaderContentElement();
		if (!content_el) {
			return;
		}

		this.clearReaderHighlightMarkup(content_el);

		const current_post_id = String(content_el.dataset.postId || "");
		if (!current_post_id) {
			return;
		}
		if (current_post_id != String(this.activePostId || "")) {
			return;
		}

		const ranges = this.buildMergedOffsetRanges(this.highlights);
		if (!ranges.length) {
			return;
		}

		const segments = this.buildReaderHighlightSegments(content_el, ranges);
		if (!segments.length) {
			return;
		}

		segments.sort((a, b) => b.absolute_start - a.absolute_start);
		segments.forEach((segment) => {
			if (!segment.node || !segment.node.parentNode) {
				return;
			}

			const text_length = segment.node.textContent.length;
			const start_offset = Math.max(0, Math.min(segment.start_offset, text_length));
			const end_offset = Math.max(0, Math.min(segment.end_offset, text_length));
			if (end_offset <= start_offset) {
				return;
			}

			const range = document.createRange();
			range.setStart(segment.node, start_offset);
			range.setEnd(segment.node, end_offset);
			this.wrapReaderHighlightRange(range);
		});
	}

	getReaderContentElement() {
		if (this.hasContentTarget) {
			return this.contentTarget;
		}
		return this.element.querySelector("[data-reader-target=\"content\"]");
	}

	clearReaderHighlightMarkup(content_el) {
		if (!content_el) {
			return;
		}

		const highlight_nodes = [...content_el.querySelectorAll("span.reader-highlight-text")];
		highlight_nodes.forEach((highlight_node) => {
			const parent_node = highlight_node.parentNode;
			if (!parent_node) {
				return;
			}

			while (highlight_node.firstChild) {
				parent_node.insertBefore(highlight_node.firstChild, highlight_node);
			}
			parent_node.removeChild(highlight_node);
		});
		content_el.normalize();
	}

	buildMergedOffsetRanges(highlights) {
		const ranges = highlights
			.map((highlight) => this.parseOffsetRange(highlight))
			.filter(Boolean)
			.sort((a, b) => a.start_offset - b.start_offset);
		if (!ranges.length) {
			return [];
		}

		const merged = [ranges[0]];
		for (let i = 1; i < ranges.length; i++) {
			const range = ranges[i];
			const last_range = merged[merged.length - 1];
			if (range.start_offset > last_range.end_offset) {
				merged.push(range);
				continue;
			}
			if (range.end_offset > last_range.end_offset) {
				last_range.end_offset = range.end_offset;
			}
		}

		return merged;
	}

	parseOffsetRange(highlight) {
		if (!highlight) {
			return null;
		}

		const raw_start = highlight.start_offset ?? highlight.selection_start ?? highlight.start;
		const raw_end = highlight.end_offset ?? highlight.selection_end ?? highlight.end;
		const start_offset = Number(raw_start);
		const end_offset = Number(raw_end);
		if (!Number.isFinite(start_offset) || !Number.isFinite(end_offset)) {
			return null;
		}

		const normalized_start = Math.max(0, Math.floor(start_offset));
		const normalized_end = Math.max(0, Math.floor(end_offset));
		if (normalized_end <= normalized_start) {
			return null;
		}

		return {
			start_offset: normalized_start,
			end_offset: normalized_end
		};
	}

	buildReaderHighlightSegments(content_el, ranges) {
		const segments = [];
		const walker = document.createTreeWalker(content_el, NodeFilter.SHOW_TEXT, null);
		let node = walker.nextNode();
		let absolute_offset = 0;

		while (node) {
			const text = node.textContent || "";
			const text_length = text.length;
			const node_start = absolute_offset;
			const node_end = absolute_offset + text_length;
			if (text_length > 0) {
				ranges.forEach((range) => {
					if (range.end_offset <= node_start) {
						return;
					}
					if (range.start_offset >= node_end) {
						return;
					}

					const overlap_start = Math.max(range.start_offset, node_start);
					const overlap_end = Math.min(range.end_offset, node_end);
					if (overlap_end <= overlap_start) {
						return;
					}

					segments.push({
						node,
						start_offset: overlap_start - node_start,
						end_offset: overlap_end - node_start,
						absolute_start: overlap_start
					});
				});
			}

			absolute_offset = node_end;
			node = walker.nextNode();
		}

		return segments;
	}

	wrapReaderHighlightRange(range) {
		const span = document.createElement("span");
		span.className = "reader-highlight-text";
		try {
			range.surroundContents(span);
		}
		catch (error) {
			const fragment = range.extractContents();
			span.appendChild(fragment);
			range.insertNode(span);
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

	normalizeServerHighlights(items) {
		if (!Array.isArray(items)) {
			return [];
		}

		return items
			.map((item) => this.normalizeServerHighlight(item))
			.filter(Boolean);
	}

	normalizeServerHighlight(item) {
		if (!item || typeof item != "object") {
			return null;
		}

		const microblog_data = (item._microblog && typeof item._microblog == "object")
			? item._microblog
			: {};
		const post_id = microblog_data.entry_id == null
			? ""
			: `${microblog_data.entry_id}`.trim();
		if (!post_id) {
			return null;
		}

		const text = item.content_text == null ? "" : `${item.content_text}`;
		if (!text.trim()) {
			return null;
		}

		const post_title = `${item.title || ""}`.trim();
		const start_offset = this.parseHighlightOffset(microblog_data.selection_start);
		const end_offset = this.parseHighlightOffset(microblog_data.selection_end);
		const created_at = `${item.date_published || item.date_modified || ""}`.trim();
		const remote_highlight_id = item.id == null ? "" : `${item.id}`.trim();
		const fallback_id = `mb-${post_id}-${start_offset ?? "x"}-${end_offset ?? "x"}-${created_at || "unknown"}`;
		const resolved_id = remote_highlight_id || fallback_id;

		return {
			id: resolved_id,
			highlight_id: remote_highlight_id,
			post_id,
			post_url: this.normalizeUrl(item.url || ""),
			post_title,
			post_source: "",
			post_published_at: created_at,
			post_has_title: Boolean(post_title && post_title.toLowerCase() != "untitled"),
			text,
			html: text,
			start_offset,
			end_offset,
			selection_start: start_offset,
			selection_end: end_offset,
			intent: "highlight",
			created_at
		};
	}

	parseHighlightOffset(raw_value) {
		const numeric_value = Number(raw_value);
		if (!Number.isFinite(numeric_value)) {
			return null;
		}
		return Math.max(0, Math.floor(numeric_value));
	}

	normalizeReplies(items) {
		if (!Array.isArray(items)) {
			return [];
		}

		return items.filter((item) => item && typeof item == "object");
	}

	getReplyAuthorName(reply) {
		const name = `${reply?.author?.name || ""}`.trim();
		if (name) {
			return name;
		}

		const username = `${reply?.author?._microblog?.username || ""}`.trim();
		if (username) {
			return username;
		}
		return "Unknown";
	}

	formatReplyDate(raw_date) {
		const date = this.parseDate(raw_date);
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

	handleReplyAvatarError(event) {
		const image_el = event.target;
		if (!image_el || image_el.tagName != "IMG") {
			return;
		}
		if (!image_el.classList.contains("reply-avatar")) {
			return;
		}

		const current_src = image_el.getAttribute("src") || "";
		if (current_src == DEFAULT_AVATAR_URL) {
			return;
		}
		image_el.src = DEFAULT_AVATAR_URL;
	}

	normalizeUrl(raw_url) {
		const trimmed = `${raw_url || ""}`.trim();
		if (!trimmed) {
			return "";
		}

		try {
			return new URL(trimmed).toString();
		}
		catch (error) {
			try {
				return new URL(`https://${trimmed}`).toString();
			}
			catch (second_error) {
				return "";
			}
		}
	}

	sanitizeHtml(markup) {
		if (!markup) {
			return "";
		}

		const parser = new DOMParser();
		const doc = parser.parseFromString(markup, "text/html");
		const blocked_tags = ["script", "style", "iframe", "object", "embed", "link", "meta"];
		blocked_tags.forEach((tag) => {
			doc.querySelectorAll(tag).forEach((node) => node.remove());
		});

		const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
		let node = walker.nextNode();
		while (node) {
			[...node.attributes].forEach((attribute) => {
				const name = attribute.name.toLowerCase();
				const value = attribute.value.trim().toLowerCase();
				if (name.startsWith("on")) {
					node.removeAttribute(attribute.name);
				}
				if ((name == "href" || name == "src") && value.startsWith("javascript:")) {
					node.removeAttribute(attribute.name);
				}
			});

			const tag_name = node.tagName ? node.tagName.toLowerCase() : "";
			if (tag_name == "a") {
				const href = (node.getAttribute("href") || "").trim();
				if (href) {
					node.setAttribute("target", "_blank");
					const rel_tokens = (node.getAttribute("rel") || "")
						.split(/\s+/)
						.map((token) => token.trim().toLowerCase())
						.filter(Boolean);
					const rel_set = new Set(rel_tokens);
					rel_set.add("noopener");
					rel_set.add("noreferrer");
					node.setAttribute("rel", [...rel_set].join(" "));
				}
			}

			node = walker.nextNode();
		}

		return doc.body.innerHTML;
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

		try {
			const server_items = await fetchMicroBlogHighlightsFeed();
			const server_highlights = this.normalizeServerHighlights(server_items);
			if (server_highlights.length == 0) {
				return;
			}

			await mergeRemoteHighlights(server_highlights);
			this.globalHighlights = await getAllHighlights();
			const active_post_id = `${this.activePostId || ""}`.trim();
			if (active_post_id) {
				this.highlights = await getHighlightsForPost(active_post_id);
				this.render();
				this.restoreReaderHighlights();
			}
		}
		catch (error) {
			console.warn("Failed to sync server highlights", error);
		}
	}

	setReaderEmptyState(is_empty) {
		this.element.classList.toggle("is-empty", is_empty);
	}

	resetScrollPosition() {
		this.element.scrollTop = 0;
	}

	hasVisibleOverlayPane() {
		const pane_selectors = [".subscriptions-pane", ".all-highlights-pane", ".discover-pane"];
		return pane_selectors.some((selector) => {
			const pane_el = this.element.querySelector(selector);
			return pane_el && pane_el.hidden == false;
		});
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
