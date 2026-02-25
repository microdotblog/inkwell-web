import { Controller } from "../stimulus.js";
import { fetchBlogrollDirectory, fetchDiscoverPosts } from "../api/feeds.js";

const DEFAULT_AVATAR_URL = "/images/blank_avatar.png";
const RECENTLY_ADDED_TOPIC_KEY = "recently-added";
const RECENTLY_ON_MICRO_BLOG_TOPIC_KEY = "recently-on-micro-blog";

const TOPIC_LABELS = {
	"art-design": "Art & Design",
	"daily-life": "Daily Life",
	"digital-gardens": "Digital Gardens",
	"directories": "Directories",
	"food-drink": "Food & Drink",
	"microblogs": "Microblogs",
	"outdoor-life": "Outdoor Life",
	"personal": "Personal",
	"photography": "Photography",
	"pop-culture": "Pop Culture",
	"science-humanities": "Science & Humanities",
	"society-economics": "Society & Economics",
	"technology": "Technology",
	"recently-added": "Recently Added",
	"recently-on-micro-blog": "Recently on Micro.blog"
};

export default class extends Controller {
	static targets = ["pane", "readerView", "topics", "list", "searchInput"];

	connect() {
		this.entries = [];
		this.topics = [];
		this.discover_posts = [];
		this.active_topic = "";
		this.search_query = "";
		this.is_visible = false;
		this.is_loading = false;
		this.has_loaded = false;
		this.load_error = "";
		this.is_loading_discover_posts = false;
		this.has_loaded_discover_posts = false;
		this.discover_posts_error = "";
		this.handleOpen = this.handleOpen.bind(this);
		this.handleClose = this.handleClose.bind(this);
		this.handleDiscoverPostAvatarError = this.handleDiscoverPostAvatarError.bind(this);
		window.addEventListener("discover:open", this.handleOpen);
		window.addEventListener("subscriptions:open", this.handleClose);
		window.addEventListener("highlights:open", this.handleClose);
		window.addEventListener("post:open", this.handleClose);
		window.addEventListener("reader:summary", this.handleClose);
		window.addEventListener("reader:welcome", this.handleClose);
		window.addEventListener("reader:blank", this.handleClose);
		this.element.addEventListener("error", this.handleDiscoverPostAvatarError, true);
		this.render();
	}

	disconnect() {
		window.removeEventListener("discover:open", this.handleOpen);
		window.removeEventListener("subscriptions:open", this.handleClose);
		window.removeEventListener("highlights:open", this.handleClose);
		window.removeEventListener("post:open", this.handleClose);
		window.removeEventListener("reader:summary", this.handleClose);
		window.removeEventListener("reader:welcome", this.handleClose);
		window.removeEventListener("reader:blank", this.handleClose);
		this.element.removeEventListener("error", this.handleDiscoverPostAvatarError, true);
	}

	async handleOpen() {
		this.showPane();
		await this.loadDirectory();
		this.render();
	}

	handleClose() {
		this.hidePane();
	}

	showPane() {
		if (this.is_visible) {
			this.resetScrollPosition();
			return;
		}

		window.dispatchEvent(new CustomEvent("subscriptions:close"));
		this.paneTarget.hidden = false;
		this.readerViewTarget.hidden = true;
		this.is_visible = true;
		this.resetScrollPosition();
	}

	hidePane() {
		if (!this.is_visible) {
			return;
		}

		this.paneTarget.hidden = true;
		this.readerViewTarget.hidden = false;
		this.is_visible = false;
	}

	async loadDirectory() {
		if (this.is_loading || this.has_loaded) {
			return;
		}

		this.is_loading = true;
		this.load_error = "";
		this.render();

		try {
			const payload = await fetchBlogrollDirectory();
			this.entries = this.normalizeEntries(payload?.entries);
			this.topics = this.normalizeTopics(payload?.categories, this.entries);
			this.has_loaded = true;
		}
		catch (error) {
			console.warn("Failed to load blogroll directory", error);
			this.load_error = "Unable to load curated blogs right now.";
		}
		finally {
			this.is_loading = false;
			this.render();
		}
	}

