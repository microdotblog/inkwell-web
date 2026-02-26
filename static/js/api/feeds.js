import { mockContacts } from "../mock_data.js";
import { USE_MOCK_CONTACTS } from "../config.js";

// const MICRO_BLOG_BASE_URL = "http://localhost:3000";
const MICRO_BLOG_BASE_URL = "https://micro.blog";
const MICRO_BLOG_TOKEN_KEY = "inkwell_microblog_token";
const MICRO_BLOG_AVATAR_KEY = "inkwell_microblog_avatar";
const MICRO_BLOG_AI_KEY = "inkwell_is_using_ai";
const MICRO_BLOG_PREMIUM_KEY = "inkwell_is_premium";

const entryCache = new Map();
const DAY_MS = 24 * 60 * 60 * 1000;

function getOldestTimelineMidnight() {
	const now = new Date();
	const today_midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	return today_midnight.getTime() - (6 * DAY_MS);
}

function getLocalMidnightTime(raw_date) {
	if (!raw_date) {
		return null;
	}

	const entry_date = new Date(raw_date);
	if (Number.isNaN(entry_date.getTime())) {
		return null;
	}

	const entry_midnight = new Date(
		entry_date.getFullYear(),
		entry_date.getMonth(),
		entry_date.getDate()
	);
	return entry_midnight.getTime();
}

function isOlderThanTimelineWindow(raw_date, oldest_timeline_midnight) {
	const entry_midnight = getLocalMidnightTime(raw_date);
	if (entry_midnight == null) {
		return false;
	}

	return entry_midnight < oldest_timeline_midnight;
}

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

