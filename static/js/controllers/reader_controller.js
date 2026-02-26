import { Controller } from "../stimulus.js";
import { fetchReadableContent } from "../api/content.js";
import { DEFAULT_AVATAR_URL } from "../api/posts.js";
import { fetchRecapEmailSettings, markFeedEntriesUnread, updateRecapEmailSettings } from "../api/feeds.js";
import { createPostBookmark } from "../api/micropub.js";
import { markRead, markUnread } from "../storage/reads.js";
import { parse_hash } from "../router.js";

const preview_spinner_markup = "<p class=\"loading\"><img class=\"subscriptions-spinner subscriptions-spinner--inline\" src=\"/images/progress_spinner.svg\" alt=\"Loading preview\" style=\"width: 20px; height: 20px;\"></p>";
const recap_email_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const recap_email_enabled_storage_key = "inkwell_recap_email_enabled";
const narrow_image_domains = ["theverge.com"];
const narrow_image_css_class = "reader-content--narrow-feed-images";
const recap_email_settings_markup = `
	<div class="reading-recap-controls">
		<button
			type="button"
			class="mobile-back-button reading-recap-mobile-back-button"
			data-action="session#showTimeline"
			aria-label="Back to timeline"
		>
			<svg class="mobile-back-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
				<path d="M14 6L8 12L14 18"></path>
			</svg>
		</button>
		<div class="reading-recap-email-settings">
			<label class="reading-recap-email-toggle">
				<input type="checkbox" class="reading-recap-email-enabled">
				<span>Send <b>Reading Recap</b> in weekly email on:</span>
			</label>
			<select class="reading-recap-email-day" aria-label="Send recap day" disabled>
				<option value="Monday">Monday</option>
				<option value="Tuesday">Tuesday</option>
				<option value="Wednesday">Wednesday</option>
				<option value="Thursday">Thursday</option>
				<option value="Friday" selected>Friday</option>
				<option value="Saturday">Saturday</option>
				<option value="Sunday">Sunday</option>
			</select>
			<img class="reading-recap-email-spinner subscriptions-spinner subscriptions-spinner--inline" src="/images/progress_spinner.svg" alt="" aria-hidden="true" width="20" height="20" hidden>
		</div>
	</div>
`;

export default class extends Controller {
	static targets = ["content", "title", "meta", "avatar"];

	connect() {
		this.handlePostOpen = this.handlePostOpen.bind(this);
		this.handleAvatarError = this.handleAvatarError.bind(this);
		this.handleWelcome = this.handleWelcome.bind(this);
		this.handleBlank = this.handleBlank.bind(this);
		this.handleClear = this.handleClear.bind(this);
		this.handleResolvingRoute = this.handleResolvingRoute.bind(this);
		this.handleSummary = this.handleSummary.bind(this);
		this.handleSummaryAvatarError = this.handleSummaryAvatarError.bind(this);
		this.handleRecapBookmarkClick = this.handleRecapBookmarkClick.bind(this);
		this.handleRecapEmailSettingsChange = this.handleRecapEmailSettingsChange.bind(this);
		this.handleThemeApplied = this.handleThemeApplied.bind(this);
		this.handleKeydown = this.handleKeydown.bind(this);
		this.handleToggleRead = this.handleToggleRead.bind(this);
		window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("reader:welcome", this.handleWelcome);
		window.addEventListener("reader:blank", this.handleBlank);
		window.addEventListener("reader:clear", this.handleClear);
		window.addEventListener("reader:resolvingRoute", this.handleResolvingRoute);
		window.addEventListener("reader:summary", this.handleSummary);
		window.addEventListener("reader:toggleRead", this.handleToggleRead);
		window.addEventListener("theme:applied", this.handleThemeApplied);
		window.addEventListener("keydown", this.handleKeydown);
		this.avatarTarget.addEventListener("error", this.handleAvatarError);
		this.contentTarget.addEventListener("error", this.handleSummaryAvatarError, true);
		this.contentTarget.addEventListener("click", this.handleRecapBookmarkClick);
		this.contentTarget.addEventListener("change", this.handleRecapEmailSettingsChange);
		const route = parse_hash();
		if (route.postId || route.feedId || route.feedUrl) {
			this.showResolving();
		}
		else {
			this.showPlaceholder();
		}
	}

