import { Controller } from "../stimulus.js";

const TEXT_SETTINGS_STORAGE_KEY = "inkwell_reader_text_settings";
const DEFAULT_TEXT_THEME_ID = "white";
const DEFAULT_TEXT_FONT_ID = "system";

const TEXT_THEMES = [
	{
		id: "white",
		background_color: "#FFFFFF",
		text_color: "#000000"
	},
	{
		id: "light-gray",
		background_color: "#F3F4F6",
		text_color: "#000000"
	},
	{
		id: "tan",
		background_color: "#F2E7D7",
		text_color: "#000000"
	},
	{
		id: "night",
		background_color: "#181E28",
		text_color: "#FFFFFF"
	},
	{
		id: "black",
		background_color: "#000000",
		text_color: "#FFFFFF"
	}
];

const TEXT_FONTS = [
	{
		id: "system",
		font_family: "system-ui, \"San Francisco\", \"Segoe UI\", \"Roboto\", sans-serif"
	},
	{
		id: "avenir-next",
		font_family: "\"Avenir Next\", Avenir, \"Segoe UI\", sans-serif"
	},
	{
		id: "times-new-roman",
		font_family: "\"Times New Roman\", Times, serif"
	}
];

export default class extends Controller {
	static targets = [
		"button",
		"popover",
		"newPost",
		"copyLink",
		"filterFeed",
		"toggleRead",
		"bookmark",
		"toggleReadLabel",
		"bookmarkLabel",
		"textSettingsToggle",
		"textSettingsPane",
		"colorOption",
		"fontOption"
	];

	connect() {
		this.current_post_id = "";
		this.current_post_url = "";
		this.current_post_title = "";
		this.current_feed_id = "";
		this.current_feed_source = "";
		this.current_post_source = "";
		this.current_post_has_title = false;
		this.is_read = false;
		this.is_bookmarked = false;
		this.settings_open = false;
		this.selected_text_theme_id = DEFAULT_TEXT_THEME_ID;
		this.selected_text_font_id = DEFAULT_TEXT_FONT_ID;
		this.right_pane_element = this.findRightPaneElement();
		this.reader_pane_element = this.findReaderPaneElement();
		this.reader_content_element = this.findReaderContentElement();
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
		window.addEventListener("reader:blank", this.handleReaderWelcome);
		window.addEventListener("reader:summary", this.handleReaderSummary);
		this.loadTextSettings();
		this.applyTextSettings();
		this.updateMenuState();
		this.renderTextSettingsPane();
		this.updateTextSettingsControls();
	}

	disconnect() {
		this.removeListeners();
		window.removeEventListener("post:open", this.handlePostOpen);
		window.removeEventListener("post:read", this.handlePostRead);
		window.removeEventListener("post:unread", this.handlePostUnread);
		window.removeEventListener("post:bookmark", this.handlePostBookmark);
		window.removeEventListener("reader:clear", this.handleReaderClear);
		window.removeEventListener("reader:welcome", this.handleReaderWelcome);
		window.removeEventListener("reader:blank", this.handleReaderWelcome);
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
		this.settings_open = false;
		this.renderTextSettingsPane();
		this.popoverTarget.hidden = false;
		this.buttonTarget.setAttribute("aria-expanded", "true");
		document.addEventListener("click", this.handleDocumentClick);
		document.addEventListener("keydown", this.handleKeydown);
	}

	close() {
		if (this.popoverTarget.hidden) {
			return;
		}
		this.settings_open = false;
		this.renderTextSettingsPane();
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
		this.current_post_source = (post.source || "").trim();
		this.current_post_has_title = this.hasPostTitle(this.current_post_title, post.summary);
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
		this.current_post_source = "";
		this.current_post_has_title = false;
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
		this.toggleReadTarget.hidden = !has_feed;
		if (this.hasToggleReadLabelTarget) {
			this.toggleReadLabelTarget.textContent = read_label;
		}
		else {
			this.toggleReadTarget.textContent = read_label;
		}
		if (this.hasBookmarkLabelTarget) {
			this.bookmarkLabelTarget.textContent = bookmark_label;
		}
		else {
			this.bookmarkTarget.textContent = bookmark_label;
		}
		this.toggleReadTarget.disabled = !has_post || !has_feed;
		this.bookmarkTarget.disabled = !has_post;
	}

	toggleTextSettings(event) {
		event.preventDefault();
		this.settings_open = !this.settings_open;
		this.renderTextSettingsPane();
	}

	selectTextTheme(event) {
		event.preventDefault();
		const theme_id = event.currentTarget?.dataset.themeId || "";
		if (!this.getTextThemeById(theme_id)) {
			return;
		}

		this.selected_text_theme_id = theme_id;
		this.persistTextSettings();
		this.applyTextSettings();
		this.updateTextSettingsControls();
	}

