import { Controller } from "../stimulus.js";
import { fetchReadableContent } from "../api/content.js";
import { DEFAULT_AVATAR_URL } from "../api/posts.js";
import { markFeedEntriesUnread, updateRecapEmailSettings } from "../api/feeds.js";
import { createPostBookmark } from "../api/micropub.js";
import { markRead, markUnread } from "../storage/reads.js";
import { parse_hash } from "../router.js";

const preview_spinner_markup = "<p class=\"loading\"><img class=\"subscriptions-spinner subscriptions-spinner--inline\" src=\"/images/progress_spinner.svg\" alt=\"Loading preview\" style=\"width: 20px; height: 20px;\"></p>";
const recap_email_settings_markup = `
	<div class="reading-recap-email-settings">
		<label class="reading-recap-email-toggle">
			<input type="checkbox" class="reading-recap-email-enabled">
			<span>Send <b>Reading Recap</b> in weekly email on:</span>
		</label>
		<select class="reading-recap-email-day" aria-label="Send recap day" disabled>
			<option value="monday">Monday</option>
			<option value="tuesday">Tuesday</option>
			<option value="wednesday">Wednesday</option>
			<option value="thursday">Thursday</option>
			<option value="friday" selected>Friday</option>
			<option value="saturday">Saturday</option>
			<option value="sunday">Sunday</option>
		</select>
		<img class="reading-recap-email-spinner subscriptions-spinner subscriptions-spinner--inline" src="/images/progress_spinner.svg" alt="" aria-hidden="true" width="20" height="20" hidden>
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
		this.handleKeydown = this.handleKeydown.bind(this);
		this.handleToggleRead = this.handleToggleRead.bind(this);
		window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("reader:welcome", this.handleWelcome);
		window.addEventListener("reader:blank", this.handleBlank);
		window.addEventListener("reader:clear", this.handleClear);
		window.addEventListener("reader:resolvingRoute", this.handleResolvingRoute);
		window.addEventListener("reader:summary", this.handleSummary);
		window.addEventListener("reader:toggleRead", this.handleToggleRead);
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
		this.element.hidden = false;
    this.currentPostTitle = post.title || "Untitled";
    this.currentPostId = post.id;
    this.currentPostRead = Boolean(post.is_read);
    this.setTitle(this.currentPostTitle);
    this.setMeta(post);
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

		const should_send = enabled_checkbox.checked;
		day_select.disabled = !should_send;

		spinner.hidden = false;
		try {
			await updateRecapEmailSettings({
				enabled: should_send,
				day: day_select.value
			});
		}
		catch (error) {
			console.warn("Failed to update recap email settings", error);
		}
		finally {
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
		this.contentTarget.innerHTML = "";
	}

	handleSummary(event) {
		const summary_html = event.detail?.html || "";
		const decorated_summary_html = this.decorateRecapMarkup(summary_html);
		this.setSummaryMode(true);
		this.element.classList.remove("is-resolving");
		this.element.classList.remove("is-empty");
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
		this.contentTarget.innerHTML = this.sanitizeHtml(decorated_summary_html);
	}

	clearReader() {
		this.setSummaryMode(false);
		this.element.classList.remove("is-resolving");
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
		this.contentTarget.innerHTML = "";
		this.element.classList.remove("is-empty");
		this.element.hidden = true;
	}

	showPlaceholder() {
		this.setSummaryMode(false);
		this.element.classList.remove("is-resolving");
		this.element.classList.add("is-empty");
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
		this.contentTarget.innerHTML = "";
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

    if (event.key.toLowerCase() === "u") {
      event.preventDefault();
      this.toggleRead();
    }
  }

	handleToggleRead() {
		this.toggleRead();
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
			recap_container.insertBefore(settings_el, recap_container.firstChild);
		}
		else {
			doc.body.insertBefore(settings_el, doc.body.firstChild);
		}

		return doc.body.innerHTML;
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
