import { Controller } from "../stimulus.js";
import { timelineBorderColors, timelineCellColors, timelineSelectedColors } from "../colors.js";
import { DEFAULT_AVATAR_URL, fetchTimelineData } from "../api/posts.js";
import {
	fetchFeedIcons,
	fetchFeedStarredEntryIds,
	getMicroBlogIsUsingAI,
	markFeedEntriesRead,
	summarizeFeedEntries,
	starFeedEntries,
	unstarFeedEntries
} from "../api/feeds.js";
import { loadReadIds, markAllRead, markRead } from "../storage/reads.js";
import { parse_hash, push_state, replace_state, ROUTE_CHANGE } from "../router.js";

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
		this.activeFeedId = null;
		this.activeFeedLabel = "";
		this.subscriptions = [];
		this.applying_route = false;
		this.posts = [];
		this.isLoading = true;
		this.isSyncing = false;
		this.timeline_load_token = 0;
		this.subscriptionCount = null;
		this.pending_sync = false;
		this.summary_is_loading = false;
		this.summary_request_token = 0;
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
		this.handleAvatarError = this.handleAvatarError.bind(this);
		this.handleKeydown = this.handleKeydown.bind(this);
		this.handleSearchKeydown = this.handleSearchKeydown.bind(this);
		this.handleSearchInput = this.handleSearchInput.bind(this);
		this.search_input_debounce_timer = null;
		this.handleMarkAllRead = this.handleMarkAllRead.bind(this);
		this.handleToggleBookmark = this.handleToggleBookmark.bind(this);
		this.handleToggleHideRead = this.handleToggleHideRead.bind(this);
		this.handleAuthReady = this.handleAuthReady.bind(this);
		this.handleAuthVerify = this.handleAuthVerify.bind(this);
		this.handleTimelineSync = this.handleTimelineSync.bind(this);
		this.handleFilterByFeed = this.handleFilterByFeed.bind(this);
		this.handleUrlChange = this.handleUrlChange.bind(this);
		this.listTarget.addEventListener("click", this.handleClick);
		this.listTarget.addEventListener("error", this.handleAvatarError, true);
		this.searchInputTarget.addEventListener("keydown", this.handleSearchKeydown);
		this.searchInputTarget.addEventListener("input", this.handleSearchInput);
		window.addEventListener("post:unread", this.handleUnread);
		window.addEventListener("post:read", this.handleRead);
		window.addEventListener("keydown", this.handleKeydown);
		window.addEventListener("timeline:markAllRead", this.handleMarkAllRead);
		window.addEventListener("timeline:toggleBookmark", this.handleToggleBookmark);
		window.addEventListener("timeline:toggleHideRead", this.handleToggleHideRead);
		window.addEventListener("auth:ready", this.handleAuthReady);
		window.addEventListener("auth:verify", this.handleAuthVerify);
		window.addEventListener("timeline:sync", this.handleTimelineSync);
		window.addEventListener("timeline:filterByFeed", this.handleFilterByFeed);
		window.addEventListener(ROUTE_CHANGE, this.handleUrlChange);
		this.listTarget.classList.add("is-loading");
		this.load();
		this.startRefreshTimer();
	}

	disconnect() {
		this.listTarget.removeEventListener("click", this.handleClick);
		this.listTarget.removeEventListener("error", this.handleAvatarError, true);
		this.searchInputTarget.removeEventListener("keydown", this.handleSearchKeydown);
		this.searchInputTarget.removeEventListener("input", this.handleSearchInput);
		this.clearSearchInputDebounce();
		window.removeEventListener("post:unread", this.handleUnread);
		window.removeEventListener("post:read", this.handleRead);
		window.removeEventListener("keydown", this.handleKeydown);
		window.removeEventListener("timeline:markAllRead", this.handleMarkAllRead);
		window.removeEventListener("timeline:toggleBookmark", this.handleToggleBookmark);
		window.removeEventListener("timeline:toggleHideRead", this.handleToggleHideRead);
		window.removeEventListener("auth:ready", this.handleAuthReady);
		window.removeEventListener("auth:verify", this.handleAuthVerify);
		window.removeEventListener("timeline:sync", this.handleTimelineSync);
		window.removeEventListener("timeline:filterByFeed", this.handleFilterByFeed);
		window.removeEventListener(ROUTE_CHANGE, this.handleUrlChange);
		this.clearReadSyncTimer();
		this.stopRefreshTimer();
	}

  async load() {
    if (this.isSyncing) {
      return;
    }

		const initial_route = parse_hash();
		if (this.isLoading && (initial_route.postId || initial_route.feedId || initial_route.feedUrl)) {
			window.dispatchEvent(new CustomEvent("reader:resolvingRoute"));
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
			this.subscriptions = Array.isArray(timeline_data.subscriptions) ? timeline_data.subscriptions : [];
      this.posts.forEach((post) => {
        if (this.readIds.has(post.id)) {
          post.is_read = true;
        }
      });

			this.scheduleTimelineExtras(load_token);
    }
    catch (error) {
      console.warn("Failed to load timeline", error);
      const state = parse_hash();
      if (state.postId || state.feedId || state.feedUrl) {
        replace_state({});
      }
    }
    finally {
      this.apply_route_from_url(parse_hash(), this.isLoading);
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

	handleFilterByFeed(event) {
		const feed_id = event.detail?.feedId;
		if (feed_id == null || feed_id == "") {
			return;
		}

		const feed_source = event.detail?.source || "";
		this.setFeedFilter(feed_id, feed_source);
		this.render();
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
			return;
		}

		const postId = item.dataset.postId;
		const post = this.posts.find((entry) => entry.id === postId);
		if (!post) {
			return;
		}

		const clicked_avatar = event.target.closest(".avatar");
		if (clicked_avatar && item.contains(clicked_avatar)) {
			this.setFeedFilter(post.feed_id, post.source || "", true);
		}

		this.openPost(post);
  }

	clearActivePost(skip_url_update) {
		if (!this.activePostId) {
			if (!skip_url_update) {
				push_state({ feedId: this.activeFeedId || null, postId: null });
			}
			return;
		}

		this.activePostId = null;
		this.unreadOverridePostId = null;
		this.render();
		window.dispatchEvent(new CustomEvent("reader:clear"));
		if (!skip_url_update) {
			push_state({ feedId: this.activeFeedId || null, postId: null });
		}
	}

	resolve_feed_url_to_id(feed_url) {
		if (!feed_url || !this.subscriptions.length) {
			return null;
		}
		let normalized_input = "";
		try {
			normalized_input = new URL(feed_url).href;
		}
		catch (e) {
			try {
				normalized_input = new URL(`https://${feed_url}`).href;
			}
			catch (e2) {
				return null;
			}
		}
		const sub = this.subscriptions.find((s) => {
			const raw = s.feed_url || s.site_url || "";
			if (!raw) return false;
			try {
				return new URL(raw).href == normalized_input;
			}
			catch (e) {
				try {
					return new URL(`https://${raw}`).href == normalized_input;
				}
				catch (e2) {
					return false;
				}
			}
		});
		return sub && sub.feed_id != null ? String(sub.feed_id) : null;
	}

	apply_route_from_url(state, should_update_reader = true) {
		if (!state) {
			state = parse_hash();
		}
		this.applying_route = true;
		if (state.feedId != null && state.feedId != "") {
			this.activeFeedId = state.feedId;
			this.activeFeedLabel = this.getFeedLabel(this.activeFeedId);
		}
		else if (state.feedUrl != null && state.feedUrl != "") {
			const resolved = this.resolve_feed_url_to_id(state.feedUrl);
			this.activeFeedId = resolved;
			this.activeFeedLabel = resolved ? this.getFeedLabel(resolved) : "";
		}
		else {
			this.activeFeedId = null;
			this.activeFeedLabel = "";
		}
		const has_feed = this.activeFeedId != null && this.activeFeedId != "" &&
			(this.posts.some((p) => (p.feed_id || "") == this.activeFeedId) ||
				this.subscriptions.some((s) => String(s.feed_id || "") == this.activeFeedId));
		if (this.activeFeedId && !has_feed) {
			this.activeFeedId = null;
			this.activeFeedLabel = "";
		}
		if (!should_update_reader) {
			this.applying_route = false;
			this.render();
			return;
		}
		if (state.postId != null && state.postId != "") {
			const post = this.posts.find((p) => p.id == state.postId);
			if (post) {
				this.openPost(post, true);
			}
			else {
				replace_state({});
				this.activeFeedId = null;
				this.clearActivePost(true);
				window.dispatchEvent(new CustomEvent("reader:welcome"));
			}
		}
		else {
			this.clearActivePost(true);
			window.dispatchEvent(new CustomEvent("reader:welcome"));
		}
		this.applying_route = false;
		this.render();
	}

	handleUrlChange(event) {
		const state = event.detail || parse_hash();
		this.apply_route_from_url(state);
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

	handleAvatarError(event) {
		const image_el = event.target;
		if (!image_el || image_el.tagName != "IMG") {
			return;
		}

		if (!image_el.classList.contains("avatar")) {
			return;
		}

		const current_src = image_el.getAttribute("src") || "";
		if (current_src == DEFAULT_AVATAR_URL) {
			return;
		}

		image_el.src = DEFAULT_AVATAR_URL;

		const post_el = image_el.closest("[data-post-id]");
		if (!post_el) {
			return;
		}

		const post_id = post_el.dataset.postId;
		if (!post_id) {
			return;
		}

		const post = this.posts.find((entry) => entry.id == post_id);
		if (post && post.avatar_url != DEFAULT_AVATAR_URL) {
			post.avatar_url = DEFAULT_AVATAR_URL;
		}
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

		if (event.key == "Enter") {
			event.preventDefault();
			this.performSearch();
			this.selectFirstSearchResult();
			this.focusTimeline();
		}
	}

	handleSearchInput() {
		this.clearSearchInputDebounce();
		this.search_input_debounce_timer = setTimeout(() => {
			this.search_input_debounce_timer = null;
			this.performSearch();
		}, 100);
	}

	clearSearchInputDebounce() {
		if (this.search_input_debounce_timer != null) {
			clearTimeout(this.search_input_debounce_timer);
			this.search_input_debounce_timer = null;
		}
	}

	performSearch() {
		const search_query = this.searchInputTarget.value.trim();
		this.searchQuery = search_query;
		this.render();
	}

	focusTimeline() {
		if (!this.listTarget) {
			return;
		}
		if (!this.listTarget.hasAttribute("tabindex")) {
			this.listTarget.setAttribute("tabindex", "-1");
		}
		this.listTarget.focus();
	}

	selectFirstSearchResult() {
		const results = this.getSearchResults();
		if (!results.length) {
			return;
		}

		const first_post = results[0];
		if (first_post.id == this.activePostId) {
			return;
		}

		this.openPost(first_post);
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

		const new_window = window.open(post_url, "_blank", "noopener,noreferrer");
		if (new_window) {
			new_window.opener = null;
		}
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

	handleAuthVerify() {
		this.render();
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
		const feed_filter_markup = this.activeFeedId ? this.renderFeedFilter() : "";
		const is_using_ai = getMicroBlogIsUsingAI();
		const should_render_summary = this.activeSegment == "fading" && !this.searchActive && !this.activeFeedId && is_using_ai && posts.length > 0;
		const summary_count = posts.length;
		const summary_label = summary_count == 1 ? "post" : "posts";

		if (!posts.length) {
			if (this.activeFeedId) {
				this.listTarget.innerHTML = `${feed_filter_markup}<p class="canvas-empty timeline-empty">No posts in this feed.<br><button type="button" class="btn-sm" data-action="timeline#clearFeedFilter">Clear Filter</button></p>`;
				return;
			}
			if (this.subscriptionCount == 0) {
				this.listTarget.innerHTML = this.renderNoSubscriptions();
				return;
			}
			if (should_render_summary) {
				this.listTarget.innerHTML = `${feed_filter_markup}${this.renderSummaryItem(false, summary_count, summary_label)}<p class="canvas-empty"><!-- No posts. --></p>`;
				return;
			}
			this.listTarget.innerHTML = `${feed_filter_markup}<p class="canvas-empty"><!-- No posts. --></p>`;
			return;
		}

		const items = posts.map((post) => this.renderPost(post)).join("");
		const list_markup = should_render_summary ? `${this.renderSummaryItem(true, summary_count, summary_label)}${items}` : items;
		this.listTarget.innerHTML = `${feed_filter_markup}${list_markup}`;
	}

	renderFeedFilter() {
		const feed_label = this.escapeHtml(this.activeFeedLabel || `Feed ${this.activeFeedId}`);
		return `
			<div class="timeline-feed-filter">
				<span class="timeline-feed-filter-label">Showing all posts from ${feed_label}</span>
				<button type="button" class="btn-sm" data-action="timeline#clearFeedFilter">Clear</button>
			</div>
		`;
	}

	clearFeedFilter(event) {
		event?.preventDefault();
		if (!this.activeFeedId) {
			return;
		}
		this.activeFeedId = null;
		this.activeFeedLabel = "";
		if (this.activePostId) {
			push_state({ postId: this.activePostId });
		}
		else {
			push_state({});
		}
		this.render();
	}

	setFeedFilter(feed_id, feed_label, skip_url_update) {
		if (feed_id == null || feed_id == "") {
			return;
		}

		const next_feed_id = String(feed_id);
		const active_post = this.activePostId
			? this.posts.find((post) => post.id == this.activePostId)
			: null;
		const active_post_matches_feed = active_post && String(active_post.feed_id || "") == next_feed_id;

		this.activeFeedId = next_feed_id;
		this.activeFeedLabel = (feed_label || "").trim() || this.getFeedLabel(this.activeFeedId);

		if (!active_post_matches_feed && this.activePostId) {
			this.activePostId = null;
			this.unreadOverridePostId = null;
			window.dispatchEvent(new CustomEvent("reader:clear"));
		}

		if (!skip_url_update) {
			push_state({
				feedId: this.activeFeedId,
				postId: active_post_matches_feed ? this.activePostId : null
			});
		}
	}

	getFeedLabel(feed_id) {
		if (!feed_id) {
			return "";
		}
		const subscription = this.subscriptions.find((entry) => String(entry.feed_id || "") == String(feed_id));
		if (!subscription) {
			return "";
		}
		return (subscription.title || subscription.site_url || subscription.feed_url || "").trim();
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

	renderSummaryItem(has_posts, summary_count, summary_label) {
		const is_disabled = !has_posts || this.summary_is_loading;
		const spinner_hidden = this.summary_is_loading ? "" : "hidden";
		const disabled_attribute = is_disabled ? "disabled" : "";
		return `
			<div class="timeline-summary-item">
				<button
					type="button"
					class="btn-sm"
					data-action="timeline#summarizeFading"
					${disabled_attribute}
				>Reading Recap</button>
				<span class="timeline-summary-detail">${summary_count} older ${summary_label}, grouped</span>
				<img class="timeline-summary-spinner" src="/images/progress_spinner.svg" alt="" aria-hidden="true" ${spinner_hidden}>
			</div>
		`;
	}

	openSubscriptions(event) {
		event?.preventDefault();
		window.dispatchEvent(
			new CustomEvent("subscriptions:open", { detail: { mode: "subscribe" } })
		);
	}

	async summarizeFading(event) {
		event?.preventDefault();
		event?.stopPropagation();

		if (this.activeSegment != "fading" || this.searchActive) {
			return;
		}

		if (this.summary_is_loading) {
			return;
		}

		const summary_posts = this.getVisiblePosts();
		if (!summary_posts.length) {
			return;
		}

		const entry_ids = summary_posts.map((post) => post.id);
		const request_token = this.summary_request_token + 1;
		this.summary_request_token = request_token;
		this.summary_is_loading = true;

		this.render();

		try {
			const summary_html = await summarizeFeedEntries(entry_ids);
			if (this.summary_request_token != request_token) {
				return;
			}

			if (summary_html) {
				window.dispatchEvent(
					new CustomEvent("reader:summary", {
						detail: { html: summary_html }
					})
				);
			}
		}
		catch (error) {
			console.warn("Failed to summarize posts", error);
		}
		finally {
			if (this.summary_request_token == request_token) {
				this.summary_is_loading = false;
				this.render();
			}
		}
	}

  openPost(post, skip_url_update) {
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
		if (!skip_url_update) {
			push_state({ feedId: this.activeFeedId || null, postId: post.id });
		}
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

		if (this.activeFeedId) {
			return this.getFeedFilteredPosts();
		}

		const segment_buckets = SEGMENT_BUCKETS[this.activeSegment] || [];
		return this.posts.filter((post) => segment_buckets.includes(post.age_bucket));
	}

	getSearchResults() {
		const search_query = this.searchQuery.trim().toLowerCase();
		let matching_posts = this.getFeedFilteredPosts();

		if (search_query) {
			matching_posts = matching_posts.filter((post) => this.postMatchesSearch(post, search_query));
		}

		return [...matching_posts].sort(
			(a, b) => new Date(b.published_at) - new Date(a.published_at)
		);
	}

	getFeedFilteredPosts() {
		if (!this.activeFeedId) {
			return this.posts;
		}

		return this.posts.filter((post) => {
			if (post.feed_id == null || post.feed_id == "") {
				return false;
			}
			return String(post.feed_id) == this.activeFeedId;
		});
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

		const feed_id = post.feed_id == null ? "" : String(post.feed_id);
		const safe_feed_id = this.escapeHtml(feed_id);
		const avatar_class = feed_id ? "avatar avatar--feed-filter" : "avatar";
		const avatar_title = feed_id ? " title=\"Show posts from this feed\"" : "";
		return `
			<button type="button" class="${classes}" data-post-id="${post.id}" data-feed-id="${safe_feed_id}" data-age="${post.age_bucket}" style="--row-color: ${color}; --row-border: ${borderColor}; --row-selected-color: ${selected_background}; --row-selected-text: ${selected_text}; --row-selected-border: ${selected_border};">
				<img class="${avatar_class}" src="${post.avatar_url}" alt="${safe_source}"${avatar_title}>
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
		window.dispatchEvent(new CustomEvent("reader:welcome"));
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
