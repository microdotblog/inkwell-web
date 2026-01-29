import { Controller } from "../stimulus.js";
import { timelineBorderColors, timelineCellColors, timelineSelectedColors } from "../colors.js";
import { DEFAULT_AVATAR_URL, fetchTimelineData } from "../api/posts.js";
import {
	fetchFeedIcons,
	fetchFeedStarredEntryIds,
	markFeedEntriesRead,
	starFeedEntries,
	unstarFeedEntries
} from "../api/feeds.js";
import { loadReadIds, markAllRead, markRead } from "../storage/reads.js";

const SEGMENT_BUCKETS = {
  today: ["day-1"],
  recent: ["day-2", "day-3"],
  fading: ["day-4", "day-5", "day-6", "day-7"]
};
const HIDE_READ_KEY = "inkwell_hide_read";
const SUMMARY_TRUNCATE_LENGTH = 35;
const FEED_REFRESH_INTERVAL_MINUTES = 5;
const FEED_REFRESH_INTERVAL_MS = FEED_REFRESH_INTERVAL_MINUTES * 60 * 1000;

export default class extends Controller {
  static targets = ["list", "segments", "search", "searchToggle", "searchInput"];

  connect() {
    this.activeSegment = "today";
    this.activePostId = null;
		this.unreadOverridePostId = null;
    this.posts = [];
    this.isLoading = true;
		this.isSyncing = false;
		this.timeline_load_token = 0;
		this.subscriptionCount = null;
		this.pending_sync = false;
    this.searchActive = false;
		this.searchQuery = "";
    this.readIds = new Set();
    this.pendingReadIds = new Set();
		this.bookmark_toggling = new Set();
		this.readSyncTimer = null;
		this.refreshTimer = null;
		this.hideRead = this.loadHideReadSetting();
		this.hideReadSnapshotIds = new Set();
		this.hideReadSnapshotActive = false;
    this.handleClick = this.handleClick.bind(this);
    this.handleUnread = this.handleUnread.bind(this);
		this.handleRead = this.handleRead.bind(this);
		this.handleKeydown = this.handleKeydown.bind(this);
		this.handleSearchKeydown = this.handleSearchKeydown.bind(this);
		this.handleMarkAllRead = this.handleMarkAllRead.bind(this);
		this.handleToggleBookmark = this.handleToggleBookmark.bind(this);
		this.handleToggleHideRead = this.handleToggleHideRead.bind(this);
		this.handleAuthReady = this.handleAuthReady.bind(this);
		this.handleTimelineSync = this.handleTimelineSync.bind(this);
    this.listTarget.addEventListener("click", this.handleClick);
		this.searchInputTarget.addEventListener("keydown", this.handleSearchKeydown);
    window.addEventListener("post:unread", this.handleUnread);
		window.addEventListener("post:read", this.handleRead);
		window.addEventListener("keydown", this.handleKeydown);
		window.addEventListener("timeline:markAllRead", this.handleMarkAllRead);
		window.addEventListener("timeline:toggleBookmark", this.handleToggleBookmark);
		window.addEventListener("timeline:toggleHideRead", this.handleToggleHideRead);
		window.addEventListener("auth:ready", this.handleAuthReady);
		window.addEventListener("timeline:sync", this.handleTimelineSync);
    this.listTarget.classList.add("is-loading");
    this.load();
		this.startRefreshTimer();
  }

  disconnect() {
    this.listTarget.removeEventListener("click", this.handleClick);
		this.searchInputTarget.removeEventListener("keydown", this.handleSearchKeydown);
    window.removeEventListener("post:unread", this.handleUnread);
		window.removeEventListener("post:read", this.handleRead);
		window.removeEventListener("keydown", this.handleKeydown);
		window.removeEventListener("timeline:markAllRead", this.handleMarkAllRead);
		window.removeEventListener("timeline:toggleBookmark", this.handleToggleBookmark);
		window.removeEventListener("timeline:toggleHideRead", this.handleToggleHideRead);
		window.removeEventListener("auth:ready", this.handleAuthReady);
		window.removeEventListener("timeline:sync", this.handleTimelineSync);
    this.clearReadSyncTimer();
		this.stopRefreshTimer();
  }

