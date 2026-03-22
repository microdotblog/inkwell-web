const ROUTE_CHANGE = "url:change";
const PANE_ROUTES = new Set(["feeds", "bookmarks", "highlights", "discover"]);
let last_known_hash = "";

function normalize_hash(raw_hash) {
	return `${raw_hash || ""}`.replace(/^#/, "").trim();
}

function get_hash() {
	const raw = typeof window != "undefined" && window.location ? window.location.hash : "";
	return normalize_hash(raw);
}

function parse_hash(hash_string) {
	const hash = normalize_hash(hash_string != null ? hash_string : get_hash());
	if (hash == "" || hash == "/") {
		return { feedId: null, feedUrl: null, postId: null, pane: null };
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
			postId: segments[3],
			pane: null
		};
	}

	if (segments[0] == "feed" && segments[1]) {
		return {
			feedId: segments[1],
			feedUrl: null,
			postId: null,
			pane: null
		};
	}

	if (segments[0] == "feed" && params.has("url")) {
		return {
			feedId: null,
			feedUrl: params.get("url"),
			postId: null,
			pane: null
		};
	}

	if (segments[0] == "post" && segments[1]) {
		return {
			feedId: null,
			feedUrl: null,
			postId: segments[1],
			pane: null
		};
	}

	if (segments.length == 1 && PANE_ROUTES.has(segments[0])) {
		return {
			feedId: null,
			feedUrl: null,
			postId: null,
			pane: segments[0]
		};
	}

	return { feedId: null, feedUrl: null, postId: null, pane: null };
}

function build_hash(state) {
	const feed_id = state.feedId != null && state.feedId != "" ? state.feedId : null;
	const post_id = state.postId != null && state.postId != "" ? state.postId : null;
	const pane = state.pane != null && state.pane != "" ? state.pane : null;

	if (pane && PANE_ROUTES.has(pane)) {
		return `#/${pane}`;
	}

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
	last_known_hash = normalize_hash(hash);
	window.history.replaceState({ route: state }, document.title, url);
}

function push_state(state) {
	const hash = build_hash(state);
	const url = get_base_url() + hash;
	last_known_hash = normalize_hash(hash);
	window.history.pushState({ route: state }, document.title, url);
}

function dispatch_route_change() {
	const hash = get_hash();
	if (hash == last_known_hash) {
		return;
	}
	last_known_hash = hash;
	window.dispatchEvent(new CustomEvent(ROUTE_CHANGE, { detail: parse_hash(hash) }));
}

function init_listener() {
	if (typeof window == "undefined") {
		return;
	}
	last_known_hash = get_hash();
	window.addEventListener("popstate", dispatch_route_change);
	window.addEventListener("hashchange", dispatch_route_change);
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