	async loadDiscoverPosts() {
		if (this.is_loading_discover_posts || this.has_loaded_discover_posts) {
			return;
		}

		this.is_loading_discover_posts = true;
		this.discover_posts_error = "";
		this.renderSites();

		try {
			const payload = await fetchDiscoverPosts();
			this.discover_posts = this.normalizeDiscoverPosts(payload);
			this.has_loaded_discover_posts = true;
		}
		catch (error) {
			console.warn("Failed to load discover posts", error);
			this.discover_posts = [];
			this.discover_posts_error = "Unable to load recent posts right now.";
		}
		finally {
			this.is_loading_discover_posts = false;
			this.renderSites();
		}
	}

	selectTopic(event) {
		event.preventDefault();
		const next_topic = this.normalizeTopicKey(event.currentTarget?.dataset.topic || "");
		if (!next_topic) {
			return;
		}

		if (this.search_query) {
			this.search_query = "";
			if (this.hasSearchInputTarget) {
				this.searchInputTarget.value = "";
			}
		}

		this.active_topic = next_topic;
		this.render();

		if (next_topic == RECENTLY_ON_MICRO_BLOG_TOPIC_KEY) {
			this.loadDiscoverPosts();
		}
	}

	render() {
		this.renderTopics();
		this.renderSites();
	}

	renderTopics() {
		if (!this.hasTopicsTarget) {
			return;
		}

		if (this.is_loading && !this.has_loaded) {
			this.topicsTarget.innerHTML = "<p class=\"discover-empty\"><img class=\"subscriptions-spinner\" src=\"/images/progress_spinner.svg\" alt=\"Loading topics\"></p>";
			return;
		}

		if (!this.topics.length) {
			if (this.load_error) {
				this.topicsTarget.innerHTML = `<p class="discover-empty">${this.escapeHtml(this.load_error)}</p>`;
				return;
			}
			this.topicsTarget.innerHTML = "<p class=\"discover-empty\">No topics available.</p>";
			return;
		}

		const topics_markup = this.topics.map((topic_key) => {
			const is_active = topic_key == this.active_topic;
			return `
				<button
					type="button"
					class="discover-topic btn-sm"
					data-topic="${this.escapeAttribute(topic_key)}"
					data-action="discover#selectTopic"
					aria-pressed="${is_active ? "true" : "false"}"
				>${this.escapeHtml(this.topicLabel(topic_key))}</button>
			`;
		}).join("");
		this.topicsTarget.innerHTML = topics_markup;
	}

	renderSites() {
		if (!this.hasListTarget) {
			return;
		}

		if (this.is_loading && !this.has_loaded) {
			this.listTarget.innerHTML = "";
			return;
		}

		if (this.load_error) {
			this.listTarget.innerHTML = `<p class="discover-empty">${this.escapeHtml(this.load_error)}</p>`;
			return;
		}

		if (this.active_topic == RECENTLY_ON_MICRO_BLOG_TOPIC_KEY) {
			this.renderDiscoverPosts();
			return;
		}

		const matching_entries = this.getFilteredEntries();
		if (!matching_entries.length) {
			if (this.search_query) {
				this.listTarget.innerHTML = "<p class=\"discover-empty\">No blogs match this search.</p>";
				return;
			}
			if (this.active_topic) {
				this.listTarget.innerHTML = "<p class=\"discover-empty\">No blogs found for this topic.</p>";
				return;
			}
			this.listTarget.innerHTML = "<p class=\"discover-empty\">No blogs found.</p>";
			return;
		}

		const list_markup = matching_entries.map((entry) => this.renderSite(entry)).join("");
		this.listTarget.innerHTML = list_markup;
	}

