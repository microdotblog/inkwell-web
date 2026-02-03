import { Controller } from "../stimulus.js";
import { fetchReadableContent } from "../api/content.js";
import { DEFAULT_AVATAR_URL } from "../api/posts.js";
import { markFeedEntriesUnread } from "../api/feeds.js";
import { markRead, markUnread } from "../storage/reads.js";
import { parse_hash } from "../router.js";

export default class extends Controller {
  static targets = ["content", "title", "meta", "avatar"];

	connect() {
		this.handlePostOpen = this.handlePostOpen.bind(this);
		this.handleAvatarError = this.handleAvatarError.bind(this);
		this.handleWelcome = this.handleWelcome.bind(this);
		this.handleClear = this.handleClear.bind(this);
		this.handleResolvingRoute = this.handleResolvingRoute.bind(this);
		this.handleSummary = this.handleSummary.bind(this);
		this.handleSummaryAvatarError = this.handleSummaryAvatarError.bind(this);
		this.handleKeydown = this.handleKeydown.bind(this);
		this.handleToggleRead = this.handleToggleRead.bind(this);
		window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("reader:welcome", this.handleWelcome);
		window.addEventListener("reader:clear", this.handleClear);
		window.addEventListener("reader:resolvingRoute", this.handleResolvingRoute);
		window.addEventListener("reader:summary", this.handleSummary);
		window.addEventListener("reader:toggleRead", this.handleToggleRead);
		window.addEventListener("keydown", this.handleKeydown);
		this.avatarTarget.addEventListener("error", this.handleAvatarError);
		this.contentTarget.addEventListener("error", this.handleSummaryAvatarError, true);
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
		window.removeEventListener("reader:clear", this.handleClear);
		window.removeEventListener("reader:resolvingRoute", this.handleResolvingRoute);
		window.removeEventListener("reader:summary", this.handleSummary);
		window.removeEventListener("reader:toggleRead", this.handleToggleRead);
		window.removeEventListener("keydown", this.handleKeydown);
		this.avatarTarget.removeEventListener("error", this.handleAvatarError);
		this.contentTarget.removeEventListener("error", this.handleSummaryAvatarError, true);
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
		this.contentTarget.dataset.postHasTitle = post_has_title ? "true" : "false";

    const payload = await fetchReadableContent(post.id);
		const summary_fallback = post.summary || "No preview available yet.";
		let safe_html = this.sanitizeHtml(`<p>${summary_fallback}</p>`);
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

	handleWelcome() {
		this.showPlaceholder();
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
		this.contentTarget.dataset.postHasTitle = "";
		this.contentTarget.innerHTML = "";
	}

	handleSummary(event) {
		const summary_html = event.detail?.html || "";
		this.setSummaryMode(true);
		this.element.classList.remove("is-resolving");
		this.element.classList.remove("is-empty");
		this.element.hidden = false;
		this.currentPostId = null;
		this.currentPostRead = false;
		this.currentPostTitle = "";
		this.avatarTarget.hidden = true;
		this.avatarTarget.src = "/images/blank_avatar.png";
		this.avatarTarget.alt = "";
		this.titleTarget.textContent = "";
		this.titleTarget.title = "";
		this.metaTarget.textContent = "";
		this.contentTarget.dataset.postId = "";
		this.contentTarget.dataset.postUrl = "";
		this.contentTarget.dataset.postTitle = "";
		this.contentTarget.dataset.postSource = "";
		this.contentTarget.dataset.postHasTitle = "";
		this.contentTarget.innerHTML = this.sanitizeHtml(summary_html);
	}

	clearReader() {
		this.setSummaryMode(false);
		this.element.classList.remove("is-resolving");
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
		this.currentPostRead = false;
		this.avatarTarget.hidden = true;
		this.avatarTarget.src = "/images/blank_avatar.png";
		this.avatarTarget.alt = "";
		this.setTitle("Select a post");
		this.metaTarget.textContent = "";
		this.contentTarget.dataset.postId = "";
		this.contentTarget.dataset.postUrl = "";
		this.contentTarget.dataset.postTitle = "";
		this.contentTarget.dataset.postSource = "";
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
    if (!this.currentPostId) {
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
			if (sourceUrl) {
				const link = document.createElement("a");
				link.href = sourceUrl;
				link.textContent = source;
				link.target = "_blank";
				link.rel = "noopener noreferrer";
				fragment.append(link);
			}
			else {
				fragment.append(document.createTextNode(source));
			}
		}

		if (formattedDate) {
			if (source) {
				fragment.append(document.createTextNode(" - "));
			}
			if (post.url) {
				const link = document.createElement("a");
				link.href = post.url;
				link.textContent = formattedDate;
				link.target = "_blank";
				link.rel = "noopener noreferrer";
				fragment.append(link);
			}
			else {
				fragment.append(document.createTextNode(formattedDate));
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
			node = walker.nextNode();
		}

		return doc.body.innerHTML;
	}

}
