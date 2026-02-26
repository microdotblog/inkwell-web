import { Controller } from "../stimulus.js";

const TEXT_SETTINGS_STORAGE_KEY = "inkwell_reader_text_settings";
const DEFAULT_TEXT_THEME_ID = "white";
const DEFAULT_TEXT_SIZE_STEP = 0;
const BASE_TEXT_SIZE_REM = 0.9;
const TEXT_SIZE_STEP_REM = 0.1;
const MIN_TEXT_SIZE_STEP = -2;
const MAX_TEXT_SIZE_STEP = 6;
const LIGHT_MODE_BLOCKQUOTE_BACKGROUND = "#F8F8F8";
const DARK_MODE_BLOCKQUOTE_BACKGROUND = "#212A38";
const LIGHT_MODE_BLOCKQUOTE_BORDER = "#E7EAF0";
const DARK_MODE_BLOCKQUOTE_BORDER = "#202632";
const PLATFORM_APPLE = "apple";
const PLATFORM_WINDOWS = "windows";
const PLATFORM_ANDROID = "android";
const RIGHT_PANE_UI_LIGHT_CLASS = "right-pane--reader-ui-light";
const RIGHT_PANE_UI_DARK_CLASS = "right-pane--reader-ui-dark";

const TEXT_THEMES = [
	{
		id: "white",
		background_color: "#FFFFFF",
		text_color: "#000000",
		blockquote_background_color: LIGHT_MODE_BLOCKQUOTE_BACKGROUND,
		blockquote_border_color: LIGHT_MODE_BLOCKQUOTE_BORDER
	},
	{
		id: "light-gray",
		background_color: "#F3F4F6",
		text_color: "#000000",
		blockquote_background_color: LIGHT_MODE_BLOCKQUOTE_BACKGROUND,
		blockquote_border_color: LIGHT_MODE_BLOCKQUOTE_BORDER
	},
	{
		id: "tan",
		background_color: "#F2E7D7",
		text_color: "#000000",
		blockquote_background_color: LIGHT_MODE_BLOCKQUOTE_BACKGROUND,
		blockquote_border_color: LIGHT_MODE_BLOCKQUOTE_BORDER
	},
	{
		id: "night",
		background_color: "#181E28",
		text_color: "#FFFFFF",
		blockquote_background_color: DARK_MODE_BLOCKQUOTE_BACKGROUND,
		blockquote_border_color: DARK_MODE_BLOCKQUOTE_BORDER
	},
	{
		id: "black",
		background_color: "#000000",
		text_color: "#FFFFFF",
		blockquote_background_color: DARK_MODE_BLOCKQUOTE_BACKGROUND,
		blockquote_border_color: DARK_MODE_BLOCKQUOTE_BORDER
	}
];

const LIGHT_TEXT_THEME_IDS = new Set(["white", "light-gray", "tan"]);
const DARK_TEXT_THEME_IDS = new Set(["night", "black"]);

const PLATFORM_TEXT_FONTS = {
	[PLATFORM_APPLE]: [
		{
			id: "san-francisco",
			label: "San Francisco",
			font_family: "-apple-system, BlinkMacSystemFont, \"San Francisco\", \"SF Pro Text\", \"Helvetica Neue\", sans-serif"
		},
		{
			id: "avenir-next",
			label: "Avenir Next",
			font_family: "\"Avenir Next\", Avenir, \"Segoe UI\", sans-serif"
		},
		{
			id: "times-new-roman",
			label: "Times New Roman",
			font_family: "\"Times New Roman\", Times, serif"
		}
	],
	[PLATFORM_WINDOWS]: [
		{
			id: "segoe-ui",
			label: "Segoe UI",
			font_family: "\"Segoe UI\", Tahoma, Geneva, Verdana, sans-serif"
		},
		{
			id: "georgia",
			label: "Georgia",
			font_family: "Georgia, serif"
		}
	],
	[PLATFORM_ANDROID]: [
		{
			id: "roboto",
			label: "Roboto",
			font_family: "Roboto, \"Noto Sans\", \"Droid Sans\", sans-serif"
		},
		{
			id: "noto-serif",
			label: "Noto Serif",
			font_family: "\"Noto Serif\", \"Noto Serif Display\", serif"
		}
	]
};