  async load() {
    if (this.isSyncing) {
      return;
    }

		const load_token = this.timeline_load_token + 1;
		this.timeline_load_token = load_token;

    this.setSyncing(true);
    try {
      const [timeline_data, read_ids] = await Promise.all([
				fetchTimelineData(),
				loadReadIds()
			]);
      this.readIds = new Set(read_ids);
      this.posts = timeline_data.posts || [];
			this.subscriptionCount = timeline_data.subscription_count;
      this.posts.forEach((post) => {
        if (this.readIds.has(post.id)) {
          post.is_read = true;
        }
      });

			this.scheduleTimelineExtras(load_token);
    }
    catch (error) {
      console.warn("Failed to load timeline", error);
    }
    finally {
      this.isLoading = false;
      this.listTarget.classList.remove("is-loading");
      this.render();
      this.setSyncing(false);
			if (this.pending_sync) {
				this.pending_sync = false;
				this.load();
			}
    }
  }

  syncTimeline() {
		if (this.isSyncing) {
			this.pending_sync = true;
			return;
		}
    this.load();
  }

	handleTimelineSync(event) {
		this.syncTimeline();
	}

	startRefreshTimer() {
		this.stopRefreshTimer();
		this.refreshTimer = setInterval(() => {
			this.syncTimeline();
		}, FEED_REFRESH_INTERVAL_MS);
	}

	stopRefreshTimer() {
		if (!this.refreshTimer) {
			return;
		}
		clearInterval(this.refreshTimer);
		this.refreshTimer = null;
	}

	scheduleTimelineExtras(load_token) {
		if (!this.posts.length) {
			return;
		}

		this.loadTimelineIcons(load_token);
		this.loadTimelineBookmarks(load_token);
	}

	async loadTimelineIcons(load_token) {
		try {
			const icons = await fetchFeedIcons();
			if (this.timeline_load_token != load_token) {
				return;
			}

			const icon_map = new Map(
				Array.isArray(icons)
					? icons.map((icon) => [icon.host, icon.url]).filter(([host, url]) => host && url)
					: []
			);
			if (icon_map.size == 0) {
				return;
			}

			let did_update = false;
			this.posts.forEach((post) => {
				if (!post || post.avatar_url != DEFAULT_AVATAR_URL) {
					return;
				}

				const host = this.getHostFromUrl(post.source_url);
				if (!host) {
					return;
				}

				const icon_url = icon_map.get(host);
				if (icon_url && post.avatar_url != icon_url) {
					post.avatar_url = icon_url;
					did_update = true;
				}
			});

			if (did_update) {
				this.render();
			}
		}
		catch (error) {
			console.warn("Failed to load feed icons", error);
		}
	}

	async loadTimelineBookmarks(load_token) {
		try {
			const starred_entry_ids = await fetchFeedStarredEntryIds();
			if (this.timeline_load_token != load_token) {
				return;
			}

			const starred_set = new Set(
				Array.isArray(starred_entry_ids)
					? starred_entry_ids.map((id) => String(id))
					: []
			);

			let did_update = false;
			this.posts.forEach((post) => {
				if (this.bookmark_toggling.has(post.id)) {
					return;
				}

				const should_bookmark = starred_set.has(post.id);
				if (post.is_bookmarked != should_bookmark) {
					post.is_bookmarked = should_bookmark;
					did_update = true;
				}
			});

			if (did_update) {
				this.render();
			}
		}
		catch (error) {
			console.warn("Failed to load starred entries", error);
		}
	}

	getHostFromUrl(raw_url) {
		const trimmed = (raw_url || "").trim();
		if (!trimmed) {
			return "";
		}

		try {
			return new URL(trimmed).hostname;
		}
		catch (error) {
			try {
				return new URL(`https://${trimmed}`).hostname;
			}
			catch (secondError) {
				return "";
			}
		}
	}

  showToday() {
    this.activateSegment("today");
  }

  showRecent() {
    this.activateSegment("recent");
  }

  showFading() {
    this.activateSegment("fading");
  }

  toggleSearch() {
    if (this.searchActive) {
      this.hideSearch();
      return;
    }

    this.showSearch();
  }