	renderDiscoverPosts() {
		if (!this.hasListTarget) {
			return;
		}

		if (!this.has_loaded_discover_posts && !this.is_loading_discover_posts) {
			this.loadDiscoverPosts();
		}

		if (this.is_loading_discover_posts && !this.has_loaded_discover_posts) {
			this.listTarget.innerHTML = "<p class=\"discover-empty\"><img class=\"subscriptions-spinner\" src=\"/images/progress_spinner.svg\" alt=\"Loading posts\"></p>";
			return;
		}

		if (this.discover_posts_error) {
			this.listTarget.innerHTML = `<p class="discover-empty">${this.escapeHtml(this.discover_posts_error)}</p>`;
			return;
		}

		if (!this.discover_posts.length) {
			this.listTarget.innerHTML = "<p class=\"discover-empty\">No recent posts available.</p>";
			return;
		}

		const list_markup = this.discover_posts.map((post) => this.renderDiscoverPost(post)).join("");
		this.listTarget.innerHTML = list_markup;
	}

	handleSearchInput(event) {
		this.search_query = (event.target?.value || "").trim().toLowerCase();
		if (this.search_query && this.active_topic) {
			this.active_topic = "";
		}
		this.render();
	}

	subscribe(event) {
		event.preventDefault();
		const feed_url = (event.currentTarget?.dataset.feedUrl || "").trim();
		if (!feed_url) {
			return;
		}

		window.dispatchEvent(new CustomEvent("timeline:openFeeds"));
		window.dispatchEvent(new CustomEvent("subscriptions:open", {
			detail: {
				mode: "subscribe",
				feedUrl: feed_url
			}
		}));
	}

	getFilteredEntries() {
		let matching_entries = this.active_topic
			? this.getEntriesForTopic(this.active_topic)
			: this.getSortedEntries(this.entries);

		if (!this.search_query) {
			return matching_entries;
		}

		const search_query = this.search_query;
		return matching_entries.filter((entry) => this.matchesSearchQuery(entry, search_query));
	}

	getEntriesForTopic(topic_key) {
		const normalized_topic = this.normalizeTopicKey(topic_key);
		const matching_entries = this.entries.filter((entry) => entry.categories.includes(normalized_topic));
		return this.getSortedEntries(matching_entries);
	}

	getSortedEntries(entries) {
		return [...(entries || [])].sort((left_entry, right_entry) => {
			const left_title = (left_entry.title || "").toLowerCase();
			const right_title = (right_entry.title || "").toLowerCase();
			return left_title.localeCompare(right_title);
		});
	}

	matchesSearchQuery(entry, search_query) {
		if (!entry) {
			return false;
		}

		const search_fields = [
			entry.title,
			entry.description,
			entry.url
		];

		return search_fields.some((field) => {
			if (!field) {
				return false;
			}
			return field.toLowerCase().includes(search_query);
		});
	}

	renderSite(entry) {
		const site_title = this.escapeHtml(entry.title || this.displayUrl(entry.url) || entry.url);
		const site_description = this.escapeHtml(entry.description || "");
		const site_url = this.escapeAttribute(entry.url || "");
		const display_url = this.escapeHtml(this.displayUrl(entry.url || ""));
		const avatar_url = this.escapeAttribute(this.getFaviconUrl(entry.url || ""));
		const feed_url = this.escapeAttribute(entry.url || "");
		const description_markup = site_description
			? `<p class="discover-site-description">${site_description}</p>`
			: "";

		return `
			<article class="discover-site">
				<img class="discover-site-avatar" src="${avatar_url}" alt="" loading="lazy" width="30" height="30">
				<div class="discover-site-content">
					<h3 class="discover-site-title">${site_title}</h3>
					${description_markup}
					<p class="discover-site-url"><a href="${site_url}" target="_blank" rel="noopener noreferrer">${display_url}</a></p>
				</div>
				<div class="discover-site-actions">
					<button type="button" class="btn-sm" data-feed-url="${feed_url}" data-action="discover#subscribe">Subscribe</button>
				</div>
			</article>
		`;
	}

