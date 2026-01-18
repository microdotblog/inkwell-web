import { Controller } from "../stimulus.js";
import { timelineColors } from "../mock_data.js";
import { fetchTimeline } from "../api/posts.js";
import { loadReadIds, markRead } from "../storage/reads.js";

const SEGMENT_BUCKETS = {
  latest: ["newest", "fresh"],
  recent: ["recent"],
  fading: ["fading", "old", "stale"]
};

export default class extends Controller {
  static targets = ["list", "segments"];

  connect() {
    this.activeSegment = "latest";
    this.activePostId = null;
    this.posts = [];
    this.readIds = new Set();
    this.handleClick = this.handleClick.bind(this);
    this.listTarget.addEventListener("click", this.handleClick);
    this.load();
  }

  disconnect() {
    this.listTarget.removeEventListener("click", this.handleClick);
  }

  async load() {
    const [posts, readIds] = await Promise.all([fetchTimeline(), loadReadIds()]);
    this.readIds = new Set(readIds);
    this.posts = posts;
    this.posts.forEach((post) => {
      if (this.readIds.has(post.id)) {
        post.is_read = true;
      }
    });
    this.render();
  }

  showLatest() {
    this.activateSegment("latest");
  }

  showRecent() {
    this.activateSegment("recent");
  }

  showFading() {
    this.activateSegment("fading");
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

  handleClick(event) {
    const item = event.target.closest("[data-post-id]");
    if (!item) {
      return;
    }

    const postId = item.dataset.postId;
    const post = this.posts.find((entry) => entry.id === postId);
    if (!post) {
      return;
    }

    if (!post.is_read) {
      post.is_read = true;
      this.readIds.add(postId);
      this.persistRead(postId);
    }
    this.activePostId = postId;
    this.render();

    window.dispatchEvent(new CustomEvent("post:open", { detail: { post } }));
  }

  render() {
    const buckets = SEGMENT_BUCKETS[this.activeSegment] || [];
    const posts = this.posts.filter((post) => buckets.includes(post.age_bucket));

    if (!posts.length) {
      this.listTarget.innerHTML = "<p class=\"canvas-empty\">No posts yet.</p>";
      return;
    }

    const items = posts.map((post) => this.renderPost(post)).join("");
    this.listTarget.innerHTML = items;
  }

  renderPost(post) {
    const title = post.title || post.summary || "Untitled";
    const summary = post.summary ? `<span>${post.summary}</span>` : "";
    const formattedDate = this.formatDate(post.published_at);
    const status = post.is_archived ? "<span class=\"status-chip\">Archived</span>" : "";
    const classes = [
      "timeline-item",
      post.is_read ? "is-read" : "",
      post.is_archived ? "is-archived" : "",
      post.id === this.activePostId ? "is-active" : ""
    ]
      .filter(Boolean)
      .join(" ");

    const color = timelineColors[post.age_bucket] || "#fff";

    return `
      <button type="button" class="${classes}" data-post-id="${post.id}" data-age="${post.age_bucket}" style="--row-color: ${color}">
        <img class="avatar" src="${post.avatar_url}" alt="${post.source}">
        <div>
          <div class="timeline-title">${title}</div>
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