	selectTextFont(event) {
		event.preventDefault();
		const font_id = event.currentTarget?.dataset.fontId || "";
		if (!this.getTextFontById(font_id)) {
			return;
		}

		this.selected_text_font_id = font_id;
		this.persistTextSettings();
		this.applyTextSettings();
		this.updateTextSettingsControls();
	}

	renderTextSettingsPane() {
		if (this.hasTextSettingsPaneTarget) {
			this.textSettingsPaneTarget.classList.toggle("is-open", this.settings_open);
		}
		if (this.hasTextSettingsToggleTarget) {
			this.textSettingsToggleTarget.setAttribute("aria-expanded", this.settings_open ? "true" : "false");
		}
	}

	updateTextSettingsControls() {
		if (this.hasColorOptionTarget) {
			this.colorOptionTargets.forEach((button) => {
				const theme_id = button.dataset.themeId || "";
				const is_selected = theme_id == this.selected_text_theme_id;
				button.classList.toggle("is-selected", is_selected);
				button.setAttribute("aria-pressed", is_selected ? "true" : "false");
			});
		}

		if (this.hasFontOptionTarget) {
			this.fontOptionTargets.forEach((button) => {
				const font_id = button.dataset.fontId || "";
				const is_selected = font_id == this.selected_text_font_id;
				button.classList.toggle("is-selected", is_selected);
				button.setAttribute("aria-pressed", is_selected ? "true" : "false");
			});
		}
	}

	loadTextSettings() {
		try {
			const stored = localStorage.getItem(TEXT_SETTINGS_STORAGE_KEY);
			if (!stored) {
				return;
			}

			const payload = JSON.parse(stored);
			if (!payload || typeof payload != "object") {
				return;
			}

			const saved_theme_id = typeof payload.theme_id == "string" ? payload.theme_id.trim() : "";
			const saved_font_id = typeof payload.font_id == "string" ? payload.font_id.trim() : "";
			if (saved_theme_id && this.getTextThemeById(saved_theme_id)) {
				this.selected_text_theme_id = saved_theme_id;
			}
			if (saved_font_id && this.getTextFontById(saved_font_id)) {
				this.selected_text_font_id = saved_font_id;
			}
		}
		catch (error) {
			// Ignore storage parse errors.
		}
	}

	persistTextSettings() {
		const payload = {
			theme_id: this.selected_text_theme_id,
			font_id: this.selected_text_font_id
		};

		try {
			localStorage.setItem(TEXT_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
		}
		catch (error) {
			// Ignore storage write errors.
		}
	}

	applyTextSettings() {
		const selected_theme = this.getSelectedTextTheme();
		const selected_font = this.getSelectedTextFont();
		if (!selected_theme || !selected_font) {
			return;
		}

		if (this.right_pane_element) {
			this.right_pane_element.style.backgroundColor = selected_theme.background_color;
		}

		if (this.reader_pane_element) {
			this.reader_pane_element.style.backgroundColor = selected_theme.background_color;
			this.reader_pane_element.style.color = selected_theme.text_color;
		}

		if (this.reader_content_element) {
			this.reader_content_element.style.color = selected_theme.text_color;
			this.reader_content_element.style.fontFamily = selected_font.font_family;
		}
	}

	getSelectedTextTheme() {
		return this.getTextThemeById(this.selected_text_theme_id) || this.getTextThemeById(DEFAULT_TEXT_THEME_ID);
	}

	getSelectedTextFont() {
		return this.getTextFontById(this.selected_text_font_id) || this.getTextFontById(DEFAULT_TEXT_FONT_ID);
	}

	getTextThemeById(theme_id) {
		return TEXT_THEMES.find((theme) => theme.id == theme_id) || null;
	}

	getTextFontById(font_id) {
		return TEXT_FONTS.find((font) => font.id == font_id) || null;
	}

	findRightPaneElement() {
		return this.element.closest(".right-pane");
	}

	findReaderPaneElement() {
		const right_pane = this.findRightPaneElement();
		if (!right_pane) {
			return null;
		}
		return right_pane.querySelector(".reader-pane");
	}

	findReaderContentElement() {
		const right_pane = this.findRightPaneElement();
		if (!right_pane) {
			return null;
		}
		return right_pane.querySelector(".reader-content");
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
		if (!this.current_post_id || !this.current_feed_id) {
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

		let link_title = this.current_post_title;
		if (!this.current_post_has_title || !link_title || link_title.toLowerCase() == "untitled") {
			link_title = this.current_post_source || "Post";
		}
		const link = `[${link_title}](${this.current_post_url})`;
		const selection_text = this.getSelectedText();
		const quote = this.formatQuote(selection_text);
		const markdown = quote ? `${link}:\n\n${quote}` : link;
		const encoded = encodeURIComponent(markdown);
		const url = `https://micro.blog/post?text=${encoded}`;
		window.open(url, "_blank", "noopener,noreferrer");
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
}
