import { get, set } from "./db.js";

const KEY_PREFIX = "highlights:";

export async function saveHighlight(highlight) {
  const key = `${KEY_PREFIX}${highlight.post_id}`;
  const existing = (await get(key)) || [];
  const updated = [highlight, ...existing];
  await set(key, updated);
  return highlight;
}

export async function getHighlightsForPost(postId) {
  return (await get(`${KEY_PREFIX}${postId}`)) || [];
}

export async function deleteHighlight(postId, highlightId) {
  if (!postId || !highlightId) {
    return [];
  }

  const key = `${KEY_PREFIX}${postId}`;
  const existing = (await get(key)) || [];
  const updated = existing.filter((highlight) => highlight.id !== highlightId);
  await set(key, updated);
  return updated;
}

export async function updateHighlight(post_id, local_id, updates) {
	if (!post_id || !local_id) {
		return null;
	}

	const key = `${KEY_PREFIX}${post_id}`;
	const existing = (await get(key)) || [];
	let updated_highlight = null;
	const updated = existing.map((highlight) => {
		if (highlight.id == local_id) {
			updated_highlight = { ...highlight, ...updates };
			return updated_highlight;
		}
		return highlight;
	});
	await set(key, updated);
	return updated_highlight;
}