	renderDiscoverPost(post) {
		const author_name = this.escapeHtml(this.getDiscoverPostAuthorName(post?.author));
		const author_url = this.escapeAttribute(post?.author_url || "");
		const author_avatar = this.escapeAttribute(post?.author_avatar || DEFAULT_AVATAR_URL);
		const post_url = this.escapeAttribute(post?.url || "");
		const feed_url = this.escapeAttribute(post?.feed_url || "");
		const content_html = this.renderDiscoverPostContent(post);
		const date_text = this.escapeHtml(this.formatDiscoverPostDate(post?.date_published));
		const author_markup = author_url
			? `<a href="${author_url}" target="_blank" rel="noopener noreferrer">${author_name}</a>`
			: author_name;
		const date_markup = post_url
			? `<a href="${post_url}" target="_blank" rel="noopener noreferrer">${date_text}</a>`
			: date_text;
		const subscribe_markup = feed_url
			? `<button type="button" class="btn-sm" data-feed-url="${feed_url}" data-action="discover#subscribe">Subscribe</button>`
			: "";

		return `
			<article class="reply-item discover-post">
				<img class="reply-avatar discover-post-avatar" src="${author_avatar}" alt="" loading="lazy" width="30" height="30">
				<div class="reply-body discover-post-body">
					<div class="discover-post-header">
						<p class="reply-author">${author_markup}</p>
						<div class="discover-site-actions">
							${subscribe_markup}
						</div>
					</div>
					<div class="reply-content">${content_html}</div>
					<p class="reply-date discover-post-date">${date_markup}</p>
				</div>
			</article>
		`;
	}

