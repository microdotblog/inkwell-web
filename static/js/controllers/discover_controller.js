import { Controller } from "../stimulus.js";
import { fetchBlogrollDirectory } from "../api/feeds.js";

const DEFAULT_AVATAR_URL = "/images/blank_avatar.png";

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
	"recently-added": "Recently Added"
};

export default class extends Controller {
	static targets = ["pane", "readerView", "topics", "list", "searchInput"];

	connect() {
		this.entries = [];
		this.topics = [];
		this.active_topic = "";
		this.search_query = "";
		this.is_visible = false;
		this.is_loading = false;
		this.has_loaded = false;
		this.load_error = "";
		this.handleOpen = this.handleOpen.bind(this);
		this.handleClose = this.handleClose.bind(this);
		window.addEventListener("discover:open", this.handleOpen);
		window.addEventListener("subscriptions:open", this.handleClose);
		window.addEventListener("highlights:open", this.handleClose);
		window.addEventListener("post:open", this.handleClose);
		window.addEventListener("reader:summary", this.handleClose);
		window.addEventListener("reader:welcome", this.handleClose);
		window.addEventListener("reader:blank", this.handleClose);
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
			this.topicsTarget.innerHTML = "<p class=\"discover-empty\">Loading topics...</p>";
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
