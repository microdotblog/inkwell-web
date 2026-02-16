const DEFAULT_THEME_URL = "/themes/default.json?20260216.1";
const DARK_THEME_URL = "/themes/dark.json?20260216.1";

let default_theme = create_theme("Default", "default", {});
let dark_theme = create_theme("Dark", "dark", {});
let active_theme = null;
let is_loading = false;
let color_scheme_query = null;
let applied_color_keys = new Set();

export async function initThemes() {
	if (is_loading) {
		return;
	}

	is_loading = true;

	const [loaded_default, loaded_dark] = await Promise.all([
		load_theme(DEFAULT_THEME_URL, "Default", "default"),
		load_theme(DARK_THEME_URL, "Dark", "dark")
	]);

	default_theme = loaded_default;
	dark_theme = merge_themes(default_theme, loaded_dark, "Dark", "dark");
	apply_preferred_theme();
	start_color_scheme_listener();
	is_loading = false;
}

function apply_preferred_theme() {
	const next_theme = prefers_dark_mode() ? dark_theme : default_theme;
	apply_theme(next_theme);
}

function start_color_scheme_listener() {
	if (color_scheme_query || typeof window == "undefined" || typeof window.matchMedia != "function") {
		return;
	}

	color_scheme_query = window.matchMedia("(prefers-color-scheme: dark)");
	const handle_change = () => {
		apply_preferred_theme();
	};

	if (typeof color_scheme_query.addEventListener == "function") {
		color_scheme_query.addEventListener("change", handle_change);
		return;
	}

	if (typeof color_scheme_query.addListener == "function") {
		color_scheme_query.addListener(handle_change);
	}
}

function prefers_dark_mode() {
	if (typeof window == "undefined" || typeof window.matchMedia != "function") {
		return false;
	}
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply_theme(theme) {
	if (!theme || typeof document == "undefined") {
		return;
	}

	active_theme = theme;
	const colors = theme.colors || {};
	const color_entries = Object.entries(colors).filter(([key, value]) => {
		return Boolean(key) && typeof value == "string";
	});
	const next_color_keys = new Set(color_entries.map(([key]) => key));

	applied_color_keys.forEach((key) => {
		if (!next_color_keys.has(key)) {
			document.documentElement.style.removeProperty(key);
		}
	});

	color_entries.forEach(([key, value]) => {
		document.documentElement.style.setProperty(key, value);
	});

	applied_color_keys = next_color_keys;

	document.documentElement.dataset.theme = theme.slug || "default";
	window.dispatchEvent(new CustomEvent("theme:applied", { detail: { theme: active_theme } }));
}

async function load_theme(url, fallback_name, fallback_slug) {
	try {
		const response = await fetch(url, { cache: "no-store" });
		if (!response.ok) {
			throw new Error(`Failed to load theme from ${url}`);
		}
		const payload = await response.json();
		return normalize_theme(payload, fallback_name, fallback_slug);
	}
	catch (error) {
		console.warn(`Unable to load theme from ${url}`, error);
		return create_theme(fallback_name, fallback_slug, {});
	}
}

function normalize_theme(theme, fallback_name, fallback_slug) {
	if (!theme || typeof theme != "object") {
		return create_theme(fallback_name, fallback_slug, {});
	}

	const raw_name = typeof theme.name == "string" ? theme.name.trim() : "";
	const name = raw_name || fallback_name;
	const raw_slug = typeof theme.slug == "string" ? theme.slug.trim() : "";
	const computed_slug = raw_slug || slugify(name) || fallback_slug;
	const colors = theme.colors && typeof theme.colors == "object" ? theme.colors : {};
	const cleaned_colors = {};

	Object.entries(colors).forEach(([key, value]) => {
		if (typeof key != "string" || typeof value != "string") {
			return;
		}

		const trimmed_key = key.trim();
		const trimmed_value = value.trim();
		if (!trimmed_key || !trimmed_value) {
			return;
		}

		cleaned_colors[trimmed_key] = trimmed_value;
	});

	return create_theme(name, computed_slug, cleaned_colors);
}

function merge_themes(base_theme, override_theme, fallback_name, fallback_slug) {
	const base_colors = base_theme?.colors || {};
	const override_colors = override_theme?.colors || {};
	const name = override_theme?.name || fallback_name;
	const slug = override_theme?.slug || fallback_slug;

	return create_theme(name, slug, {
		...base_colors,
		...override_colors
	});
}

function create_theme(name, slug, colors) {
	return {
		name,
		slug,
		colors: colors || {}
	};
}

function slugify(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		trim();
}
