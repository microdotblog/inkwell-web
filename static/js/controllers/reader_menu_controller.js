import { Controller } from "../stimulus.js";

export default class extends Controller {
	static targets = ["button", "popover", "newPost", "copyLink", "filterFeed", "toggleRead", "bookmark"];

	connect() {
		this.current_post_id = "";
		this.current_post_url = "";
		this.current_post_title = "";
		this.current_feed_id = "";
		this.current_feed_source = "";
		this.is_read = false;
		this.is_bookmarked = false;
		this.handleDocumentClick = this.handleDocumentClick.bind(this);
		this.handleKeydown = this.handleKeydown.bind(this);
		this.handlePostOpen = this.handlePostOpen.bind(this);
		this.handlePostRead = this.handlePostRead.bind(this);
		this.handlePostUnread = this.handlePostUnread.bind(this);
		this.handlePostBookmark = this.handlePostBookmark.bind(this);
		this.handleReaderClear = this.handleReaderClear.bind(this);
		this.handleReaderWelcome = this.handleReaderWelcome.bind(this);
		this.handleReaderSummary = this.handleReaderSummary.bind(this);
		window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("post:read", this.handlePostRead);
		window.addEventListener("post:unread", this.handlePostUnread);
		window.addEventListener("post:bookmark", this.handlePostBookmark);
		window.addEventListener("reader:clear", this.handleReaderClear);
		window.addEventListener("reader:welcome", this.handleReaderWelcome);
		window.addEventListener("reader:summary", this.handleReaderSummary);
		this.updateMenuState();
	}

	disconnect() {
		this.removeListeners();
		window.removeEventListener("post:open", this.handlePostOpen);
		window.removeEventListener("post:read", this.handlePostRead);
		window.removeEventListener("post:unread", this.handlePostUnread);
		window.removeEventListener("post:bookmark", this.handlePostBookmark);
		window.removeEventListener("reader:clear", this.handleReaderClear);
		window.removeEventListener("reader:welcome", this.handleReaderWelcome);
		window.removeEventListener("reader:summary", this.handleReaderSummary);
	}

	toggle() {
		if (this.popoverTarget.hidden) {
			this.open();
			return;
		}
		this.close();
	}

	open() {
		this.popoverTarget.hidden = false;
		this.buttonTarget.setAttribute("aria-expanded", "true");
		document.addEventListener("click", this.handleDocumentClick);
		document.addEventListener("keydown", this.handleKeydown);
	}

	close() {
		if (this.popoverTarget.hidden) {
			return;
		}
		this.popoverTarget.hidden = true;
		this.buttonTarget.setAttribute("aria-expanded", "false");
		this.removeListeners();
	}

	removeListeners() {
		document.removeEventListener("click", this.handleDocumentClick);
		document.removeEventListener("keydown", this.handleKeydown);
	}

	handleDocumentClick(event) {
		if (this.element.contains(event.target)) {
			return;
		}
		this.close();
	}

	handleKeydown(event) {
		if (event.key == "Escape") {
			this.close();
		}
	}

	handlePostOpen(event) {
		const post = event.detail?.post;
		if (!post) {
			this.clearState();
			return;
		}

		this.current_post_id = post.id;
		this.current_post_url = (post.url || "").trim();
		this.current_post_title = (post.title || "").trim();
		this.current_feed_id = post.feed_id == null ? "" : String(post.feed_id);
		this.current_feed_source = (post.source || "").trim();
		this.is_read = Boolean(post.is_read);
		this.is_bookmarked = Boolean(post.is_bookmarked);
		this.updateMenuState();
	}

	handlePostRead(event) {
		if (!this.matchesActivePost(event.detail?.postId)) {
			return;
		}
		this.is_read = true;
		this.updateMenuState();
	}

	handlePostUnread(event) {
		if (!this.matchesActivePost(event.detail?.postId)) {
			return;
		}
		this.is_read = false;
		this.updateMenuState();
	}

	handlePostBookmark(event) {
		if (!this.matchesActivePost(event.detail?.postId)) {
			return;
		}
		this.is_bookmarked = Boolean(event.detail?.is_bookmarked);
		this.updateMenuState();
	}

	handleReaderClear() {
		this.clearState();
	}

	handleReaderWelcome() {
		this.clearState();
	}

	handleReaderSummary() {
		this.clearState();
	}

	clearState() {
		this.current_post_id = "";
		this.current_post_url = "";
		this.current_post_title = "";
		this.current_feed_id = "";
		this.current_feed_source = "";
		this.is_read = false;
		this.is_bookmarked = false;
		this.updateMenuState();
	}

	matchesActivePost(post_id) {
		return post_id && this.current_post_id && post_id == this.current_post_id;
	}

	updateMenuState() {
		const has_post = Boolean(this.current_post_id);
		const has_link = Boolean(this.current_post_url);
		const has_feed = Boolean(this.current_feed_id);
		const read_label = this.is_read ? "Mark as Unread" : "Mark as Read";
		const bookmark_label = this.is_bookmarked ? "Unbookmark" : "Bookmark";
		this.newPostTarget.disabled = !has_link;
		this.copyLinkTarget.disabled = !has_link;
		this.filterFeedTarget.disabled = !has_feed;
		this.toggleReadTarget.textContent = read_label;
		this.bookmarkTarget.textContent = bookmark_label;
		this.toggleReadTarget.disabled = !has_post;
		this.bookmarkTarget.disabled = !has_post;
	}

	filterFeed(event) {
		event.preventDefault();
		if (!this.current_feed_id) {
			return;
		}
		window.dispatchEvent(
			new CustomEvent("timeline:filterByFeed", {
				detail: {
					feedId: this.current_feed_id,
					source: this.current_feed_source
				}
			})
		);
		this.close();
	}

	toggleRead(event) {
		event.preventDefault();
		if (!this.current_post_id) {
			return;
		}
		window.dispatchEvent(new CustomEvent("reader:toggleRead"));
		this.close();
	}

	toggleBookmark(event) {
		event.preventDefault();
		if (!this.current_post_id) {
			return;
		}
		window.dispatchEvent(new CustomEvent("timeline:toggleBookmark"));
		this.close();
	}

	newPost(event) {
		event.preventDefault();
		if (!this.current_post_url) {
			return;
		}

		const title = this.current_post_title || "Post";
		const link = `[${title}](${this.current_post_url})`;
		const selection_text = this.getSelectedText();
		const quote = this.formatQuote(selection_text);
		const markdown = quote ? `${link}:\n\n${quote}` : link;
		const encoded = encodeURIComponent(markdown);
		window.location.href = `https://micro.blog/post?text=${encoded}`;
		this.close();
	}

	async copyLink(event) {
		event.preventDefault();
		if (!this.current_post_url) {
			return;
		}

		try {
			await this.copyToClipboard(this.current_post_url);
		}
		catch (error) {
			console.warn("Failed to copy link", error);
		}
		this.close();
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

	getSelectedText() {
		const selection = window.getSelection?.();
		if (!selection) {
			return "";
		}

		return (selection.toString() || "").trim();
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
}