export default class extends Controller {
	static targets = [
		"button",
		"popover",
		"newPost",
		"copyLink",
		"filterFeed",
		"reply",
		"toggleRead",
		"bookmark",
		"toggleReadLabel",
		"bookmarkLabel",
		"textSettingsToggle",
		"textSettingsPane",
		"colorOption",
		"sizeDecrease",
		"sizeIncrease",
		"fontList",
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
		this.current_conversation_url = "";
		this.has_conversation = false;
		this.reader_view_mode = "none";
		this.is_read = false;
		this.is_bookmarked = false;
		this.settings_open = false;
		this.platform_font_group = this.detectPlatformFontGroup();
		this.available_text_fonts = this.getFontsForPlatform(this.platform_font_group);
		this.selected_text_theme_id = DEFAULT_TEXT_THEME_ID;
		this.selected_text_font_id = this.available_text_fonts[0]?.id || "";
		this.selected_text_size_step = DEFAULT_TEXT_SIZE_STEP;
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
		this.handleSubscriptionsOpen = this.handleSubscriptionsOpen.bind(this);
		this.handleSubscriptionsClose = this.handleSubscriptionsClose.bind(this);
		this.handleHighlightsOpen = this.handleHighlightsOpen.bind(this);
		this.handleConversation = this.handleConversation.bind(this);
		window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("post:read", this.handlePostRead);
		window.addEventListener("post:unread", this.handlePostUnread);
		window.addEventListener("post:bookmark", this.handlePostBookmark);
		window.addEventListener("reader:clear", this.handleReaderClear);
		window.addEventListener("reader:welcome", this.handleReaderWelcome);
		window.addEventListener("reader:blank", this.handleReaderWelcome);
		window.addEventListener("reader:summary", this.handleReaderSummary);
		window.addEventListener("subscriptions:open", this.handleSubscriptionsOpen);
		window.addEventListener("subscriptions:close", this.handleSubscriptionsClose);
		window.addEventListener("highlights:open", this.handleHighlightsOpen);
		window.addEventListener("reader:conversation", this.handleConversation);
		this.renderFontOptions();
		this.loadTextSettings();
		this.ensureSelectedTextFont();
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
		window.removeEventListener("subscriptions:open", this.handleSubscriptionsOpen);
		window.removeEventListener("subscriptions:close", this.handleSubscriptionsClose);
		window.removeEventListener("highlights:open", this.handleHighlightsOpen);
		window.removeEventListener("reader:conversation", this.handleConversation);
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
			this.reader_view_mode = "none";
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
		this.current_conversation_url = "";
		this.has_conversation = false;
		this.reader_view_mode = "post";
		this.is_read = Boolean(post.is_read);
		this.is_bookmarked = Boolean(post.is_bookmarked);
		this.updateMenuState();
		this.applyTextSettings();
	}

	handleConversation(event) {
		const post_id = String(event.detail?.postId || "");
		if (!post_id || post_id != String(this.current_post_id || "")) {
			return;
		}

		this.current_conversation_url = (event.detail?.url || "").trim();
		this.has_conversation = Boolean(event.detail?.hasConversation) && Boolean(this.current_conversation_url);
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
		this.reader_view_mode = "none";
		this.clearState();
	}

	handleReaderWelcome() {
		this.reader_view_mode = "none";
		this.clearState();
	}

	handleReaderSummary() {
		this.reader_view_mode = "summary";
		this.clearState();
	}

	handleSubscriptionsOpen() {
		this.reader_view_mode = "subscriptions";
		this.applyTextSettings();
	}

	handleSubscriptionsClose() {
		if (this.reader_view_mode != "subscriptions") {
			return;
		}
		this.reader_view_mode = this.current_post_id ? "post" : "none";
		this.applyTextSettings();
	}

	handleHighlightsOpen() {
		this.reader_view_mode = "highlights";
		this.applyTextSettings();
	}