	disconnect() {
		window.removeEventListener("post:open", this.handlePostOpen);
		window.removeEventListener("reader:welcome", this.handleWelcome);
		window.removeEventListener("reader:blank", this.handleBlank);
		window.removeEventListener("reader:clear", this.handleClear);
		window.removeEventListener("reader:resolvingRoute", this.handleResolvingRoute);
		window.removeEventListener("reader:summary", this.handleSummary);
		window.removeEventListener("reader:toggleRead", this.handleToggleRead);
		window.removeEventListener("theme:applied", this.handleThemeApplied);
		window.removeEventListener("keydown", this.handleKeydown);
		this.avatarTarget.removeEventListener("error", this.handleAvatarError);
		this.contentTarget.removeEventListener("error", this.handleSummaryAvatarError, true);
		this.contentTarget.removeEventListener("click", this.handleRecapBookmarkClick);
		this.contentTarget.removeEventListener("change", this.handleRecapEmailSettingsChange);
	}

	async handlePostOpen(event) {
		const { post } = event.detail;
		if (!post) {
			return;
		}

		this.setSummaryMode(false);
		this.element.classList.remove("is-resolving");
		this.element.classList.remove("is-empty");
		this.setBlankMode(false);
		this.element.hidden = false;
		this.currentPostTitle = post.title || "Untitled";
		this.currentPostId = post.id;
		this.currentPostRead = Boolean(post.is_read);
		this.setTitle(this.currentPostTitle);
		this.setMeta(post);
		const post_url = (post.url || "").trim();
		this.applyDomainImageClass(post_url);
		this.contentTarget.innerHTML = "<p class=\"loading\">Loading readable view...</p>";
		this.avatarTarget.hidden = false;
		this.avatarTarget.src = post.avatar_url || "/images/blank_avatar.png";
		this.avatarTarget.alt = "";
		const post_title = (post.title || "").trim();
		const post_has_title = this.hasPostTitle(post_title, post.summary);
		this.contentTarget.dataset.postTitle = post_title;
		this.contentTarget.dataset.postSource = post.source || "";
		this.contentTarget.dataset.postPublishedAt = post.published_at || "";
		this.contentTarget.dataset.postHasTitle = post_has_title ? "true" : "false";
		this.currentPostFeedId = post.feed_id == null ? "" : String(post.feed_id);
		this.currentPostSource = (post.source || "").trim();
		this.avatarTarget.title = "";
		this.avatarTarget.classList.remove("is-feed-link");

		const payload = await fetchReadableContent(post.id);
		const summary_fallback = post.summary ? `<p>${post.summary}</p>` : preview_spinner_markup;
		let safe_html = this.sanitizeHtml(summary_fallback);
		if (payload.html) {
			safe_html = this.sanitizeHtml(payload.html);
		}
		this.currentPostTitle = payload.title || post.title || "Untitled";
		this.setTitle(this.currentPostTitle);
		this.setMeta(post);
		this.contentTarget.innerHTML = safe_html;
		this.contentTarget.dataset.postId = post.id;
		this.contentTarget.dataset.postUrl = post.url;
		this.contentTarget.dataset.postTitle = post_title;
		this.contentTarget.dataset.postSource = post.source || "";
		this.contentTarget.dataset.postPublishedAt = post.published_at || "";
		this.contentTarget.dataset.postHasTitle = post_has_title ? "true" : "false";
		this.dispatch("ready", { detail: { postId: post.id }, prefix: "reader" });
	}

	handleAvatarError(event) {
		const image_el = event.target;
		if (!image_el || image_el.tagName != "IMG") {
			return;
		}

		const current_src = image_el.getAttribute("src") || "";
		if (current_src == DEFAULT_AVATAR_URL) {
			return;
		}

		image_el.src = DEFAULT_AVATAR_URL;
	}

	handleSummaryAvatarError(event) {
		const image_el = event.target;
		if (!image_el || image_el.tagName != "IMG") {
			return;
		}

		if (!this.contentTarget.contains(image_el)) {
			return;
		}

		const header = image_el.closest(".reading-recap h2");
		if (!header) {
			return;
		}

		const current_src = image_el.getAttribute("src") || "";
		if (current_src == DEFAULT_AVATAR_URL) {
			return;
		}

		image_el.src = DEFAULT_AVATAR_URL;
	}

