import { mockPosts, mockSubscriptions } from "../mock_data.js";
import { USE_MOCK_DATA } from "../config.js";
import {
	cacheFeedEntries,
	fetchBookmarkedPosts,
	fetchFeedEntries,
	fetchFeedEntriesForFeed,
	fetchFeedSubscriptions,
	fetchFeedStarredEntryIds,
	fetchFeedUnreadEntryIds,
	isSignedIn
} from "./feeds.js";

export const DEFAULT_AVATAR_URL = "/images/blank_avatar.png";
const TIMELINE_MODE_FEEDS = "feeds";
const TIMELINE_MODE_BOOKMARKS = "bookmarks";

export async function fetchTimelineData(options = {}) {
	const timeline_mode = options?.mode == TIMELINE_MODE_BOOKMARKS
		? TIMELINE_MODE_BOOKMARKS
		: TIMELINE_MODE_FEEDS;
	const on_progress = typeof options?.on_progress == "function"
		? options.on_progress
		: null;

	try {
		if (!isSignedIn()) {
			if (USE_MOCK_DATA) {
				return { posts: [...mockPosts], subscription_count: null, subscriptions: mockSubscriptions };
			}
			return { posts: [], subscription_count: null, subscriptions: [] };
		}

		if (timeline_mode == TIMELINE_MODE_BOOKMARKS) {
			return fetchBookmarksTimelineData();
		}

		const [subscriptions, unread_entry_ids] = await Promise.all([
			fetchFeedSubscriptions(),
			fetchFeedUnreadEntryIds()
		]);
		const subscriptions_list = Array.isArray(subscriptions) ? subscriptions : [];
		const subscription_count = subscriptions_list.length;
		const subscription_map = new Map(
			subscriptions_list.map((subscription) => [subscription.feed_id, subscription])
		);
		const unread_set = new Set((unread_entry_ids || []).map((id) => String(id)));
		const icon_map = new Map();
		const starred_set = new Set();

		const feed_entries_options = on_progress
			? {
				on_progress: async ({ entries }) => {
					const posts = mapEntriesToPosts(entries, subscription_map, unread_set, icon_map, starred_set);
					await on_progress({ posts, subscription_count, subscriptions: subscriptions_list });
				}
			}
			: {};
		const entries = await fetchFeedEntries(feed_entries_options);

		cacheFeedEntries(entries);
		const posts = mapEntriesToPosts(entries, subscription_map, unread_set, icon_map, starred_set);

		return { posts, subscription_count, subscriptions: subscriptions_list };
	}
	catch (error) {
		if (USE_MOCK_DATA) {
			console.error("Failed to load feeds timeline", error);
			return { posts: [...mockPosts], subscription_count: null, subscriptions: mockSubscriptions };
		}
		throw error;
	}
}

export async function fetchTimelineDataForFeed(feed_id, options = {}) {
	const trimmed_feed_id = feed_id == null ? "" : String(feed_id).trim();
	if (!trimmed_feed_id) {
		return { posts: [], subscriptions: [] };
	}

	try {
		if (!isSignedIn()) {
			if (USE_MOCK_DATA) {
				return { posts: [...mockPosts], subscriptions: mockSubscriptions };
			}
			return { posts: [], subscriptions: [] };
		}

		const provided_subscriptions = Array.isArray(options?.subscriptions)
			? options.subscriptions
			: null;
		const subscriptions_promise = provided_subscriptions
			? Promise.resolve(provided_subscriptions)
			: fetchFeedSubscriptions();

		const [subscriptions, unread_entry_ids, starred_entry_ids, entries] = await Promise.all([
			subscriptions_promise,
			fetchFeedUnreadEntryIds(),
			fetchFeedStarredEntryIds(),
			fetchFeedEntriesForFeed(trimmed_feed_id)
		]);

		const subscriptions_list = Array.isArray(subscriptions) ? subscriptions : [];
		const subscription_map = new Map(
			subscriptions_list.map((subscription) => [subscription.feed_id, subscription])
		);
		const unread_set = new Set((unread_entry_ids || []).map((id) => String(id)));
		const starred_set = new Set((starred_entry_ids || []).map((id) => String(id)));
		const icon_map = new Map();

		cacheFeedEntries(entries);
		const posts = mapEntriesToPosts(entries, subscription_map, unread_set, icon_map, starred_set);
		return { posts, subscriptions: subscriptions_list };
	}
	catch (error) {
		if (USE_MOCK_DATA) {
			console.error("Failed to load feed timeline", error);
			return { posts: [...mockPosts], subscriptions: mockSubscriptions };
		}
		throw error;
	}
}

async function fetchBookmarksTimelineData() {
	const payload = await fetchBookmarkedPosts();
	const items = Array.isArray(payload?.items) ? payload.items : [];
	const bookmark_entries = [];
	const posts = items.map((item, index) => {
		const post = mapBookmarkItemToPost(item, index);
		const summary = item?.summary || "";
		bookmark_entries.push({
			id: post.id,
			title: item?.title || summary || post.source || "Untitled",
			summary,
			content: item?.content_html || (summary ? `<p>${summary}</p>` : ""),
			author: post.source || ""
		});
		return post;
	});
	cacheFeedEntries(bookmark_entries);
	return { posts, subscription_count: null, subscriptions: [] };
}

