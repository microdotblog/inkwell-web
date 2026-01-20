import { Controller } from "../stimulus.js";
import { timelineBorderColors, timelineColors } from "../mock_data.js";
import { fetchTimeline } from "../api/posts.js";
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
    this.searchActive = false;
    this.readIds = new Set();
    this.handleClick = this.handleClick.bind(this);
    this.handleUnread = this.handleUnread.bind(this);
    this.handleRead = this.handleRead.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleMarkAllRead = this.handleMarkAllRead.bind(this);
    this.listTarget.addEventListener("click", this.handleClick);
    window.addEventListener("post:unread", this.handleUnread);
    window.addEventListener("post:read", this.handleRead);
    window.addEventListener("keydown", this.handleKeydown);
    window.addEventListener("timeline:markAllRead", this.handleMarkAllRead);
    this.listTarget.classList.add("is-loading");
    this.load();
  }

  disconnect() {
    this.listTarget.removeEventListener("click", this.handleClick);
    window.removeEventListener("post:unread", this.handleUnread);
    window.removeEventListener("post:read", this.handleRead);
    window.removeEventListener("keydown", this.handleKeydown);
    window.removeEventListener("timeline:markAllRead", this.handleMarkAllRead);
  }

  async load() {
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
      this.listTarget.innerHTML = "<p class=\"canvas-empty\">No posts yet.</p>";
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
    this.activePostId = post.id;
    this.render();

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
    const summary = post.summary ? `<span>${post.summary}</span>` : "";
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
    const titleMarkup = title ? `<div class="timeline-title">${title}</div>` : "";

    return `
      <button type="button" class="${classes}" data-post-id="${post.id}" data-age="${post.age_bucket}" style="--row-color: ${color}; --row-border: ${borderColor};">
        <img class="avatar" src="${post.avatar_url}" alt="${post.source}">
        <div>
          ${titleMarkup}
          <div class="timeline-meta">
            <span>${post.source}</span>
            <span>${formattedDate}</span>
            ${summary}
            ${status}
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

  async persistRead(postId) {
    try {
      await markRead(postId);
    }
    catch (error) {
      console.warn("Failed to persist read state", error);
    }
  }
}