	async handleRecapBookmarkClick(event) {
		const bookmark_button = event.target?.closest(".reading-recap-quote-bookmark-button");
		if (!bookmark_button) {
			return;
		}

		event.preventDefault();
		if (bookmark_button.classList.contains("is-bookmarked")) {
			return;
		}
		if (bookmark_button.disabled) {
			return;
		}

		const quote_row = bookmark_button.closest(".reading-recap-quote");
		if (!quote_row) {
			return;
		}

		const quote_link = quote_row.querySelector(".reading-recap-quote-main a[href]");
		const raw_url = (quote_link?.href || "").trim();
		let parsed_url = "";
		if (!raw_url) {
			return;
		}

		try {
			parsed_url = new URL(raw_url).toString();
		}
		catch (error) {
			try {
				parsed_url = new URL(`https://${raw_url}`).toString();
			}
			catch (second_error) {
				return;
			}
		}

		bookmark_button.disabled = true;
		try {
			await createPostBookmark(parsed_url);
			this.setRecapBookmarkButtonState(bookmark_button, true);
		}
		catch (error) {
			console.warn("Failed to create bookmark", error);
		}
		finally {
			bookmark_button.disabled = false;
		}
	}

	async handleRecapEmailSettingsChange(event) {
		const settings_form = event.target?.closest(".reading-recap-email-settings");
		if (!settings_form || !this.contentTarget.contains(settings_form)) {
			return;
		}

		const enabled_checkbox = settings_form.querySelector(".reading-recap-email-enabled");
		const day_select = settings_form.querySelector(".reading-recap-email-day");
		const spinner = settings_form.querySelector(".reading-recap-email-spinner");
		if (!enabled_checkbox || !day_select || !spinner) {
			return;
		}

		const dayofweek = enabled_checkbox.checked
			? this.normalizeRecapEmailDay(day_select.value)
			: "";
		day_select.disabled = !enabled_checkbox.checked;
		this.setStoredRecapEmailEnabled(enabled_checkbox.checked);

		spinner.hidden = false;
		enabled_checkbox.disabled = true;
		day_select.disabled = true;
		try {
			await updateRecapEmailSettings({
				dayofweek
			});
		}
		catch (error) {
			console.warn("Failed to update recap email settings", error);
		}
		finally {
			enabled_checkbox.disabled = false;
			day_select.disabled = !enabled_checkbox.checked;
			spinner.hidden = true;
		}
	}

	async loadRecapEmailSettings() {
		const settings_form = this.contentTarget.querySelector(".reading-recap-email-settings");
		if (!settings_form || !this.contentTarget.contains(settings_form)) {
			return;
		}

		const enabled_checkbox = settings_form.querySelector(".reading-recap-email-enabled");
		const day_select = settings_form.querySelector(".reading-recap-email-day");
		const spinner = settings_form.querySelector(".reading-recap-email-spinner");
		if (!enabled_checkbox || !day_select || !spinner) {
			return;
		}

		spinner.hidden = false;
		enabled_checkbox.disabled = true;
		day_select.disabled = true;
		const stored_enabled = this.getStoredRecapEmailEnabled();
		if (stored_enabled != null) {
			enabled_checkbox.checked = stored_enabled;
		}
		try {
			const settings = await fetchRecapEmailSettings();
			if (!this.contentTarget.contains(settings_form)) {
				return;
			}

			const dayofweek = this.normalizeRecapEmailDay(settings?.dayofweek || "");
			enabled_checkbox.checked = Boolean(dayofweek);
			this.setStoredRecapEmailEnabled(enabled_checkbox.checked);
			if (dayofweek) {
				day_select.value = dayofweek;
			}
		}
		catch (error) {
			console.warn("Failed to fetch recap email settings", error);
		}
		finally {
			if (!this.contentTarget.contains(settings_form)) {
				return;
			}

			enabled_checkbox.disabled = false;
			day_select.disabled = !enabled_checkbox.checked;
			spinner.hidden = true;
		}
	}

	handleWelcome() {
		this.showPlaceholder();
	}

	handleBlank() {
		this.showBlank();
	}

	handleClear() {
		this.clearReader();
	}

	handleResolvingRoute() {
		this.showResolving();
	}

