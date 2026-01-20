import { mockPosts } from "../mock_data.js";
import {
  cacheFeedEntries,
  fetchFeedEntries,
  fetchFeedIcons,
  fetchFeedSubscriptions,
  fetchFeedUnreadEntryIds
} from "./feeds.js";

const DEFAULT_AVATAR_URL = "/images/avatar-placeholder.svg";

export async function fetchTimeline() {
  try {
    const [subscriptions, entries, unreadEntryIds, icons] = await Promise.all([
      fetchFeedSubscriptions(),
      fetchFeedEntries(),
      fetchFeedUnreadEntryIds(),
      fetchFeedIcons()
    ]);

    cacheFeedEntries(entries);

    const subscriptionMap = new Map(
      subscriptions.map((subscription) => [subscription.feed_id, subscription])
    );
    const unreadSet = new Set(unreadEntryIds.map((id) => String(id)));
    const iconMap = new Map(
      Array.isArray(icons)
        ? icons.map((icon) => [icon.host, icon.url]).filter(([host, url]) => host && url)
        : []
    );

    return entries.map((entry) => {
      const subscription = subscriptionMap.get(entry.feed_id);
      const publishedAt = entry.published || entry.created_at || new Date().toISOString();
      return {
        id: String(entry.id),
        source: resolveSource(subscription),
        title: entry.title,
        summary: entry.summary || "",
        url: entry.url,
        avatar_url: resolveAvatar(subscription, iconMap),
        published_at: publishedAt,
        is_read: !unreadSet.has(String(entry.id)),
        is_archived: false,
        age_bucket: getAgeBucket(publishedAt)
      };
    });
  }
  catch (error) {
    console.warn("Failed to load feeds timeline", error);
    return [...mockPosts];
  }
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

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const bucket = Math.min(Math.max(diffDays, 0), 6) + 1;
  return `day-${bucket}`;
}