	getFaviconUrl(raw_url) {
		const trimmed_url = (raw_url || "").trim();
		if (!trimmed_url) {
			return DEFAULT_AVATAR_URL;
		}

		try {
			const domain = new URL(trimmed_url).hostname;
			if (!domain) {
				return DEFAULT_AVATAR_URL;
			}
			return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}`;
		}
		catch (error) {
			return DEFAULT_AVATAR_URL;
		}
	}

	normalizeDiscoverPosts(payload) {
		const items = Array.isArray(payload?.items)
			? payload.items
			: Array.isArray(payload)
				? payload
				: [];

		return items
			.map((item) => this.normalizeDiscoverPost(item))
			.filter(Boolean);
	}

	normalizeDiscoverPost(item) {
		if (!item || typeof item != "object") {
			return null;
		}

		const post_url = this.normalizeUrl(item?.url || "");
		if (!post_url) {
			return null;
		}

		const author = this.getDiscoverPostAuthor(item);
		const author_url = this.normalizeUrl(author?.url || "");
		const author_avatar = this.normalizeUrl(author?.avatar || "") || DEFAULT_AVATAR_URL;

		return {
			url: post_url,
			date_published: item?.date_published || item?.date_modified || "",
			content_html: `${item?.content_html || ""}`.trim(),
			content_text: `${item?.content_text || item?.summary || ""}`.trim(),
			author,
			author_url,
			author_avatar,
			feed_url: this.feedUrlFromPermalink(post_url)
		};
	}

	getDiscoverPostAuthor(item) {
		const authors = Array.isArray(item?.authors) ? item.authors : [];
		const first_author = authors.find((author) => author && typeof author == "object");
		if (first_author) {
			return first_author;
		}

		if (item?.author && typeof item.author == "object") {
			return item.author;
		}

		return {};
	}

	getDiscoverPostAuthorName(author) {
		const name = `${author?.name || ""}`.trim();
		if (name) {
			return name;
		}

		const username = `${author?._microblog?.username || ""}`.trim();
		if (username) {
			return username;
		}

		return "Unknown";
	}

	normalizeTopics(raw_categories, entries) {
		const topic_set = new Set();
		const ordered_topics = [];
		const categories = Array.isArray(raw_categories) ? raw_categories : [];

		categories.forEach((category) => {
			const topic_key = this.normalizeTopicKey(category);
			if (!topic_key || topic_set.has(topic_key)) {
				return;
			}

			topic_set.add(topic_key);
			ordered_topics.push(topic_key);
		});

		(entries || []).forEach((entry) => {
			(entry.categories || []).forEach((category) => {
				const topic_key = this.normalizeTopicKey(category);
				if (!topic_key || topic_set.has(topic_key)) {
					return;
				}

				topic_set.add(topic_key);
				ordered_topics.push(topic_key);
			});
		});

		return this.prioritizeTopics(ordered_topics);
	}

	prioritizeTopics(raw_topics) {
		const topics = Array.isArray(raw_topics) ? raw_topics.filter(Boolean) : [];
		const has_recently_added = topics.includes(RECENTLY_ADDED_TOPIC_KEY);
		const ordered_topics = topics.filter((topic_key) => topic_key != RECENTLY_ADDED_TOPIC_KEY && topic_key != RECENTLY_ON_MICRO_BLOG_TOPIC_KEY);

		if (has_recently_added) {
			ordered_topics.push(RECENTLY_ADDED_TOPIC_KEY);
		}
		ordered_topics.push(RECENTLY_ON_MICRO_BLOG_TOPIC_KEY);

		return ordered_topics;
	}

	normalizeEntries(raw_entries) {
		if (!Array.isArray(raw_entries)) {
			return [];
		}

		return raw_entries
			.map((entry) => {
				if (!entry || typeof entry != "object") {
					return null;
				}

				const url = (entry.url || "").trim();
				if (!url) {
					return null;
				}

				const categories = Array.isArray(entry.categories)
					? entry.categories.map((category) => this.normalizeTopicKey(category)).filter(Boolean)
					: [];

				return {
					title: (entry.title || "").trim(),
					description: (entry.description || "").trim(),
					url,
					categories
				};
			})
			.filter(Boolean);
	}

	normalizeTopicKey(raw_topic) {
		return String(raw_topic || "")
			.trim()
			.toLowerCase()
			.replace(/[\s_]+/g, "-");
	}

	topicLabel(topic_key) {
		const normalized_topic = this.normalizeTopicKey(topic_key);
		if (!normalized_topic) {
			return "";
		}

		const predefined_label = TOPIC_LABELS[normalized_topic];
		if (predefined_label) {
			return predefined_label;
		}

		return normalized_topic
			.split("-")
			.map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : "")
			.filter(Boolean)
			.join(" ");
	}

	displayUrl(raw_url) {
		const trimmed_url = (raw_url || "").trim();
		if (!trimmed_url) {
			return "";
		}

		try {
			const parsed_url = new URL(trimmed_url);
			const pathname = parsed_url.pathname || "";
			const clean_path = pathname == "/" ? "" : pathname.replace(/\/$/, "");
			return `${parsed_url.host}${clean_path}`;
		}
		catch (error) {
			return trimmed_url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
		}
	}

	renderDiscoverPostContent(post) {
		const content_html = (post?.content_html || "").trim();
		if (content_html) {
			return this.sanitizeHtml(content_html);
		}

		const content_text = `${post?.content_text || ""}`.trim();
		if (!content_text) {
			return "";
		}

		const safe_text = this.escapeHtml(content_text).replace(/\r?\n/g, "<br>");
		return `<p>${safe_text}</p>`;
	}

	formatDiscoverPostDate(raw_date) {
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

	parseDate(raw_date) {
		const trimmed = `${raw_date || ""}`.trim();
		if (!trimmed) {
			return null;
		}

		const date = new Date(trimmed);
		if (Number.isNaN(date.getTime())) {
			return null;
		}
		return date;
	}

	feedUrlFromPermalink(raw_url) {
		const normalized_url = this.normalizeUrl(raw_url);
		if (!normalized_url) {
			return "";
		}

		try {
			const parsed_url = new URL(normalized_url);
			if (!parsed_url.hostname) {
				return "";
			}
			return `${parsed_url.protocol}//${parsed_url.hostname}`;
		}
		catch (error) {
			return "";
		}
	}

	handleDiscoverPostAvatarError(event) {
		const image_el = event.target;
		if (!image_el || image_el.tagName != "IMG") {
			return;
		}
		if (!image_el.classList.contains("discover-post-avatar")) {
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
		return this.escapeHtml(value).replace(/`/g, "&#96;");
	}

	resetScrollPosition() {
		this.element.scrollTop = 0;
	}
}
