import { Controller } from "../stimulus.js";
import { timelineBorderColors, timelineColors } from "../mock_data.js";
import { fetchTimeline } from "../api/posts.js";
import { markFeedEntriesRead } from "../api/feeds.js";
import { loadReadIds, markAllRead, markRead } from "../storage/reads.js";

const SEGMENT_BUCKETS = {
  today: ["day-1"],
  recent: ["day-2", "day-3"],
  fading: ["day-4", "day-5", "day-6", "day-7"]
};

export default class extends Controller {
  static targets = ["list", "segments", "search", "searchToggle", "searchInput"];

  connect() {
    this.activeSegment = "today";
    this.activePostId = null;
    this.posts = [];
    this.isLoading = true;
    this.isSyncing = false;
    this.searchActive = false;
    this.readIds = new Set();
    this.pendingReadIds = new Set();
    this.readSyncTimer = null;
    this.handleClick = this.handleClick.bind(this);
    this.handleUnread = this.handleUnread.bind(this);
    this.handleRead = this.handleRead.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleMarkAllRead = this.handleMarkAllRead.bind(this);
    this.handleAuthReady = this.handleAuthReady.bind(this);
    this.listTarget.addEventListener("click", this.handleClick);
    window.addEventListener("post:unread", this.handleUnread);
    window.addEventListener("post:read", this.handleRead);
    window.addEventListener("keydown", this.handleKeydown);
    window.addEventListener("timeline:markAllRead", this.handleMarkAllRead);
    window.addEventListener("auth:ready", this.handleAuthReady);
    this.listTarget.classList.add("is-loading");
    this.load();
  }

  disconnect() {
    this.listTarget.removeEventListener("click", this.handleClick);
    window.removeEventListener("post:unread", this.handleUnread);
    window.removeEventListener("post:read", this.handleRead);
    window.removeEventListener("keydown", this.handleKeydown);
    window.removeEventListener("timeline:markAllRead", this.handleMarkAllRead);
    window.removeEventListener("auth:ready", this.handleAuthReady);
    this.clearReadSyncTimer();
  }

  async load() {
    if (this.isSyncing) {
      return;
    }

    this.setSyncing(true);
    try {
      const [posts, readIds] = await Promise.all([fetchTimeline(), loadReadIds()]);
      this.readIds = new Set(readIds);
      this.posts = posts;
      this.posts.forEach((post) => {
        if (this.readIds.has(post.id)) {
          post.is_read = true;
        }
      });
    }
    catch (error) {
      console.warn("Failed to load timeline", error);
    }
    finally {
      this.isLoading = false;
      this.listTarget.classList.remove("is-loading");
      this.render();
      this.setSyncing(false);
    }
  }

  syncTimeline() {
    this.load();
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
      return;
    }

    const postId = item.dataset.postId;
    const post = this.posts.find((entry) => entry.id === postId);
    this.openPost(post);
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

  async handleMarkAllRead() {
    if (!this.posts.length) {
      return;
    }

    const ids = this.posts.map((post) => post.id);
    try {
      await markAllRead(ids);
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
      this.listTarget.innerHTML = "<p class=\"canvas-empty\"><!-- No posts. --></p>";
      return;
    }

    const items = posts.map((post) => this.renderPost(post)).join("");
    this.listTarget.innerHTML = items;
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
    if (this.searchActive) {
      return [...this.posts].sort(
        (a, b) => new Date(b.published_at) - new Date(a.published_at)
      );
    }

    const buckets = SEGMENT_BUCKETS[this.activeSegment] || [];
    return this.posts.filter((post) => buckets.includes(post.age_bucket));
  }

  renderPost(post) {
    const title = post.title ? post.title.trim() : "";
    const hasTitle = Boolean(title);
    const summaryText = post.summary ? post.summary.trim() : "";
    const summarySnippet = summaryText ? this.truncateSummary(summaryText) : "";
    const summaryMarkup = summaryText
      ? `<div class="timeline-summary">${summarySnippet}</div>`
      : "";
    const formattedDate = this.formatDate(post.published_at);
    const status = post.is_archived ? "<span class=\"status-chip\">Archived</span>" : "";
    const showReadState = post.is_read && post.id !== this.activePostId;
    const classes = [
      "timeline-item",
      showReadState ? "is-read" : "",
      post.is_archived ? "is-archived" : "",
      post.id === this.activePostId ? "is-active" : ""
    ]
      .filter(Boolean)
      .join(" ");

    const color = timelineColors[post.age_bucket] || "#fff";
    const borderColor = timelineBorderColors[post.age_bucket] || "rgba(47, 79, 63, 0.4)";
    const titleMarkup = hasTitle
      ? `<div class="timeline-title">${title}</div>`
      : `<div class="timeline-title timeline-title--source">${post.source}</div>`;
    const metaClass = hasTitle ? "timeline-meta" : "timeline-meta timeline-meta--compact";
    const metaContent = hasTitle
      ? `
        <span>${post.source}</span>
        ${status}
        <span class="timeline-date">${formattedDate}</span>
      `
      : `
        ${status}
        <span class="timeline-date">${formattedDate}</span>
      `;

    return `
      <button type="button" class="${classes}" data-post-id="${post.id}" data-age="${post.age_bucket}" style="--row-color: ${color}; --row-border: ${borderColor};">
        <img class="avatar" src="${post.avatar_url}" alt="${post.source}">
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

  truncateSummary(summary) {
    const maxLength = 100;
    if (summary.length <= maxLength) {
      return summary;
    }

    return `${summary.slice(0, maxLength).trimEnd()}...`;
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