export function isSignedIn() {
	return Boolean(getMicroBlogToken());
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

export function getMicroBlogIsUsingAI() {
	const stored = localStorage.getItem(MICRO_BLOG_AI_KEY);
	if (stored == "false") {
		return false;
	}
	if (stored == "true") {
		return true;
	}

	return true;
}

export function setMicroBlogIsUsingAI(is_using_ai) {
	if (is_using_ai == true || is_using_ai == "true") {
		localStorage.setItem(MICRO_BLOG_AI_KEY, "true");
		return true;
	}
	if (is_using_ai == false || is_using_ai == "false") {
		localStorage.setItem(MICRO_BLOG_AI_KEY, "false");
		return false;
	}

	localStorage.removeItem(MICRO_BLOG_AI_KEY);
	return null;
}

export function getMicroBlogIsPremium() {
	const stored = localStorage.getItem(MICRO_BLOG_PREMIUM_KEY);
	if (stored == "false") {
		return false;
	}
	if (stored == "true") {
		return true;
	}

	return true;
}

export function setMicroBlogIsPremium(is_premium) {
	if (is_premium == true || is_premium == "true") {
		localStorage.setItem(MICRO_BLOG_PREMIUM_KEY, "true");
		return true;
	}
	if (is_premium == false || is_premium == "false") {
		localStorage.setItem(MICRO_BLOG_PREMIUM_KEY, "false");
		return false;
	}

	localStorage.removeItem(MICRO_BLOG_PREMIUM_KEY);
	return null;
}

export async function fetchMicroBlogAvatar() {
	const token = getMicroBlogToken();
	if (!token) {
		return {
			avatar: "",
			has_inkwell: true,
			is_using_ai: getMicroBlogIsUsingAI(),
			is_premium: getMicroBlogIsPremium()
		};
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
	const next_token = payload?.token;
	if (typeof next_token == "string" && next_token.trim()) {
		setMicroBlogToken(next_token);
	}
	const avatar = setMicroBlogAvatar(payload?.avatar || "");
	const has_inkwell = payload?.has_inkwell;
	const is_using_ai = payload?.is_using_ai;
	const is_premium = payload?.is_premium;
	if (is_using_ai != null) {
		setMicroBlogIsUsingAI(is_using_ai);
	}
	if (is_premium != null) {
		setMicroBlogIsPremium(is_premium);
	}
	return {
		avatar,
		has_inkwell,
		is_using_ai: getMicroBlogIsUsingAI(),
		is_premium: getMicroBlogIsPremium()
	};
}

export function cacheFeedEntries(entries) {
	if (!Array.isArray(entries)) {
		return;
	}
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
  return fetchFeedsJson("/feeds/v2/subscriptions.json?mode=extended");
}

export async function createFeedSubscription(feed_url) {
	const trimmed = (feed_url || "").trim();
	if (!trimmed) {
		return null;
	}

	const url = new URL("/feeds/v2/subscriptions.json", `${getFeedsBaseUrl()}/`);
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

export async function searchMicroBlogContacts(terms) {
	const trimmed_terms = (terms || "").trim();
	if (!trimmed_terms) {
		return { contacts: [] };
	}

	if (USE_MOCK_CONTACTS) {
		return {
			contacts: filterMockContacts(trimmed_terms)
		};
	}

	const url = new URL("/micropub", `${getFeedsBaseUrl()}/`);
	url.searchParams.set("q", "contact");
	url.searchParams.set("filter", trimmed_terms);

	const headers = new Headers({
		"Accept": "application/json"
	});
	const token = getMicroBlogToken();
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(url, {
		method: "GET",
		headers
	});

	if (!response.ok) {
		const response_text = await response.text();
		const request_error = new Error(`Feeds request failed: ${response.status}`);
		request_error.response_text = response_text;
		throw request_error;
	}

	return response.json();
}

function filterMockContacts(raw_terms) {
	const trimmed_terms = (raw_terms || "").trim().toLowerCase();
	if (!trimmed_terms) {
		return [...mockContacts];
	}

	return mockContacts.filter((contact) => {
		const name = `${contact?.name || ""}`.trim().toLowerCase();
		const nickname = `${contact?.nickname || ""}`.trim().toLowerCase();
		const url = `${contact?.url || ""}`.trim().toLowerCase();
		return name.includes(trimmed_terms) || nickname.includes(trimmed_terms) || url.includes(trimmed_terms);
	});
}

export async function deleteFeedSubscription(subscription_id) {
	if (!subscription_id) {
		return null;
	}

	const url = new URL(`/feeds/v2/subscriptions/${subscription_id}.json`, `${getFeedsBaseUrl()}/`);
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

export async function updateFeedSubscription(subscription_id, title) {
	if (!subscription_id) {
		return null;
	}

	const trimmed_title = (title || "").trim();
	return fetchFeedsJson(`/feeds/v2/subscriptions/${subscription_id}.json`, {
		method: "PATCH",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ title: trimmed_title })
	});
}

export async function fetchFeedEntries(options = {}) {
	const on_progress = typeof options?.on_progress == "function"
		? options.on_progress
		: null;
	const per_page = 50;
	const entries = [];
	let page = 1;
	let has_more = true;
	const cached_limit = 25;
	let cached_count = 0;
	const oldest_timeline_midnight = getOldestTimelineMidnight();

	while (has_more) {
		const params = new URLSearchParams({
			per_page: String(per_page),
			page: String(page)
		});
		const page_entries = await fetchFeedsJson(`/feeds/v2/entries.json?${params.toString()}`);

		if (!Array.isArray(page_entries) || page_entries.length === 0) {
			break;
		}

		let stop_index = page_entries.length;
		for (let i = 0; i < page_entries.length; i += 1) {
			const entry = page_entries[i];
			const raw_date = entry?.published || entry?.created_at;
			if (!raw_date) {
				continue;
			}
			if (isOlderThanTimelineWindow(raw_date, oldest_timeline_midnight)) {
				stop_index = i;
				has_more = false;
				break;
			}

			if (entry?.id != null && entryCache.has(String(entry.id))) {
				cached_count += 1;
				if (cached_count >= cached_limit) {
					stop_index = i + 1;
					has_more = false;
					break;
				}
			}
		}

		const page_slice = page_entries.slice(0, stop_index);
		entries.push(...page_slice);
		if (on_progress && page_slice.length > 0) {
			await on_progress({ entries: [...entries] });
		}
		if (!has_more) {
			break;
		}
		page += 1;
	}

	let merged_count = 0;
	const seen_ids = new Set();
	entries.forEach((entry) => {
		if (entry?.id != null) {
			seen_ids.add(String(entry.id));
		}
	});
	for (const cached_entry of entryCache.values()) {
		const cached_id = cached_entry?.id;
		if (cached_id == null) {
			continue;
		}
		const cached_raw_date = cached_entry?.published || cached_entry?.created_at;
		if (isOlderThanTimelineWindow(cached_raw_date, oldest_timeline_midnight)) {
			continue;
		}
		const cached_key = String(cached_id);
		if (!seen_ids.has(cached_key)) {
			entries.push(cached_entry);
			seen_ids.add(cached_key);
			merged_count += 1;
		}
	}

	if (merged_count > 0) {
		entries.sort((left, right) => {
			const left_date = left?.published || left?.created_at;
			const right_date = right?.published || right?.created_at;
			const left_time = left_date ? new Date(left_date).getTime() : 0;
			const right_time = right_date ? new Date(right_date).getTime() : 0;
			if (Number.isNaN(left_time) && Number.isNaN(right_time)) {
				return 0;
			}
			if (Number.isNaN(left_time)) {
				return 1;
			}
			if (Number.isNaN(right_time)) {
				return -1;
			}
			return right_time - left_time;
		});
		if (on_progress) {
			await on_progress({ entries: [...entries] });
		}
	}

	return entries;
}

export async function fetchFeedEntriesForFeed(feed_id, options = {}) {
	const trimmed_feed_id = feed_id == null ? "" : String(feed_id).trim();
	if (!trimmed_feed_id) {
		return [];
	}

	const on_progress = typeof options?.on_progress == "function"
		? options.on_progress
		: null;
	const per_page = 100;
	const encoded_feed_id = encodeURIComponent(trimmed_feed_id);
	const entries = [];
	let page = 1;

	while (true) {
		const params = new URLSearchParams({
			per_page: String(per_page),
			page: String(page)
		});
		const page_entries = await fetchFeedsJson(`/feeds/v2/feeds/${encoded_feed_id}/entries.json?${params.toString()}`);

		if (!Array.isArray(page_entries) || page_entries.length == 0) {
			break;
		}

		entries.push(...page_entries);
		if (on_progress) {
			await on_progress({ entries: [...entries] });
		}

		if (page_entries.length < per_page) {
			break;
		}

		page += 1;
	}

	return entries;
}

export async function fetchFeedUnreadEntryIds() {
  return fetchFeedsJson("/feeds/v2/unread_entries.json");
}

export async function fetchFeedStarredEntryIds() {
	return fetchFeedsJson("/feeds/v2/starred_entries.json");
}

export async function fetchFeedIcons() {
  return fetchFeedsJson("/feeds/v2/icons.json");
}

export async function fetchBlogrollDirectory() {
	return fetchFeedsJson("/blogroll.org.json");
}

export async function fetchDiscoverPosts() {
	return fetchFeedsJson("/posts/discover");
}

export async function fetchBookmarkedPosts() {
	return fetchFeedsJson("/posts/bookmarks");
}

export async function deleteBookmarkedPost(bookmark_id) {
	const trimmed_id = (bookmark_id || "").toString().trim();
	if (!trimmed_id) {
		return null;
	}

	const encoded_id = encodeURIComponent(trimmed_id);
	const url = new URL(`/posts/bookmarks/${encoded_id}`, `${getFeedsBaseUrl()}/`);
	const headers = new Headers({
		"Accept": "application/json"
	});
	const token = getMicroBlogToken();
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(url, {
		method: "DELETE",
		headers
	});

	if (!response.ok) {
		const response_text = await response.text();
		const request_error = new Error(`Feeds request failed: ${response.status}`);
		request_error.response_text = response_text;
		throw request_error;
	}

	if (response.status == 204) {
		return null;
	}

	try {
		return await response.json();
	}
	catch (error) {
		return null;
	}
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

  return fetchFeedsJson("/feeds/v2/unread_entries.json", {
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

  return fetchFeedsJson("/feeds/v2/unread_entries.json", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ unread_entries: unreadEntries })
  });
}

export async function starFeedEntries(entryIds) {
	const ids = Array.isArray(entryIds) ? entryIds.filter(Boolean).map(String) : [];
	if (ids.length === 0) {
		return [];
	}

	const starred_entries = ids.map((id) => {
		const numeric_id = Number(id);
		return Number.isNaN(numeric_id) ? id : numeric_id;
	});
  
	return fetchFeedsJson("/feeds/v2/starred_entries.json", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ starred_entries })
	});
}

