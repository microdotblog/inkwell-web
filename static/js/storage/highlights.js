import { entries, get, set } from "./db.js";

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

export async function getAllHighlights() {
	const key_values = await entries();
	const all_highlights = [];

	key_values.forEach(([key, value]) => {
		if (typeof key != "string" || !key.startsWith(KEY_PREFIX)) {
			return;
		}
		if (!Array.isArray(value) || value.length == 0) {
			return;
		}
		value.forEach((highlight) => {
			all_highlights.push(highlight);
		});
	});

	return all_highlights.sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
}

export async function deleteHighlight(postId, highlightId) {
	if (!postId || !highlightId) {
		return [];
	}

	const key = `${KEY_PREFIX}${postId}`;
	const existing = (await get(key)) || [];
	const updated = existing.filter((highlight) => highlight.id != highlightId);
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

function getSortTimestamp(highlight) {
	const created_at = parseDate(highlight?.created_at);
	if (created_at > 0) {
		return created_at;
	}

	const published_at = parseDate(highlight?.post_published_at);
	if (published_at > 0) {
		return published_at;
	}

	const local_id = typeof highlight?.id == "string" ? highlight.id : "";
	const local_match = local_id.match(/^hl-(\d+)$/);
	if (local_match) {
		const local_timestamp = Number(local_match[1]);
		if (Number.isFinite(local_timestamp)) {
			return local_timestamp;
		}
	}

	return 0;
}

function parseDate(raw_value) {
	if (!raw_value) {
		return 0;
	}

	const parsed = Date.parse(raw_value);
	if (!Number.isFinite(parsed)) {
		return 0;
	}

	return parsed;
}