	showResolving() {
		this.setSummaryMode(false);
		this.element.classList.add("is-resolving");
		this.element.classList.remove("is-empty");
		this.setBlankMode(false);
		this.element.hidden = false;
		this.currentPostId = null;
		this.currentPostRead = false;
		this.avatarTarget.hidden = true;
		this.avatarTarget.src = "/images/blank_avatar.png";
		this.avatarTarget.alt = "";
		this.setTitle("");
		this.metaTarget.textContent = "";
		this.contentTarget.dataset.postId = "";
		this.contentTarget.dataset.postUrl = "";
		this.contentTarget.dataset.postTitle = "";
		this.contentTarget.dataset.postSource = "";
		this.contentTarget.dataset.postPublishedAt = "";
		this.contentTarget.dataset.postHasTitle = "";
		this.applyDomainImageClass("");
		this.contentTarget.innerHTML = "";
	}

	handleSummary(event) {
		const summary_html = event.detail?.html || "";
		const decorated_summary_html = this.decorateRecapMarkup(summary_html);
		this.setSummaryMode(true);
		this.element.classList.remove("is-resolving");
		this.element.classList.remove("is-empty");
		this.setBlankMode(false);
		this.element.hidden = false;
		this.currentPostId = null;
		this.currentPostFeedId = "";
		this.currentPostSource = "";
		this.currentPostRead = false;
		this.currentPostTitle = "";
		this.avatarTarget.hidden = true;
		this.avatarTarget.src = "/images/blank_avatar.png";
		this.avatarTarget.alt = "";
		this.avatarTarget.title = "";
		this.avatarTarget.classList.remove("is-feed-link");
		this.titleTarget.textContent = "";
		this.titleTarget.title = "";
		this.metaTarget.textContent = "";
		this.contentTarget.dataset.postId = "";
		this.contentTarget.dataset.postUrl = "";
		this.contentTarget.dataset.postTitle = "";
		this.contentTarget.dataset.postSource = "";
		this.contentTarget.dataset.postPublishedAt = "";
		this.contentTarget.dataset.postHasTitle = "";
		this.applyDomainImageClass("");
		this.contentTarget.innerHTML = this.sanitizeHtml(decorated_summary_html);
		this.applyRecapColors();
		this.loadRecapEmailSettings();
	}

	handleThemeApplied() {
		this.applyRecapColors();
	}

	clearReader() {
		this.setSummaryMode(false);
		this.element.classList.remove("is-resolving");
		this.setBlankMode(false);
		this.currentPostId = null;
		this.currentPostFeedId = "";
		this.currentPostSource = "";
		this.currentPostRead = false;
		this.avatarTarget.hidden = true;
		this.avatarTarget.src = "/images/blank_avatar.png";
		this.avatarTarget.alt = "";
		this.avatarTarget.title = "";
		this.avatarTarget.classList.remove("is-feed-link");
		this.setTitle("");
		this.metaTarget.textContent = "";
		this.contentTarget.dataset.postId = "";
		this.contentTarget.dataset.postUrl = "";
		this.contentTarget.dataset.postTitle = "";
		this.contentTarget.dataset.postSource = "";
		this.contentTarget.dataset.postPublishedAt = "";
		this.contentTarget.dataset.postHasTitle = "";
		this.applyDomainImageClass("");
		this.contentTarget.innerHTML = "";
		this.element.classList.remove("is-empty");
		this.element.hidden = true;
	}

	showPlaceholder() {
		this.setSummaryMode(false);
		this.element.classList.remove("is-resolving");
		this.element.classList.add("is-empty");
		this.setBlankMode(false);
		this.element.hidden = false;
		this.currentPostId = null;
		this.currentPostFeedId = "";
		this.currentPostSource = "";
		this.currentPostRead = false;
		this.avatarTarget.hidden = true;
		this.avatarTarget.src = "/images/blank_avatar.png";
		this.avatarTarget.alt = "";
		this.avatarTarget.title = "";
		this.avatarTarget.classList.remove("is-feed-link");
		this.setTitle("Select a post");
		this.metaTarget.textContent = "";
		this.contentTarget.dataset.postId = "";
		this.contentTarget.dataset.postUrl = "";
		this.contentTarget.dataset.postTitle = "";
		this.contentTarget.dataset.postSource = "";
		this.contentTarget.dataset.postPublishedAt = "";
		this.contentTarget.dataset.postHasTitle = "";
		this.applyDomainImageClass("");
		this.contentTarget.innerHTML = `
			<div class="reader-welcome">
				<p class="reader-welcome-eyebrow">Welcome to Inkwell</p>
				<p>Select a post to start reading.</p>
				<p>Make highlights to remember passages later or to blog quotes from them.</p>
				<p>Keyboard shortcuts:</p>
				<ul class="reader-welcome-tips">
					<li><code>1, 2, 3</code> — switch tabs</li>
					<li><code>/</code> — search posts</li>
					<li><code>U</code> — toggle read status</li>
					<li><code>H</code> — toggle hiding read posts</li>
					<li><code>B</code> — bookmark</li>
					<li><code>R</code> — refresh</li>
				</ul>
				<p>What is the <code>Fading</code> tab? Posts older than a few days are collected here. After a week, they are automatically archived, so your unread posts never get out of control.</p>
            	<p>Need help? Email <a href="mailto:help@micro.blog">help@micro.blog</a>.</p>
			</div>
		`;
		this.preloadWelcomeBackground();
	}

