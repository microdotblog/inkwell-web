import { get, set } from "./db.js";

const KEY = "read_posts";

export async function loadReadIds() {
  const stored = await get(KEY);
  if (Array.isArray(stored)) {
    return stored;
  }
  if (stored && typeof stored === "object") {
    return Object.keys(stored).filter((id) => stored[id]);
  }
  return [];
}

export async function markRead(postId) {
  if (!postId) {
    return [];
  }

  const existing = await loadReadIds();
  if (existing.includes(postId)) {
    return existing;
  }

  const updated = [...existing, postId];
  await set(KEY, updated);
  return updated;
}

export async function markUnread(postId) {
  if (!postId) {
    return [];
  }

  const existing = await loadReadIds();
  if (!existing.includes(postId)) {
    return existing;
  }

  const updated = existing.filter((id) => id !== postId);
  await set(KEY, updated);
  return updated;
}

export async function markAllRead(postIds) {
  const ids = Array.isArray(postIds) ? postIds.filter(Boolean).map(String) : [];
  const uniqueIds = Array.from(new Set(ids));
  await set(KEY, uniqueIds);
  return uniqueIds;
}