export async function unstarFeedEntries(entryIds) {
	const ids = Array.isArray(entryIds) ? entryIds.filter(Boolean).map(String) : [];
	if (ids.length === 0) {
		return [];
	}

	const starred_entries = ids.map((id) => {
		const numeric_id = Number(id);
		return Number.isNaN(numeric_id) ? id : numeric_id;
	});

	return fetchFeedsJson("/feeds/v2/starred_entries.json", {
		method: "DELETE",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ starred_entries })
	});
}

export async function fetchConversationReplies(post_url) {
	const trimmed_post_url = (post_url || "").trim();
	if (!trimmed_post_url) {
		return { items: [], home_page_url: "", not_found: false };
	}

	const params = new URLSearchParams({
		url: trimmed_post_url,
		format: "jsonfeed"
	});
	const url = new URL(`/conversation.js?${params.toString()}`, `${getFeedsBaseUrl()}/`);
	const headers = new Headers({
		"Accept": "application/json"
	});
	const token = getMicroBlogToken();
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(url, {
		method: "GET",
		headers
	});
	if (response.status == 404) {
		return { items: [], home_page_url: "", not_found: true };
	}
	if (!response.ok) {
		const response_text = await response.text();
		const request_error = new Error(`Feeds conversation failed: ${response.status}`);
		request_error.response_text = response_text;
		throw request_error;
	}

	try {
		const payload = await response.json();
		return {
			...payload,
			not_found: false
		};
	}
	catch (error) {
		return { items: [], home_page_url: "", not_found: false };
	}
}