	showBlank() {
		this.setSummaryMode(false);
		this.element.classList.remove("is-resolving");
		this.element.classList.remove("is-empty");
		this.setBlankMode(true);
		this.element.hidden = false;
		this.currentPostId = null;
		this.currentPostFeedId = "";
		this.currentPostSource = "";
		this.currentPostRead = false;
		this.avatarTarget.hidden = true;
		this.avatarTarget.src = "/images/blank_avatar.png";
		this.avatarTarget.alt = "";
		this.avatarTarget.title = "";
		this.avatarTarget.classList.remove("is-feed-link");
		this.titleTarget.textContent = "";
		this.titleTarget.title = "";
		this.metaTarget.textContent = "";
		this.contentTarget.dataset.postId = "";
		this.contentTarget.dataset.postUrl = "";
		this.contentTarget.dataset.postTitle = "";
		this.contentTarget.dataset.postSource = "";
		this.contentTarget.dataset.postPublishedAt = "";
		this.contentTarget.dataset.postHasTitle = "";
		this.applyDomainImageClass("");
		this.contentTarget.innerHTML = "";
	}

	setBlankMode(is_blank) {
		this.element.classList.toggle("is-blank", Boolean(is_blank));
	}

	setSummaryMode(is_summary) {
		this.element.classList.toggle("is-summary", is_summary);
	}

	preloadWelcomeBackground() {
		if (this.welcomeBackgroundLoading || this.welcomeBackgroundLoaded) {
			return;
		}

		this.welcomeBackgroundLoading = true;
		const image = new Image();
		image.onload = () => {
			this.welcomeBackgroundLoaded = true;
			this.welcomeBackgroundLoading = false;
			this.element.classList.add("right-pane--hi-res");
		};
		image.onerror = () => {
			this.welcomeBackgroundLoading = false;
		};
		image.src = "/images/homepage/background_6_high.jpg";
	}

  async toggleRead() {
		if (!this.currentPostId || !this.currentPostFeedId) {
      return;
    }

		try {
			if (this.currentPostRead) {
				await markUnread(this.currentPostId);
				await markFeedEntriesUnread([this.currentPostId]);
			}
			else {
				await markRead(this.currentPostId);
			}
		}
		catch (error) {
			console.warn("Failed to toggle read state", error);
		}
    this.currentPostRead = !this.currentPostRead;
    const eventName = this.currentPostRead ? "post:read" : "post:unread";
    window.dispatchEvent(new CustomEvent(eventName, { detail: { postId: this.currentPostId } }));
  }

	handleKeydown(event) {
		if (this.shouldIgnoreKey(event)) {
			return;
		}

		if (this.isSpaceKey(event) && !this.shouldIgnoreSpaceKey(event)) {
			event.preventDefault();
			this.scrollReaderPage(event.shiftKey ? -1 : 1);
			return;
		}

		if (event.key.toLowerCase() == "u") {
			event.preventDefault();
			this.toggleRead();
		}
	}

	handleToggleRead() {
		this.toggleRead();
	}

	scrollReaderPage(direction) {
		const window_height = window.innerHeight || document.documentElement.clientHeight || 0;
		const scroll_step = Math.max(1, Math.round(window_height * 0.7));
		this.element.scrollBy({
			top: scroll_step * direction,
			behavior: "smooth"
		});
	}

	isSpaceKey(event) {
		if (event.code == "Space") {
			return true;
		}
		return event.key == " " || event.key == "Spacebar";
	}