  showSearch() {
    this.searchActive = true;
    this.segmentsTarget.hidden = true;
    this.searchTarget.hidden = false;
    this.searchInputTarget.focus();
    this.updateSearchToggle();
    this.render();
  }

  hideSearch() {
    this.searchActive = false;
    this.searchTarget.hidden = true;
    this.segmentsTarget.hidden = false;
    this.searchInputTarget.value = "";
		this.searchQuery = "";
    this.updateSearchToggle();
    this.render();
  }

  activateSegment(segment) {
    this.activeSegment = segment;
    this.updateSegments();
    this.render();
  }

  updateSegments() {
    const buttons = this.segmentsTarget.querySelectorAll("button[data-segment]");
    buttons.forEach((button) => {
      const isActive = button.dataset.segment === this.activeSegment;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  updateSearchToggle() {
    this.searchToggleTarget.classList.toggle("is-active", this.searchActive);
    this.searchToggleTarget.setAttribute(
      "aria-label",
      this.searchActive ? "Close search" : "Search"
    );
  }

  setSyncing(isSyncing) {
    if (this.isSyncing === isSyncing) {
      return;
    }

    this.isSyncing = isSyncing;
    if (this.hasSearchToggleTarget) {
      this.searchToggleTarget.classList.toggle("is-syncing", isSyncing);
    }

    window.dispatchEvent(
      new CustomEvent(isSyncing ? "sync:start" : "sync:stop", {
        detail: { source: "timeline" }
      })
    );
  }

	handleClick(event) {
		const item = event.target.closest("[data-post-id]");
		if (!item) {
			if (event.target == this.listTarget) {
				this.clearActivePost();
			}
			return;
		}

		if (event.metaKey) {
			this.clearActivePost();
			window.dispatchEvent(new CustomEvent("reader:clear"));
			return;
		}

		const postId = item.dataset.postId;
		const post = this.posts.find((entry) => entry.id === postId);
		this.openPost(post);
  }

	clearActivePost() {
		if (!this.activePostId) {
			return;
		}

		this.activePostId = null;
		this.unreadOverridePostId = null;
		this.render();
	}

  handleUnread(event) {
    const postId = event.detail?.postId;
    if (!postId) {
      return;
    }

    const post = this.posts.find((entry) => entry.id === postId);
    if (!post) {
      return;
    }

    post.is_read = false;
    this.readIds.delete(postId);
		this.hideReadSnapshotIds.delete(postId);
		if (postId == this.activePostId) {
			this.unreadOverridePostId = postId;
		}
    this.render();
  }

  handleRead(event) {
    const postId = event.detail?.postId;
    if (!postId) {
      return;
    }

    const post = this.posts.find((entry) => entry.id === postId);
    if (!post) {
      return;
    }

    post.is_read = true;
    this.readIds.add(postId);
		if (postId == this.unreadOverridePostId) {
			this.unreadOverridePostId = null;
		}
    this.queueRead(postId);
    this.scheduleReadSync();
    this.render();
  }

  handleKeydown(event) {
    if (this.shouldIgnoreKey(event)) {
      return;
    }

    switch (event.key) {
      case "1":
        event.preventDefault();
        this.showToday();
        break;
      case "2":
        event.preventDefault();
        this.showRecent();
        break;
      case "3":
        event.preventDefault();
        this.showFading();
        break;
      case "/":
        event.preventDefault();
        this.toggleSearch();
        break;
      case "r":
        event.preventDefault();
        this.syncTimeline();
        break;
			case "b":
				event.preventDefault();
				this.toggleBookmark();
				break;
			case "Enter":
				if (this.isSearchFocused() || !this.activePostId) {
					break;
				}
				event.preventDefault();
				this.openActivePost();
				break;
			case "h":
				event.preventDefault();
				this.toggleHideRead();
				break;
      case "ArrowUp":
        event.preventDefault();
        this.selectAdjacentPost(-1);
        break;
      case "ArrowDown":
        event.preventDefault();
        this.selectAdjacentPost(1);
        break;
      default:
        break;
    }
  }

	handleSearchKeydown(event) {
		if (event.key == "Escape") {
			event.preventDefault();
			this.hideSearch();
			return;
		}

		if (event.key != "Enter") {
			return;
		}

		event.preventDefault();
		this.performSearch();
	}

	performSearch() {
		const search_query = this.searchInputTarget.value.trim();
		this.searchQuery = search_query;
		this.render();
	}

	openActivePost() {
		if (!this.activePostId) {
			return;
		}

		const active_post = this.posts.find((entry) => entry.id === this.activePostId);
		if (!active_post) {
			return;
		}

		const post_url = (active_post.url || "").trim();
		if (!post_url) {
			return;
		}

		window.location.href = post_url;
	}

	async toggleBookmark() {
		if (!this.activePostId) {
			return;
		}

		const post = this.posts.find((entry) => entry.id === this.activePostId);
		if (!post) {
			return;
		}

		if (this.bookmark_toggling.has(post.id)) {
			return;
		}

		const should_bookmark = !post.is_bookmarked;
		this.bookmark_toggling.add(post.id);
		post.is_bookmarked = should_bookmark;
		this.render();
		this.dispatchBookmarkChange(post);

		try {
			if (should_bookmark) {
				await starFeedEntries([post.id]);
			}
			else {
				await unstarFeedEntries([post.id]);
			}
		}
		catch (error) {
			console.warn("Failed to toggle bookmark", error);
			post.is_bookmarked = !should_bookmark;
			this.render();
			this.dispatchBookmarkChange(post);
		}
		finally {
			this.bookmark_toggling.delete(post.id);
		}
	}

	dispatchBookmarkChange(post) {
		if (!post) {
			return;
		}

		window.dispatchEvent(
			new CustomEvent("post:bookmark", {
				detail: {
					postId: post.id,
					is_bookmarked: Boolean(post.is_bookmarked)
				}
			})
		);
	}

	isSearchFocused() {
		const active_element = document.activeElement;
		if (!active_element) {
			return false;
		}

		return this.searchInputTarget === active_element;
	}

	async handleMarkAllRead() {
		if (!this.posts.length) {
			return;
		}

		const ids = this.posts.map((post) => post.id);
		try {
			await markFeedEntriesRead(ids);
			await markAllRead(ids);
			this.pendingReadIds.clear();
			this.readIds = new Set(ids);
			this.posts.forEach((post) => {
				post.is_read = true;
			});
			this.render();
		}
		catch (error) {
			console.warn("Failed to mark all read", error);
		}
	}

	handleToggleBookmark() {
		this.toggleBookmark();
	}

	handleToggleHideRead() {
		const should_ignore = this.shouldIgnoreKey({
			defaultPrevented: false,
			metaKey: false,
			ctrlKey: false,
			altKey: false,
			target: document.activeElement
		});
		if (should_ignore) {
			return;
		}
		this.toggleHideRead();
	}

  handleAuthReady() {
    this.load();
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

  render() {
    if (this.isLoading) {
      return;
    }

    const posts = this.getVisiblePosts();

    if (!posts.length) {
			if (this.subscriptionCount == 0) {
				this.listTarget.innerHTML = this.renderNoSubscriptions();
				return;
			}
      this.listTarget.innerHTML = "<p class=\"canvas-empty\"><!-- No posts. --></p>";
      return;
    }

    const items = posts.map((post) => this.renderPost(post)).join("");
    this.listTarget.innerHTML = items;
  }

	renderNoSubscriptions() {
		return `
			<p class="canvas-empty timeline-empty">
				No subscriptions.<br>
				<button
					type="button"
					class="btn-sm"
					data-action="timeline#openSubscriptions"
				>New Feed...</button>
			</p>
		`;
	}

	openSubscriptions(event) {
		event?.preventDefault();
		window.dispatchEvent(
			new CustomEvent("subscriptions:open", { detail: { mode: "subscribe" } })
		);
	}

  openPost(post) {
    if (!post) {
      return;
    }

    if (!post.is_read) {
      post.is_read = true;
      this.readIds.add(post.id);
      this.persistRead(post.id);
    }
    const selectionChanged = post.id !== this.activePostId;
		if (selectionChanged) {
			this.unreadOverridePostId = null;
		}
    this.activePostId = post.id;
    this.render();
    if (selectionChanged) {
      this.queueRead(post.id);
      this.scheduleReadSync();
    }

    window.dispatchEvent(new CustomEvent("post:open", { detail: { post } }));
    this.scrollActivePostIntoView();
  }

  selectAdjacentPost(offset) {
    if (this.isLoading) {
      return;
    }

    const posts = this.getVisiblePosts();
    if (!posts.length) {
      return;
    }

    let index = posts.findIndex((post) => post.id === this.activePostId);
    if (index === -1) {
      index = offset > 0 ? -1 : posts.length;
    }

    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= posts.length) {
      return;
    }

    this.openPost(posts[nextIndex]);
  }

  scrollActivePostIntoView() {
    if (!this.activePostId) {
      return;
    }

    const activeItem = this.listTarget.querySelector(
      `[data-post-id="${this.activePostId}"]`
    );
    if (!activeItem) {
      return;
    }

    activeItem.scrollIntoView({ block: "nearest" });
  }

	getVisiblePosts() {
		let visible_posts = this.getBasePosts();

		if (!this.searchActive && this.hideRead) {
			if (!this.hideReadSnapshotActive) {
				visible_posts = visible_posts.filter(
					(post) => !post.is_read || post.id === this.activePostId
				);
			}
			else {
				visible_posts = visible_posts.filter(
					(post) => !this.hideReadSnapshotIds.has(post.id) || post.id === this.activePostId
				);
			}
		}

		return visible_posts;
  }

	getBasePosts() {
		if (this.searchActive) {
			return this.getSearchResults();
		}

		const segment_buckets = SEGMENT_BUCKETS[this.activeSegment] || [];
		return this.posts.filter((post) => segment_buckets.includes(post.age_bucket));
	}

	getSearchResults() {
		const search_query = this.searchQuery.trim().toLowerCase();
		let matching_posts = this.posts;

		if (search_query) {
			matching_posts = this.posts.filter((post) => this.postMatchesSearch(post, search_query));
		}

		return [...matching_posts].sort(
			(a, b) => new Date(b.published_at) - new Date(a.published_at)
		);
	}


	postMatchesSearch(post, search_query) {
		const search_fields = [
			post.title,
			post.summary,
			post.source,
			post.url
		];

		return search_fields.some((field) => {
			if (!field) {
				return false;
			}

			return field.toLowerCase().includes(search_query);
		});
	}

  renderPost(post) {
    const title = post.title ? post.title.trim() : "";
    const safe_title = this.escapeHtml(title);
    const hasTitle = Boolean(safe_title);
    const summary_text = post.summary ? post.summary.trim() : "";
    const safe_summary = this.escapeHtml(summary_text);
    const summary_snippet = safe_summary ? this.truncateSummary(safe_summary) : "";
    const summaryMarkup = safe_summary
      ? `<div class="timeline-summary">${summary_snippet}</div>`
      : "";
    const safe_source = this.escapeHtml(post.source || "");
    const show_time_only = this.isToday(post.published_at);
    const formattedDate = show_time_only
      ? this.formatTime(post.published_at)
      : this.formatDate(post.published_at);
    const status = post.is_archived ? "<span class=\"status-chip\">Archived</span>" : "";
		const bookmark_status = post.is_bookmarked
			? "<span class=\"timeline-bookmark\"><span class=\"timeline-bookmark-icon\" aria-hidden=\"true\">&#9733;</span>Bookmarked</span>"
			: "";
		const date_markup = `
			<span class="timeline-date-row">
				<span class="timeline-date">${formattedDate}</span>
				${bookmark_status}
			</span>
		`;
		const is_active = post.id == this.activePostId && post.id != this.unreadOverridePostId;
		const show_read_state = post.is_read && !is_active;
		const classes = [
			"timeline-item",
			show_read_state ? "is-read" : "",
			post.is_archived ? "is-archived" : "",
			is_active ? "is-active" : ""
		]
      .filter(Boolean)
      .join(" ");

    const color = timelineCellColors[post.age_bucket] || "var(--ink-row-default)";
    const borderColor = timelineBorderColors[post.age_bucket] || "var(--ink-row-border)";
		const selected_background = timelineSelectedColors.background;
		const selected_text = timelineSelectedColors.text;
		const selected_border = timelineSelectedColors.border;
    const titleMarkup = hasTitle
      ? `<div class="timeline-title">${safe_title}</div>`
      : `<div class="timeline-title timeline-title--source">${safe_source}</div>`;
    const metaClass = hasTitle ? "timeline-meta" : "timeline-meta timeline-meta--compact";
    const metaContent = hasTitle
      ? `
        <span>${safe_source}</span>
        ${status}
        ${date_markup}
      `
      : `
        ${status}
        ${date_markup}
      `;

    return `
      <button type="button" class="${classes}" data-post-id="${post.id}" data-age="${post.age_bucket}" style="--row-color: ${color}; --row-border: ${borderColor}; --row-selected-color: ${selected_background}; --row-selected-text: ${selected_text}; --row-selected-border: ${selected_border};">
        <img class="avatar" src="${post.avatar_url}" alt="${safe_source}">
        <div>
          ${titleMarkup}
          ${summaryMarkup}
          <div class="${metaClass}">
            ${metaContent}
          </div>
        </div>
      </button>
    `;
  }

  formatDate(isoDate) {
    const date = new Date(isoDate);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

	formatTime(isoDate) {
		const date = new Date(isoDate);
		return new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			minute: "2-digit"
		}).format(date);
	}

	isToday(isoDate) {
		const date = new Date(isoDate);
		const today = new Date();
		return (
			(date.getFullYear() == today.getFullYear()) &&
			(date.getMonth() == today.getMonth()) &&
			(date.getDate() == today.getDate())
		);
	}

  truncateSummary(summary) {
    if (summary.length <= SUMMARY_TRUNCATE_LENGTH) {
      return summary;
    }

    return `${summary.slice(0, SUMMARY_TRUNCATE_LENGTH).trimEnd()}...`;
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

	loadHideReadSetting() {
		const stored_hide_read = localStorage.getItem(HIDE_READ_KEY);
		return stored_hide_read === "true";
	}

	persistHideReadSetting() {
		const stored_hide_read = this.hideRead ? "true" : "false";
		localStorage.setItem(HIDE_READ_KEY, stored_hide_read);
	}

	toggleHideRead() {
		this.hideRead = !this.hideRead;
		this.persistHideReadSetting();
		if (this.hideRead) {
			this.clearActiveReadSelection();
			this.captureHideReadSnapshot();
			this.hideReadSnapshotActive = true;
		}
		else {
			this.hideReadSnapshotIds.clear();
			this.hideReadSnapshotActive = false;
		}
		this.render();
	}

	clearActiveReadSelection() {
		if (!this.activePostId) {
			return;
		}

		const active_post = this.posts.find((post) => post.id == this.activePostId);
		if (!active_post || !active_post.is_read) {
			return;
		}

		this.activePostId = null;
		this.unreadOverridePostId = null;
		window.dispatchEvent(new CustomEvent("reader:clear"));
	}

	captureHideReadSnapshot() {
		if (this.searchActive) {
			return;
		}

		const visible_posts = this.posts;
		this.hideReadSnapshotIds = new Set(
			visible_posts.filter((post) => post.is_read).map((post) => post.id)
		);
	}

  async persistRead(postId) {
    try {
      await markRead(postId);
    }
    catch (error) {
      console.warn("Failed to persist read state", error);
    }
  }

  queueRead(postId) {
    if (!postId) {
      return;
    }

    this.pendingReadIds.add(String(postId));
  }

  scheduleReadSync() {
    this.clearReadSyncTimer();
    this.readSyncTimer = window.setTimeout(() => {
      this.readSyncTimer = null;
      this.flushReadQueue();
    }, 3000);
  }

  clearReadSyncTimer() {
    if (!this.readSyncTimer) {
      return;
    }

    window.clearTimeout(this.readSyncTimer);
    this.readSyncTimer = null;
  }

  async flushReadQueue() {
    if (this.pendingReadIds.size === 0) {
      return;
    }

    const ids = Array.from(this.pendingReadIds);
    this.pendingReadIds.clear();

    try {
      await markFeedEntriesRead(ids);
    }
    catch (error) {
      console.warn("Failed to sync read entries", error);
      ids.forEach((id) => this.pendingReadIds.add(id));
    }
  }
}