function mapBookmarkItemToPost(item, index) {
	const author = resolveBookmarkAuthor(item);
	const source = author?.name || "Bookmarked";
	const published_at = item?.date_published || item?.date_modified || new Date().toISOString();
	const url = (item?.url || "").trim();
	const bookmark_id = item?.id != null ? String(item.id) : "";
	const generated_id = `bookmark-${index + 1}-${published_at}`;
	return {
		id: bookmark_id || url || generated_id,
		bookmark_id,
		feed_id: "",
		source,
		source_url: resolveBookmarkSourceUrl(author),
		title: item?.title || "",
		summary: item?.summary || "",
		url,
		avatar_url: resolveBookmarkAvatar(author),
		published_at,
		is_read: false,
		is_bookmarked: true,
		is_archived: false,
		age_bucket: getAgeBucket(published_at)
	};
}

function resolveBookmarkAuthor(item) {
	if (item?.author && typeof item.author == "object") {
		return item.author;
	}
	const authors = Array.isArray(item?.authors) ? item.authors : [];
	return authors.find((entry) => entry && typeof entry == "object") || null;
}

function resolveBookmarkSourceUrl(author) {
	const raw_url = (author?.url || "").trim();
	if (!raw_url) {
		return "";
	}

	try {
		return new URL(raw_url).toString();
	}
	catch (error) {
		try {
			return new URL(`https://${raw_url}`).toString();
		}
		catch (secondError) {
			return "";
		}
	}
}

function resolveBookmarkAvatar(author) {
	const avatar_url = (author?.avatar || "").trim();
	return avatar_url || DEFAULT_AVATAR_URL;
}

function mapEntriesToPosts(entries, subscription_map, unread_set, icon_map, starred_set) {
	return entries.map((entry) => {
		const subscription = subscription_map.get(entry.feed_id);
		const published_at = entry.published || entry.created_at || new Date().toISOString();
		const resolved_feed_id = entry.feed_id != null
			? String(entry.feed_id)
			: (subscription && subscription.feed_id != null ? String(subscription.feed_id) : "");
		return {
			id: String(entry.id),
			bookmark_id: "",
			feed_id: resolved_feed_id,
			source: resolveSource(subscription),
			source_url: resolveSourceUrl(subscription),
			title: entry.title,
			summary: entry.summary || "",
			url: entry.url,
			avatar_url: resolveAvatar(subscription, icon_map),
			published_at,
			is_read: !unread_set.has(String(entry.id)),
			is_bookmarked: starred_set.has(String(entry.id)),
			is_archived: false,
			age_bucket: getAgeBucket(published_at)
		};
	});
}

export async function fetchTimeline() {
	const timeline_data = await fetchTimelineData();
	return timeline_data.posts;
}

export async function fetchPostsBySource(source) {
  const posts = await fetchTimeline();
  return posts.filter((post) => post.source === source);
}

function resolveSource(subscription) {
  if (!subscription) {
    return "Feedbin";
  }

  return (
    subscription.title ||
    subscription.site_url ||
    subscription.feed_url ||
    "Feedbin"
  );
}

function resolveSourceUrl(subscription) {
  if (!subscription) {
    return "";
  }

  const rawUrl = subscription.site_url || subscription.feed_url || "";
  if (!rawUrl) {
    return "";
  }

  try {
    return new URL(rawUrl).toString();
  }
  catch (error) {
    try {
      return new URL(`https://${rawUrl}`).toString();
    }
    catch (secondError) {
      return "";
    }
  }
}

function resolveAvatar(subscription, iconMap) {
  if (!subscription || !subscription.json_feed) {
    return resolveIconFallback(subscription, iconMap);
  }

  const jsonIcon =
    subscription.json_feed.icon ||
    subscription.json_feed.favicon ||
    "";
  if (jsonIcon) {
    return jsonIcon;
  }

  return resolveIconFallback(subscription, iconMap);
}

function resolveIconFallback(subscription, iconMap) {
  if (!subscription || !iconMap || iconMap.size === 0) {
    return DEFAULT_AVATAR_URL;
  }

  const host = getSubscriptionHost(subscription);
  if (!host) {
    return DEFAULT_AVATAR_URL;
  }

  return iconMap.get(host) || DEFAULT_AVATAR_URL;
}

function getSubscriptionHost(subscription) {
  const rawUrl = subscription.site_url || subscription.feed_url || "";
  if (!rawUrl) {
    return "";
  }

  try {
    return new URL(rawUrl).hostname;
  }
  catch (error) {
    try {
      return new URL(`https://${rawUrl}`).hostname;
    }
    catch (secondError) {
      return "";
    }
  }
}

function getAgeBucket(isoDate) {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) {
		return "day-7";
	}

	const now = new Date();
	const today_midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const entry_midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const diffMs = today_midnight.getTime() - entry_midnight.getTime();
	const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
	const bucket = Math.min(Math.max(diffDays, 0), 6) + 1;
	return `day-${bucket}`;
}
