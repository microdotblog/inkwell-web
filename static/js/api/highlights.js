import { getFeedsBaseUrl, getMicroBlogToken } from "./feeds.js";

export async function createMicroBlogHighlight({ post_id, text, start_offset, end_offset }) {
	if (!post_id || !text) {
		return null;
	}

	const url = new URL(`/feeds/${encodeURIComponent(post_id)}/highlights`, `${getFeedsBaseUrl()}/`);
	const fields = new URLSearchParams();
	fields.set("text", text);
	if (start_offset != null) {
		fields.set("start", String(start_offset));
	}
	if (end_offset != null) {
		fields.set("end", String(end_offset));
	}

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
		body: fields.toString()
	});

	if (!response.ok) {
		const response_text = await response.text();
		const request_error = new Error(`Micro.blog highlight failed: ${response.status}`);
		request_error.response_text = response_text;
		throw request_error;
	}

	try {
		return await response.json();
	}
	catch (error) {
		return null;
	}
}

export async function deleteMicroBlogHighlight({ post_id, highlight_id }) {
	if (!post_id || !highlight_id) {
		return null;
	}

	const url = new URL(
		`/feeds/${encodeURIComponent(post_id)}/highlights/${encodeURIComponent(highlight_id)}`,
		`${getFeedsBaseUrl()}/`
	);

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
		const request_error = new Error(`Micro.blog highlight delete failed: ${response.status}`);
		request_error.response_text = response_text;
		throw request_error;
	}

	try {
		return await response.json();
	}
	catch (error) {
		return null;
	}
}