export async function summarizeFeedEntries(entryIds) {
	const ids = Array.isArray(entryIds) ? entryIds.filter(Boolean).map(String) : [];
	if (ids.length == 0) {
		return "";
	}

	const entry_ids = ids.map((id) => {
		const numeric_id = Number(id);
		return Number.isNaN(numeric_id) ? id : numeric_id;
	});

	const url = new URL("/feeds/recap", `${getFeedsBaseUrl()}/`);
	const headers = new Headers({
		"Content-Type": "application/json",
		"Accept": "text/html"
	});
	const token = getMicroBlogToken();
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const max_attempts = 25;
	const retry_delay_ms = 5000;

	for (let attempt = 1; attempt <= max_attempts; attempt++) {
		const response = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(entry_ids)
		});

		if (response.status == 202) {
			if (attempt < max_attempts) {
				await new Promise((resolve) => setTimeout(resolve, retry_delay_ms));
				continue;
			}
			console.warn("Feeds summarize timed out after 25 attempts");
			return "";
		}

		if (!response.ok) {
			const response_text = await response.text();
			const request_error = new Error(`Feeds summarize failed: ${response.status}`);
			request_error.response_text = response_text;
			throw request_error;
		}

		return response.text();
	}

	return "";
}

export async function fetchRecapEmailSettings() {
	const url = new URL("/feeds/recap/email", `${getFeedsBaseUrl()}/`);
	const headers = new Headers({
		"Accept": "application/json"
	});
	const token = getMicroBlogToken();
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(url, {
		method: "GET",
		headers
	});
	if (!response.ok) {
		const response_text = await response.text();
		const request_error = new Error(`Feeds recap email settings failed: ${response.status}`);
		request_error.response_text = response_text;
		throw request_error;
	}

	try {
		const payload = await response.json();
		return {
			dayofweek: (payload?.dayofweek || "").trim()
		};
	}
	catch (error) {
		return { dayofweek: "" };
	}
}

export async function updateRecapEmailSettings(settings = {}) {
	const dayofweek = (settings.dayofweek || "").trim();
	const url = new URL("/feeds/recap/email", `${getFeedsBaseUrl()}/`);
	const body = new URLSearchParams();
	body.set("dayofweek", dayofweek);

	const headers = new Headers({
		"Content-Type": "application/x-www-form-urlencoded",
		"Accept": "application/json"
	});
	const token = getMicroBlogToken();
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(url, {
		method: "POST",
		headers,
		body: body.toString()
	});
	if (!response.ok) {
		const response_text = await response.text();
		const request_error = new Error(`Feeds recap email settings update failed: ${response.status}`);
		request_error.response_text = response_text;
		throw request_error;
	}

	try {
		return await response.json();
	}
	catch (error) {
		return { dayofweek };
	}
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