	shouldIgnoreSpaceKey(event) {
		const target = event.target;
		if (!target) {
			return false;
		}

		const tag_name = target.tagName;
		return tag_name == "BUTTON" || tag_name == "A";
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

		const tag_name = target.tagName;
		return tag_name == "INPUT" || tag_name == "TEXTAREA" || tag_name == "SELECT";
	}

  setTitle(title) {
    const trimmed = title ? title.trim() : "";
    const label = this.truncateTitle(trimmed || "Untitled");
    this.titleTarget.textContent = label;
    this.titleTarget.title = trimmed || "Untitled";
  }

	setMeta(post) {
		if (!this.metaTarget || !post) {
			return;
		}

    const source = post.source || "";
    const sourceUrl = post.source_url || "";
    const formattedDate = this.formatDate(post.published_at);
    this.metaTarget.textContent = "";

		const fragment = document.createDocumentFragment();
		if (source) {
			const source_fragment = document.createElement("span");
			source_fragment.className = "reader-meta-source";
			if (sourceUrl) {
				const link = document.createElement("a");
				link.href = sourceUrl;
				link.textContent = source;
				link.target = "_blank";
				link.rel = "noopener noreferrer";
				source_fragment.append(link);
			}
			else {
				source_fragment.textContent = source;
			}
			fragment.append(source_fragment);
		}

		if (formattedDate) {
			if (source) {
				const separator_fragment = document.createElement("span");
				separator_fragment.className = "reader-meta-separator";
				separator_fragment.textContent = " - ";
				fragment.append(separator_fragment);
			}
			if (post.url) {
				const link = document.createElement("a");
				link.className = "reader-meta-date";
				link.href = post.url;
				link.textContent = formattedDate;
				link.target = "_blank";
				link.rel = "noopener noreferrer";
				fragment.append(link);
			}
			else {
				const date_fragment = document.createElement("span");
				date_fragment.className = "reader-meta-date";
				date_fragment.textContent = formattedDate;
				fragment.append(date_fragment);
			}
		}

		this.metaTarget.append(fragment);
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

	decorateRecapMarkup(markup) {
		if (!markup) {
			return recap_email_settings_markup;
		}

		const quote_intro_regex = /<p>(💬 Quoting from <a href[\s\S]*?)<\/p>/g;
		const decorated_markup = markup.replace(quote_intro_regex, (_match, quote_html) => {
			return `<p class="reading-recap-quote"><span class="reading-recap-quote-main">${quote_html}</span><span class="reading-recap-quote-bookmark"><button type="button" class="reading-recap-quote-bookmark-button">☆ Bookmark</button></span></p>`;
		});

		const parser = new DOMParser();
		const doc = parser.parseFromString(decorated_markup, "text/html");
		const wrapper = doc.createElement("div");
		wrapper.innerHTML = recap_email_settings_markup;
		const settings_el = wrapper.firstElementChild;
		if (!settings_el) {
			return decorated_markup;
		}

		const recap_container = doc.querySelector(".reading-recap");
		if (recap_container) {
			doc.body.insertBefore(settings_el, recap_container);
		}
		else {
			doc.body.insertBefore(settings_el, doc.body.firstChild);
		}

		return doc.body.innerHTML;
	}

	applyRecapColors() {
		const recap_els = this.contentTarget.querySelectorAll(".reading-recap");
		if (!recap_els.length) {
			return;
		}

		const is_dark_theme = this.isDarkTheme();
		recap_els.forEach((recap_el) => {
			const light_color = this.normalizeRecapColor(recap_el.dataset.colorLight);
			const dark_color = this.normalizeRecapColor(recap_el.dataset.colorDark || recap_el.dataset.colorRight);
			const recap_base_color = is_dark_theme
				? (dark_color || light_color)
				: (light_color || dark_color);
			const recap_color = this.withRecapColorOpacity(recap_base_color);
			const recap_topics_color = this.withRecapColorOpacity(recap_base_color, "e6");
			const recap_blockquote_background = this.withRecapColorOpacity(recap_base_color, "99");
			const recap_blockquote_border = this.withRecapColorOpacity(recap_base_color, "ff");

			recap_el.style.backgroundColor = recap_color || "";
			if (recap_topics_color) {
				recap_el.style.setProperty("--recap-topics-background", recap_topics_color);
			}
			else {
				recap_el.style.removeProperty("--recap-topics-background");
			}
			if (recap_blockquote_background) {
				recap_el.style.setProperty("--recap-blockquote-background", recap_blockquote_background);
			}
			else {
				recap_el.style.removeProperty("--recap-blockquote-background");
			}
			if (recap_blockquote_border) {
				recap_el.style.setProperty("--recap-blockquote-border", recap_blockquote_border);
			}
			else {
				recap_el.style.removeProperty("--recap-blockquote-border");
			}
		});
	}

	isDarkTheme() {
		const root_theme = (document.documentElement.dataset.theme || "").trim().toLowerCase();
		if (root_theme == "dark") {
			return true;
		}
		if (root_theme == "default") {
			return false;
		}
		if (typeof window == "undefined" || typeof window.matchMedia != "function") {
			return false;
		}
		return window.matchMedia("(prefers-color-scheme: dark)").matches;
	}

	normalizeRecapColor(raw_color) {
		const normalized_color = (raw_color || "").trim();
		if (!normalized_color) {
			return "";
		}

		const is_hex_color = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized_color);
		if (!is_hex_color) {
			return "";
		}

		const hex = normalized_color.slice(1);
		if (hex.length == 3 || hex.length == 4) {
			const expanded = [...hex].map((character) => `${character}${character}`).join("");
			return `#${expanded}`;
		}

		return `#${hex}`;
	}