	clearState() {
		this.current_post_id = "";
		this.current_post_url = "";
		this.current_post_title = "";
		this.current_feed_id = "";
		this.current_feed_source = "";
		this.current_post_source = "";
		this.current_post_has_title = false;
		this.current_conversation_url = "";
		this.has_conversation = false;
		this.is_read = false;
		this.is_bookmarked = false;
		this.updateMenuState();
		this.applyTextSettings();
	}

	matchesActivePost(post_id) {
		return post_id && this.current_post_id && post_id == this.current_post_id;
	}

	updateMenuState() {
		const has_post = Boolean(this.current_post_id);
		const has_link = Boolean(this.current_post_url);
		const has_feed = Boolean(this.current_feed_id);
		const has_reply = has_post && this.has_conversation && Boolean(this.current_conversation_url);
		const read_label = this.is_read ? "Mark as Unread" : "Mark as Read";
		const bookmark_label = this.is_bookmarked ? "Unbookmark" : "Bookmark";
		this.newPostTarget.disabled = !has_link;
		this.copyLinkTarget.disabled = !has_link;
		this.filterFeedTarget.disabled = !has_feed;
		this.replyTarget.hidden = !has_reply;
		this.replyTarget.disabled = !has_reply;
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

	decreaseTextSize(event) {
		event.preventDefault();
		this.bumpTextSize(-1);
	}

	increaseTextSize(event) {
		event.preventDefault();
		this.bumpTextSize(1);
	}

	bumpTextSize(step_delta) {
		const current_step = Number(this.selected_text_size_step) || DEFAULT_TEXT_SIZE_STEP;
		const next_step = this.clampTextSizeStep(current_step + step_delta);
		if (next_step == current_step) {
			return;
		}

		this.selected_text_size_step = next_step;
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

		this.selected_text_size_step = this.clampTextSizeStep(this.selected_text_size_step);
		if (this.hasSizeDecreaseTarget) {
			this.sizeDecreaseTarget.disabled = this.selected_text_size_step <= MIN_TEXT_SIZE_STEP;
		}
		if (this.hasSizeIncreaseTarget) {
			this.sizeIncreaseTarget.disabled = this.selected_text_size_step >= MAX_TEXT_SIZE_STEP;
		}
	}

	renderFontOptions() {
		if (!this.hasFontListTarget) {
			return;
		}

		this.fontListTarget.replaceChildren();
		const fragment = document.createDocumentFragment();
		this.available_text_fonts.forEach((font) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "reader-text-font-option";
			button.setAttribute("data-reader-menu-target", "fontOption");
			button.setAttribute("data-font-id", font.id);
			button.setAttribute("data-action", "reader-menu#selectTextFont");
			button.style.fontFamily = font.font_family;
			button.textContent = font.label;
			fragment.append(button);
		});
		this.fontListTarget.append(fragment);
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
			const parsed_size_step = Number(payload.size_step);
			if (saved_theme_id && this.getTextThemeById(saved_theme_id)) {
				this.selected_text_theme_id = saved_theme_id;
			}
			if (saved_font_id && this.getTextFontById(saved_font_id)) {
				this.selected_text_font_id = saved_font_id;
			}
			if (Number.isFinite(parsed_size_step)) {
				this.selected_text_size_step = this.clampTextSizeStep(parsed_size_step);
			}
		}
		catch (error) {
			// Ignore storage parse errors.
		}
	}

	ensureSelectedTextFont() {
		if (this.getTextFontById(this.selected_text_font_id)) {
			return;
		}
		this.selected_text_font_id = this.available_text_fonts[0]?.id || "";
	}

	persistTextSettings() {
		const payload = {
			theme_id: this.selected_text_theme_id,
			font_id: this.selected_text_font_id,
			size_step: this.selected_text_size_step
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
		if (!this.shouldApplyTextSettings()) {
			this.clearTextSettingsStyles();
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
			this.reader_content_element.style.fontSize = `${this.getSelectedTextSizeRem()}rem`;
			this.reader_content_element.style.setProperty("--reader-blockquote-background", selected_theme.blockquote_background_color);
			this.reader_content_element.style.setProperty("--reader-blockquote-border-color", selected_theme.blockquote_border_color);
		}

		this.applyRightPaneUiTheme(selected_theme.id);
	}

	shouldApplyTextSettings() {
		return this.reader_view_mode == "post" && Boolean(this.current_post_id);
	}

	clearTextSettingsStyles() {
		if (this.right_pane_element) {
			this.right_pane_element.style.backgroundColor = "";
			this.right_pane_element.classList.remove(RIGHT_PANE_UI_LIGHT_CLASS);
			this.right_pane_element.classList.remove(RIGHT_PANE_UI_DARK_CLASS);
		}

		if (this.reader_pane_element) {
			this.reader_pane_element.style.backgroundColor = "";
			this.reader_pane_element.style.color = "";
		}

		if (this.reader_content_element) {
			this.reader_content_element.style.color = "";
			this.reader_content_element.style.fontFamily = "";
			this.reader_content_element.style.fontSize = "";
			this.reader_content_element.style.removeProperty("--reader-blockquote-background");
			this.reader_content_element.style.removeProperty("--reader-blockquote-border-color");
		}
	}

	getSelectedTextSizeRem() {
		const size_step = this.clampTextSizeStep(this.selected_text_size_step);
		const text_size = BASE_TEXT_SIZE_REM + (size_step * TEXT_SIZE_STEP_REM);
		const rounded = Math.round(text_size * 100) / 100;
		return rounded;
	}

	clampTextSizeStep(raw_size_step) {
		const parsed = Number(raw_size_step);
		if (!Number.isFinite(parsed)) {
			return DEFAULT_TEXT_SIZE_STEP;
		}
		const rounded = Math.round(parsed);
		return Math.max(MIN_TEXT_SIZE_STEP, Math.min(MAX_TEXT_SIZE_STEP, rounded));
	}

	applyRightPaneUiTheme(theme_id) {
		if (!this.right_pane_element) {
			return;
		}

		const is_dark = DARK_TEXT_THEME_IDS.has(theme_id);
		const is_light = LIGHT_TEXT_THEME_IDS.has(theme_id) || !is_dark;
		this.right_pane_element.classList.toggle(RIGHT_PANE_UI_LIGHT_CLASS, is_light);
		this.right_pane_element.classList.toggle(RIGHT_PANE_UI_DARK_CLASS, is_dark);
	}

	getSelectedTextTheme() {
		return this.getTextThemeById(this.selected_text_theme_id) || this.getTextThemeById(DEFAULT_TEXT_THEME_ID);
	}

	getSelectedTextFont() {
		return this.getTextFontById(this.selected_text_font_id) || this.available_text_fonts[0] || null;
	}

	getTextThemeById(theme_id) {
		return TEXT_THEMES.find((theme) => theme.id == theme_id) || null;
	}

	getTextFontById(font_id) {
		return this.available_text_fonts.find((font) => font.id == font_id) || null;
	}

	getFontsForPlatform(platform_font_group) {
		return PLATFORM_TEXT_FONTS[platform_font_group] || PLATFORM_TEXT_FONTS[PLATFORM_APPLE];
	}

	detectPlatformFontGroup() {
		const user_agent = navigator.userAgent || "";
		const platform = navigator.userAgentData?.platform || navigator.platform || "";
		const platform_hint = `${platform} ${user_agent}`;

		if (/android/i.test(platform_hint)) {
			return PLATFORM_ANDROID;
		}
		if (/(iphone|ipad|ipod|mac)/i.test(platform_hint)) {
			return PLATFORM_APPLE;
		}
		if (/win/i.test(platform_hint)) {
			return PLATFORM_WINDOWS;
		}
		return PLATFORM_APPLE;
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

	replyOnMicroBlog(event) {
		event.preventDefault();
		if (!this.current_conversation_url) {
			return;
		}

		window.open(this.current_conversation_url, "_blank", "noopener,noreferrer");
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
