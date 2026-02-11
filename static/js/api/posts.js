import { mockPosts, mockSubscriptions } from "../mock_data.js";
import { USE_MOCK_DATA } from "../config.js";
import {
  cacheFeedEntries,
  fetchFeedEntries,
  fetchFeedSubscriptions,
  fetchFeedUnreadEntryIds
} from "./feeds.js";

export const DEFAULT_AVATAR_URL = "/images/blank_avatar.png";

export async function fetchTimelineData(options = {}) {
	const on_progress = typeof options?.on_progress == "function"
		? options.on_progress
		: null;

  try {
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

function mapEntriesToPosts(entries, subscription_map, unread_set, icon_map, starred_set) {
	return entries.map((entry) => {
		const subscription = subscription_map.get(entry.feed_id);
		const published_at = entry.published || entry.created_at || new Date().toISOString();
		const resolved_feed_id = entry.feed_id != null
			? String(entry.feed_id)
			: (subscription && subscription.feed_id != null ? String(subscription.feed_id) : "");
		return {
			id: String(entry.id),
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
