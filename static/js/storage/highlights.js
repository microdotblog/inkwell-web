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

export async function mergeRemoteHighlights(highlights) {
	const provided_highlights = Array.isArray(highlights) ? highlights : [];
	if (provided_highlights.length == 0) {
		return 0;
	}

	const highlights_by_post = new Map();
	provided_highlights.forEach((highlight) => {
		if (!highlight || typeof highlight != "object") {
			return;
		}

		const post_id = `${highlight.post_id || ""}`.trim();
		if (!post_id) {
			return;
		}

		if (!highlights_by_post.has(post_id)) {
			highlights_by_post.set(post_id, []);
		}
		highlights_by_post.get(post_id).push(highlight);
	});

	const writes = [...highlights_by_post.entries()].map(async ([post_id, incoming_highlights]) => {
		const key = `${KEY_PREFIX}${post_id}`;
		const existing_highlights = (await get(key)) || [];
		const merged_highlights = mergeHighlightCollections(existing_highlights, incoming_highlights);
		await set(key, merged_highlights);
	});
	await Promise.all(writes);

	return highlights_by_post.size;
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

function mergeHighlightCollections(existing_highlights, incoming_highlights) {
	const merged = [];
	const all_highlights = [
		...(Array.isArray(existing_highlights) ? existing_highlights : []),
		...(Array.isArray(incoming_highlights) ? incoming_highlights : [])
	];

	all_highlights.forEach((highlight) => {
		if (!highlight || typeof highlight != "object") {
			return;
		}

		const index = merged.findIndex((item) => isSameStoredHighlight(item, highlight));
		if (index < 0) {
			merged.push(highlight);
			return;
		}

		merged[index] = mergeStoredHighlight(merged[index], highlight);
	});

	return merged.sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
}

function isSameStoredHighlight(a, b) {
	if (!a || !b) {
		return false;
	}

	const a_post_id = `${a.post_id || ""}`.trim();
	const b_post_id = `${b.post_id || ""}`.trim();
	if (!a_post_id || !b_post_id || a_post_id != b_post_id) {
		return false;
	}

	const a_remote_id = normalizeRemoteHighlightId(a);
	const b_remote_id = normalizeRemoteHighlightId(b);
	if (a_remote_id && b_remote_id) {
		return a_remote_id == b_remote_id;
	}

	const a_id = `${a.id || ""}`.trim();
	const b_id = `${b.id || ""}`.trim();
	if (a_id && b_id && a_id == b_id) {
		return true;
	}

	const a_signature = getHighlightSignature(a);
	const b_signature = getHighlightSignature(b);
	if (!a_signature || !b_signature) {
		return false;
	}
	return a_signature == b_signature;
}

function mergeStoredHighlight(existing_highlight, incoming_highlight) {
	const merged = { ...existing_highlight, ...incoming_highlight };
	const existing_id = `${existing_highlight?.id || ""}`.trim();
	if (existing_id.startsWith("hl-")) {
		merged.id = existing_id;
	}

	const existing_remote_id = normalizeRemoteHighlightId(existing_highlight);
	const incoming_remote_id = normalizeRemoteHighlightId(incoming_highlight);
	const remote_id = incoming_remote_id || existing_remote_id;
	if (remote_id) {
		merged.highlight_id = remote_id;
		if (!merged.id) {
			merged.id = remote_id;
		}
	}

	return merged;
}

function normalizeRemoteHighlightId(highlight) {
	if (!highlight || typeof highlight != "object") {
		return "";
	}

	const highlight_id = `${highlight.highlight_id || ""}`.trim();
	if (highlight_id) {
		return highlight_id;
	}

	const id = `${highlight.id || ""}`.trim();
	if (!id || id.startsWith("hl-")) {
		return "";
	}
	return id;
}

function getHighlightSignature(highlight) {
	if (!highlight || typeof highlight != "object") {
		return "";
	}

	const post_id = `${highlight.post_id || ""}`.trim();
	const text = `${highlight.text || ""}`.trim();
	const start_offset = Number(highlight.start_offset ?? highlight.selection_start ?? highlight.start);
	const end_offset = Number(highlight.end_offset ?? highlight.selection_end ?? highlight.end);
	if (!post_id || !text) {
		return "";
	}
	if (!Number.isFinite(start_offset) || !Number.isFinite(end_offset)) {
		return "";
	}

	return `${post_id}|${Math.floor(start_offset)}|${Math.floor(end_offset)}|${text}`;
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
