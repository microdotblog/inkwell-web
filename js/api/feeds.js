const MICRO_BLOG_BASE_URL = "http://localhost:3000";
const MICRO_BLOG_TOKEN_KEY = "inkwell_microblog_token";
const MICRO_BLOG_AVATAR_KEY = "inkwell_microblog_avatar";

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

export function getMicroBlogAvatar() {
  const stored = localStorage.getItem(MICRO_BLOG_AVATAR_KEY);
  if (stored && stored.trim()) {
    return stored.trim();
  }

  return "";
}

export function setMicroBlogAvatar(avatarUrl) {
  const trimmed = (avatarUrl || "").trim();
  if (!trimmed) {
    localStorage.removeItem(MICRO_BLOG_AVATAR_KEY);
    return "";
  }

  localStorage.setItem(MICRO_BLOG_AVATAR_KEY, trimmed);
  return trimmed;
}

export async function fetchMicroBlogAvatar() {
  const token = getMicroBlogToken();
  if (!token) {
    return "";
  }

  const url = new URL("/account/verify", `${MICRO_BLOG_BASE_URL}/`);
  const body = new URLSearchParams({ token });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Micro.blog verify failed: ${response.status}`);
  }

  const payload = await response.json();
  return setMicroBlogAvatar(payload?.avatar || "");
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