	withRecapColorOpacity(color_value, opacity_hex = "80") {
		const normalized_color = this.normalizeRecapColor(color_value);
		if (!normalized_color) {
			return "";
		}

		const base_color = normalized_color.length == 9
			? normalized_color.slice(0, 7)
			: normalized_color;
		const normalized_opacity = (opacity_hex || "").trim().toLowerCase();
		const safe_opacity = /^[0-9a-f]{2}$/i.test(normalized_opacity) ? normalized_opacity : "80";
		return `${base_color}${safe_opacity}`;
	}

	applyDomainImageClass(post_url) {
		const should_use_narrow_images = this.shouldUseNarrowDomainImages(post_url);
		this.contentTarget.classList.toggle(narrow_image_css_class, should_use_narrow_images);
	}

	shouldUseNarrowDomainImages(post_url) {
		const normalized_post_url = (post_url || "").trim();
		if (!normalized_post_url) {
			return false;
		}

		let hostname = "";
		try {
			hostname = new URL(normalized_post_url).hostname.toLowerCase();
		}
		catch (error) {
			try {
				hostname = new URL(`https://${normalized_post_url}`).hostname.toLowerCase();
			}
			catch (second_error) {
				hostname = "";
			}
		}

		return narrow_image_domains.some((domain) => {
			const normalized_domain = (domain || "").trim().toLowerCase();
			if (!normalized_domain) {
				return false;
			}
			if (hostname) {
				return hostname == normalized_domain || hostname.endsWith(`.${normalized_domain}`);
			}
			return normalized_post_url.toLowerCase().includes(normalized_domain);
		});
	}

	normalizeRecapEmailDay(raw_day) {
		const normalized_day = (raw_day || "").trim().toLowerCase();
		if (!normalized_day) {
			return "";
		}

		const matching_day = recap_email_days.find((day) => day.toLowerCase() == normalized_day);
		return matching_day || "";
	}

	getStoredRecapEmailEnabled() {
		const stored_enabled = localStorage.getItem(recap_email_enabled_storage_key);
		if (stored_enabled == "true") {
			return true;
		}
		if (stored_enabled == "false") {
			return false;
		}

		return null;
	}

	setStoredRecapEmailEnabled(is_enabled) {
		if (is_enabled == true) {
			localStorage.setItem(recap_email_enabled_storage_key, "true");
			return;
		}
		if (is_enabled == false) {
			localStorage.setItem(recap_email_enabled_storage_key, "false");
			return;
		}

		localStorage.removeItem(recap_email_enabled_storage_key);
	}

	setRecapBookmarkButtonState(bookmark_button, is_bookmarked) {
		if (!bookmark_button) {
			return;
		}

		if (is_bookmarked) {
			bookmark_button.classList.add("is-bookmarked");
			bookmark_button.textContent = "★ Bookmarked";
		}
		else {
			bookmark_button.classList.remove("is-bookmarked");
			bookmark_button.textContent = "☆ Bookmark";
		}
	}

}
