// const MICRO_BLOG_BASE_URL = "http://localhost:3000";
const MICRO_BLOG_BASE_URL = "https://micro.blog";
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
	const headers = new Headers({
		"Content-Type": "application/x-www-form-urlencoded",
		"Accept": "application/json"
	});
	headers.set("Authorization", `Bearer ${token}`);
	const response = await fetch(url, {
		method: "POST",
		headers,
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

export async function createFeedSubscription(feed_url) {
	const trimmed = (feed_url || "").trim();
	if (!trimmed) {
		return null;
	}

	const url = new URL("/feeds/subscriptions.json", `${getFeedsBaseUrl()}/`);
	const headers = new Headers({
		"Content-Type": "application/json",
		"Accept": "application/json"
	});
	const token = getMicroBlogToken();
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify({ feed_url: trimmed })
	});

	// 300 Multiple Choices
	if (response.status === 300) {
		return response.json();
	}

	if (!response.ok) {
		throw new Error(`Feeds request failed: ${response.status}`);
	}

	return response.json();
}

export async function deleteFeedSubscription(subscription_id) {
	if (!subscription_id) {
		return null;
	}

	const url = new URL(`/feeds/subscriptions/${subscription_id}.json`, `${getFeedsBaseUrl()}/`);
	const headers = new Headers();
	const token = getMicroBlogToken();
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}
	headers.set("Accept", "application/json");

	const response = await fetch(url, {
		method: "DELETE",
		headers
	});

	if (!response.ok) {
		throw new Error(`Feeds request failed: ${response.status}`);
	}

	if (response.status === 204) {
		return null;
	}

	return response.json();
}

export async function fetchFeedEntries() {
  const perPage = 100;
  const entries = [];
  let page = 1;
  let hasMore = true;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - sevenDaysMs;

  while (hasMore) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page)
    });
    const pageEntries = await fetchFeedsJson(`/feeds/entries.json?${params.toString()}`);

    if (!Array.isArray(pageEntries) || pageEntries.length === 0) {
      break;
    }

    let stopIndex = pageEntries.length;
    for (let i = 0; i < pageEntries.length; i += 1) {
      const entry = pageEntries[i];
      const rawDate = entry?.published || entry?.created_at;
      if (!rawDate) {
        continue;
      }
      const entryTime = new Date(rawDate).getTime();
      if (!Number.isNaN(entryTime) && entryTime < cutoffTime) {
        stopIndex = i;
        hasMore = false;
        break;
      }
    }

    entries.push(...pageEntries.slice(0, stopIndex));
    if (!hasMore) {
      break;
    }
    page += 1;
  }

  return entries;
}

export async function fetchFeedUnreadEntryIds() {
  return fetchFeedsJson("/feeds/unread_entries.json");
}

export async function fetchFeedIcons() {
  return fetchFeedsJson("/feeds/icons.json");
}

export async function markFeedEntriesRead(entryIds) {
  const ids = Array.isArray(entryIds) ? entryIds.filter(Boolean).map(String) : [];
  if (ids.length === 0) {
    return [];
  }

  const unreadEntries = ids.map((id) => {
    const numericId = Number(id);
    return Number.isNaN(numericId) ? id : numericId;
  });

  return fetchFeedsJson("/feeds/unread_entries.json", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ unread_entries: unreadEntries })
  });
}

export async function markFeedEntriesUnread(entryIds) {
  const ids = Array.isArray(entryIds) ? entryIds.filter(Boolean).map(String) : [];
  if (ids.length === 0) {
    return [];
  }

  const unreadEntries = ids.map((id) => {
    const numericId = Number(id);
    return Number.isNaN(numericId) ? id : numericId;
  });

  return fetchFeedsJson("/feeds/unread_entries.json", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ unread_entries: unreadEntries })
  });
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
      const response_text = await response.text();
      const request_error = new Error(`Feeds request failed: ${response.status}`);
      request_error.response_text = response_text;
      throw request_error;
    }
    return response.json();
  }
  catch (error) {
    console.warn("Feeds request failed", error);
    throw error;
  }
}
