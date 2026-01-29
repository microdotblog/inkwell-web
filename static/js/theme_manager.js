const DEFAULT_THEME_URL = "/themes/default.json?20260121.1";
const CUSTOM_THEMES_KEY = "inkwell_custom_themes";
const ACTIVE_THEME_KEY = "inkwell_active_theme";

let default_theme = { name: "Default", slug: "default", colors: {} };
let themes = [];
let active_theme = null;
let is_loading = false;

export async function initThemes() {
	if (is_loading) {
		return;
	}

	is_loading = true;
	default_theme = await loadDefaultTheme();
	const stored_themes = getStoredThemes();
	themes = [default_theme, ...stored_themes];
	const stored_active = localStorage.getItem(ACTIVE_THEME_KEY);
	const selected_theme = themes.find((theme) => theme.slug == stored_active) || default_theme;
	applyTheme(selected_theme, { persist: true });
	dispatchThemesUpdated();
	is_loading = false;
}

export function getThemes() {
	return themes;
}

export function getActiveTheme() {
	return active_theme;
}

export function applyThemeBySlug(slug) {
	if (!slug) {
		return;
	}
	const match = themes.find((theme) => theme.slug == slug);
	if (!match) {
		return;
	}
	applyTheme(match, { persist: true });
	dispatchThemesUpdated();
}

export function addTheme(theme_input) {
	const cleaned = normalizeTheme(theme_input);
	const stored = getStoredThemes();
	const cleaned_name = cleaned.name.toLowerCase();
	const filtered = stored.filter((theme) => {
		if (theme.slug == cleaned.slug) {
			return false;
		}
		const theme_name = typeof theme.name == "string" ? theme.name.trim().toLowerCase() : "";
		if (theme_name && theme_name == cleaned_name) {
			return false;
		}
		return true;
	});
	const updated = [cleaned, ...filtered];
	setStoredThemes(updated);
	themes = [default_theme, ...updated];
	applyTheme(cleaned, { persist: true });
	dispatchThemesUpdated();
	return cleaned;
}

export function removeThemeBySlug(slug) {
	if (!slug || slug == "default") {
		return null;
	}

	const stored = getStoredThemes();
	const updated = stored.filter((theme) => theme.slug != slug);
	if (updated.length == stored.length) {
		return null;
	}

	setStoredThemes(updated);
	themes = [default_theme, ...updated];

	const removed_active = active_theme && active_theme.slug == slug;
	if (removed_active) {
		applyTheme(default_theme, { persist: true });
	}

	dispatchThemesUpdated();
	return slug;
}

function applyTheme(theme, options = {}) {
	if (!theme) {
		return;
	}

	const merged_theme = mergeWithDefault(theme);
	active_theme = merged_theme;
	const colors = merged_theme.colors || {};
	Object.entries(colors).forEach(([key, value]) => {
		if (!key || typeof value != "string") {
			return;
		}
		document.documentElement.style.setProperty(key, value);
	});

	if (options.persist != false) {
		const slug = theme.slug || merged_theme.slug;
		if (slug) {
			localStorage.setItem(ACTIVE_THEME_KEY, slug);
		}
	}

	document.documentElement.dataset.theme = merged_theme.slug || "";
	window.dispatchEvent(new CustomEvent("themes:applied", { detail: { theme: merged_theme } }));
}

async function loadDefaultTheme() {
	try {
		const response = await fetch(DEFAULT_THEME_URL, { cache: "no-store" });
		if (!response.ok) {
			throw new Error("Failed to load default theme");
		}
		const payload = await response.json();
		return normalizeTheme(payload, { allow_empty_colors: true, allow_default_name: true });
	}
	catch (error) {
		console.warn("Unable to load default theme", error);
		return {
			name: "Default",
			slug: "default",
			colors: {}
		};
	}
}

function normalizeTheme(theme, options = {}) {
	if (!theme || typeof theme != "object") {
		throw new Error("Theme must be a JSON object.");
	}

	const name = typeof theme.name == "string" ? theme.name.trim() : "";
	if (!name) {
		throw new Error("Theme must include a name.");
	}
	if (name.toLowerCase() == "default" && options.allow_default_name != true) {
		throw new Error("Theme name \"Default\" is reserved.");
	}

	const colors = theme.colors && typeof theme.colors == "object" ? theme.colors : {};
	const cleaned_colors = {};
	Object.entries(colors).forEach(([key, value]) => {
		if (typeof value != "string") {
			return;
		}
		const trimmed_key = key.trim();
		const trimmed_value = value.trim();
		if (!trimmed_key || !trimmed_value) {
			return;
		}
		cleaned_colors[trimmed_key] = trimmed_value;
	});

	if (!options.allow_empty_colors && Object.keys(cleaned_colors).length == 0) {
		throw new Error("Theme colors cannot be empty.");
	}

	const slug = slugify(name);

	return {
		name,
		slug,
		colors: cleaned_colors
	};
}

function mergeWithDefault(theme) {
	if (!default_theme) {
		return theme;
	}
	const base_colors = default_theme.colors || {};
	const theme_colors = theme.colors || {};
	return {
		...theme,
		colors: {
			...base_colors,
			...theme_colors
		}
	};
}

function slugify(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.trim();
}

function dispatchThemesUpdated() {
	window.dispatchEvent(
		new CustomEvent("themes:updated", { detail: { themes, active: active_theme } })
	);
}

function getStoredThemes() {
	try {
		const stored = localStorage.getItem(CUSTOM_THEMES_KEY);
		if (!stored) {
			return [];
		}
		const parsed = JSON.parse(stored);
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed.filter((item) => item && typeof item == "object");
	}
	catch (error) {
		return [];
	}
}

function setStoredThemes(stored_themes) {
	try {
		if (!stored_themes || stored_themes.length == 0) {
			localStorage.removeItem(CUSTOM_THEMES_KEY);
			return;
		}
		localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(stored_themes));
	}
	catch (error) {
		// Ignore storage errors.
	}
}
