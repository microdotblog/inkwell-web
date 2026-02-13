import { getMicroBlogToken } from "./feeds.js";

export async function publishReply({ content, in_reply_to }) {
  return { status: "mock", content, in_reply_to };
}

export async function publishHighlight({ quote, source }) {
  return { status: "mock", quote, source };
}

export async function publishPost({ title, content }) {
  return { status: "mock", title, content };
}

export async function createPostBookmark(bookmark_url) {
	const trimmed_url = (bookmark_url || "").trim();
	if (!trimmed_url) {
		return null;
	}

	const headers = new Headers({
		"Content-Type": "application/x-www-form-urlencoded",
		"Accept": "application/json"
	});
	const token = getMicroBlogToken();
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const micropub_url = new URL("https://micro.blog/micropub");
	const body = new URLSearchParams({
		"bookmark-of": trimmed_url
	});
	const response = await fetch(micropub_url, {
		method: "POST",
		headers,
		body
	});

	if (!response.ok) {
		const response_text = await response.text();
		const request_error = new Error(`Feeds request failed: ${response.status}`);
		request_error.response_text = response_text;
		throw request_error;
	}

	const content_type = (response.headers.get("content-type") || "").toLowerCase();
	if (content_type.includes("application/json")) {
		return response.json();
	}

	return {};
}
