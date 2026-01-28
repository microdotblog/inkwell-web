import { Controller } from "../stimulus.js";
import { fetchReadableContent } from "../api/content.js";
import { markFeedEntriesUnread } from "../api/feeds.js";
import { markRead, markUnread } from "../storage/reads.js";

export default class extends Controller {
  static targets = ["content", "title", "meta", "markUnread", "avatar"];

	connect() {
		this.handlePostOpen = this.handlePostOpen.bind(this);
		this.handleWelcome = this.handleWelcome.bind(this);
		this.handleClear = this.handleClear.bind(this);
		this.handleKeydown = this.handleKeydown.bind(this);
		window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("reader:welcome", this.handleWelcome);
		window.addEventListener("reader:clear", this.handleClear);
		window.addEventListener("keydown", this.handleKeydown);
		this.showPlaceholder();
	}

	disconnect() {
		window.removeEventListener("post:open", this.handlePostOpen);
		window.removeEventListener("reader:welcome", this.handleWelcome);
		window.removeEventListener("reader:clear", this.handleClear);
		window.removeEventListener("keydown", this.handleKeydown);
	}

  async handlePostOpen(event) {
    const { post } = event.detail;
    if (!post) {
      return;
    }

    this.element.classList.remove("is-empty");
		this.element.hidden = false;
    this.currentPostTitle = post.title || "Untitled";
    this.currentPostId = post.id;
    this.currentPostRead = Boolean(post.is_read);
    this.markUnreadTarget.disabled = false;
    this.updateReadButton();
    this.setTitle(this.currentPostTitle);
    this.setMeta(post);
    this.contentTarget.innerHTML = "<p class=\"loading\">Loading readable view...</p>";
    this.avatarTarget.hidden = false;
    this.avatarTarget.src = post.avatar_url || "/images/blank_avatar.png";
    this.avatarTarget.alt = "";
    this.contentTarget.dataset.postTitle = this.currentPostTitle;

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
    this.contentTarget.dataset.postTitle = this.currentPostTitle;
    this.dispatch("ready", { detail: { postId: post.id }, prefix: "reader" });
  }

	handleWelcome() {
		this.showPlaceholder();
	}

	handleClear() {
		this.clearReader();
	}

	clearReader() {
		this.currentPostId = null;
		this.currentPostRead = false;
		this.markUnreadTarget.disabled = true;
		this.updateReadButton();
		this.avatarTarget.hidden = true;
		this.avatarTarget.src = "/images/blank_avatar.png";
		this.avatarTarget.alt = "";
		this.setTitle("");
		this.metaTarget.textContent = "";
		this.contentTarget.dataset.postId = "";
		this.contentTarget.dataset.postUrl = "";
		this.contentTarget.dataset.postTitle = "";
		this.contentTarget.innerHTML = "";
		this.element.classList.remove("is-empty");
		this.element.hidden = true;
	}

	showPlaceholder() {
		this.element.classList.add("is-empty");
		this.element.hidden = false;
		this.currentPostId = null;
		this.currentPostRead = false;
		this.markUnreadTarget.disabled = true;
		this.updateReadButton();
		this.avatarTarget.hidden = true;
		this.avatarTarget.src = "/images/blank_avatar.png";
		this.avatarTarget.alt = "";
		this.setTitle("Select a post");
		this.metaTarget.textContent = "";
		this.contentTarget.dataset.postId = "";
		this.contentTarget.dataset.postUrl = "";
		this.contentTarget.dataset.postTitle = "";
		this.contentTarget.innerHTML = `
			<div class="reader-welcome">
				<p class="reader-welcome-eyebrow">Welcome to Inkwell</p>
				<p>Select a post to start reading.</p>
				<p>Make highlights to remember passages later or to blog quotes from them.</p>
				<p>Keyboard shortcuts:</p>
				<ul class="reader-welcome-tips">
					<li><code>1, 2, 3</code> — switch tabs</li>
					<li><code>/</code> — search posts</li>
					<li><code>u</code> — toggle read status</li>
					<li><code>h</code> — toggle hiding read posts</li>
					<li><code>b</code> — bookmark</li>
					<li><code>r</code> — refresh</li>
				</ul>
				<p>What is the <code>Fading</code> tab? Posts older than a few days are collected here. After a week, they are automatically archived, so your unread posts never get out of control.</p>
            	<p>Need help? Email <a href="mailto:help@micro.blog">help@micro.blog</a>.</p>
			</div>
		`;
		this.preloadWelcomeBackground();
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

		this.setReadButtonPressed(true);

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
		finally {
			this.setReadButtonPressed(false);
		}

    this.currentPostRead = !this.currentPostRead;
    this.updateReadButton();
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

  updateReadButton() {
    if (!this.markUnreadTarget) {
      return;
    }

    this.markUnreadTarget.textContent = this.currentPostRead ? "Mark Unread" : "Mark Read";
  }

	setReadButtonPressed(pressed) {
		if (!this.markUnreadTarget) {
			return;
		}

		this.markUnreadTarget.classList.toggle("is-pressed", pressed);
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
