const ROUTE_CHANGE = "url:change";

function get_hash() {
	const raw = typeof window != "undefined" && window.location ? window.location.hash : "";
	return raw.replace(/^#/, "").trim();
}

function parse_hash(hash_string) {
	const hash = (hash_string != null ? hash_string : get_hash()).replace(/^#/, "").trim();
	if (hash == "" || hash == "/") {
		return { feedId: null, feedUrl: null, postId: null };
	}

	const question = hash.indexOf("?");
	const path = question >= 0 ? hash.slice(0, question) : hash;
	const query_string = question >= 0 ? hash.slice(question + 1) : "";
	const segments = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
	const params = new URLSearchParams(query_string);

	if (segments[0] == "feed" && segments[1] && segments[2] == "post" && segments[3]) {
		return {
			feedId: segments[1],
			feedUrl: null,
			postId: segments[3]
		};
	}

	if (segments[0] == "feed" && segments[1]) {
		return {
			feedId: segments[1],
			feedUrl: null,
			postId: null
		};
	}

	if (segments[0] == "feed" && params.has("url")) {
		return {
			feedId: null,
			feedUrl: params.get("url"),
			postId: null
		};
	}

	if (segments[0] == "post" && segments[1]) {
		return {
			feedId: null,
			feedUrl: null,
			postId: segments[1]
		};
	}

	return { feedId: null, feedUrl: null, postId: null };
}

function build_hash(state) {
	const feed_id = state.feedId != null && state.feedId != "" ? state.feedId : null;
	const post_id = state.postId != null && state.postId != "" ? state.postId : null;

	if (feed_id && post_id) {
		return `#/feed/${encodeURIComponent(feed_id)}/post/${encodeURIComponent(post_id)}`;
	}
	if (feed_id) {
		return `#/feed/${encodeURIComponent(feed_id)}`;
	}
	if (state.feedUrl != null && state.feedUrl != "") {
		return `#/feed?url=${encodeURIComponent(state.feedUrl)}`;
	}
	if (post_id) {
		return `#/post/${encodeURIComponent(post_id)}`;
	}
	return "#/";
}

function get_base_url() {
	if (typeof window == "undefined" || !window.location) {
		return "";
	}
	const loc = window.location;
	return loc.pathname + loc.search;
}

function replace_state(state) {
	const hash = build_hash(state);
	const url = get_base_url() + hash;
	window.history.replaceState({ route: state }, document.title, url);
}

function push_state(state) {
	const hash = build_hash(state);
	const url = get_base_url() + hash;
	window.history.pushState({ route: state }, document.title, url);
}

function init_listener() {
	if (typeof window == "undefined") {
		return;
	}
	window.addEventListener("popstate", () => {
		const state = parse_hash();
		window.dispatchEvent(new CustomEvent(ROUTE_CHANGE, { detail: state }));
	});
}

export {
	ROUTE_CHANGE,
	get_hash,
	parse_hash,
	build_hash,
	get_base_url,
	replace_state,
	push_state,
	init_listener
};
