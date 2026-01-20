const MICRO_BLOG_BASE_URL = "http://localhost:3000";
const MICRO_BLOG_TOKEN_KEY = "inkwell_microblog_token";

const entryCache = new Map();

export function getFeedsBaseUrl() {
  return MICRO_BLOG_BASE_URL;
}

export function getMicroBlogToken() {
  const stored = localStorage.getItem(MICRO_BLOG_TOKEN_KEY);
  if (stored && stored.trim()) {
    return stored.trim();
  }

  return "";
}

export function setMicroBlogToken(token) {
  const trimmed = (token || "").trim();
  if (!trimmed) {
    localStorage.removeItem(MICRO_BLOG_TOKEN_KEY);
    return "";
  }

  localStorage.setItem(MICRO_BLOG_TOKEN_KEY, trimmed);
  return trimmed;
}

export function cacheFeedEntries(entries) {
  entryCache.clear();
  entries.forEach((entry) => {
    entryCache.set(String(entry.id), entry);
  });
}

export function getFeedEntry(entryId) {
  if (!entryId) {
    return null;
  }
  return entryCache.get(String(entryId)) || null;
}

export async function fetchFeedSubscriptions() {
  return fetchFeedsJson("/feeds/subscriptions.json?mode=extended");
}

export async function fetchFeedEntries() {
  return fetchFeedsJson("/feeds/entries.json?per_page=100");
}

export async function fetchFeedUnreadEntryIds() {
  return fetchFeedsJson("/feeds/unread_entries.json");
}

export async function fetchFeedIcons() {
  return fetchFeedsJson("/feeds/icons.json");
}

async function fetchFeedsJson(path, options = {}) {
  const url = new URL(path, `${getFeedsBaseUrl()}/`);
  const headers = new Headers(options.headers || {});
  const token = getMicroBlogToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  headers.set("Accept", "application/json");

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      throw new Error(`Feeds request failed: ${response.status}`);
    }
    return response.json();
  }
  catch (error) {
    console.warn("Feeds request failed", error);
    throw error;
  }
}
