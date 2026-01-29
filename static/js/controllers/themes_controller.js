import { Controller } from "../stimulus.js";
import { addTheme, applyThemeBySlug, getActiveTheme, getThemes, removeThemeBySlug } from "../theme_manager.js?20260121.1";

export default class extends Controller {
	static targets = [
		"pane",
		"list",
		"importWrapper",
		"importInput",
		"importStatus",
		"readerView"
	];

	connect() {
		this.is_visible = false;
		this.was_empty = false;
		this.handleOpen = this.handleOpen.bind(this);
		this.handleClose = this.handleClose.bind(this);
		this.handleSubscriptionsOpen = this.handleSubscriptionsOpen.bind(this);
		this.handleThemesUpdated = this.handleThemesUpdated.bind(this);
		this.handlePostOpen = this.handlePostOpen.bind(this);
		window.addEventListener("themes:open", this.handleOpen);
		window.addEventListener("themes:close", this.handleClose);
		window.addEventListener("subscriptions:open", this.handleSubscriptionsOpen);
		window.addEventListener("themes:updated", this.handleThemesUpdated);
		window.addEventListener("post:open", this.handlePostOpen);
		this.renderThemes();
	}

	disconnect() {
		window.removeEventListener("themes:open", this.handleOpen);
		window.removeEventListener("themes:close", this.handleClose);
		window.removeEventListener("subscriptions:open", this.handleSubscriptionsOpen);
		window.removeEventListener("themes:updated", this.handleThemesUpdated);
		window.removeEventListener("post:open", this.handlePostOpen);
	}

	handleOpen() {
		this.showPane();
	}

	handleClose() {
		this.hidePane();
	}

	handleSubscriptionsOpen() {
		this.hidePane();
	}

	handleThemesUpdated() {
		this.renderThemes();
	}

	handlePostOpen() {
		this.hidePane();
	}

	showPane() {
		if (this.is_visible) {
			return;
		}
		window.dispatchEvent(new CustomEvent("subscriptions:close"));
		this.paneTarget.hidden = false;
		this.readerViewTarget.hidden = true;
		this.was_empty = this.isReaderEmpty();
		this.setReaderEmptyState(false);
		this.is_visible = true;
		this.resetScrollPosition();
	}

	hidePane() {
		if (!this.is_visible) {
			return;
		}
		this.paneTarget.hidden = true;
		this.readerViewTarget.hidden = false;
		this.is_visible = false;
		this.restoreReaderEmptyState();
	}

	resetScrollPosition() {
		this.element.scrollTop = 0;
	}

	setReaderEmptyState(is_empty) {
		this.element.classList.toggle("is-empty", is_empty);
	}

	restoreReaderEmptyState() {
		this.setReaderEmptyState(this.was_empty);
	}

	isReaderEmpty() {
		const content = this.readerViewTarget.querySelector("[data-reader-target=\"content\"]");
		return !content?.dataset.postId;
	}

	toggleImport() {
		const is_open = !this.importWrapperTarget.hidden;
		this.importWrapperTarget.hidden = is_open;
		if (!is_open) {
			this.importInputTarget.value = "";
			this.clearStatus();
			requestAnimationFrame(() => {
				this.importInputTarget.focus();
			});
		}
	}

	cancelImport() {
		this.importWrapperTarget.hidden = true;
		this.importInputTarget.value = "";
		this.clearStatus();
	}

	installTheme() {
		const raw_text = this.importInputTarget.value.trim();
		if (!raw_text) {
			this.showStatus("Paste a theme definition to install.");
			return;
		}

		let payload = null;
		try {
			payload = JSON.parse(raw_text);
		}
		catch (error) {
			this.showStatus("Theme JSON could not be parsed.");
			return;
		}

		try {
			const theme = addTheme(payload);
			this.importInputTarget.value = "";
			this.showStatus(`Installed ${theme.name}.`);
		}
		catch (error) {
			this.showStatus(error.message || "Theme could not be installed.");
		}
	}

	applyTheme(event) {
		const theme_slug = event.currentTarget?.dataset.themeSlug;
		if (!theme_slug) {
			return;
		}
		applyThemeBySlug(theme_slug);
	}

	uninstallTheme(event) {
		const theme_slug = event.currentTarget?.dataset.themeSlug;
		if (!theme_slug) {
			return;
		}
		removeThemeBySlug(theme_slug);
	}

	renderThemes() {
		const themes = getThemes();
		const active_theme = getActiveTheme();
		if (!themes || themes.length == 0) {
			this.listTarget.innerHTML = "<p class=\"themes-empty\">No themes available yet.</p>";
			return;
		}

		const rows = themes.map((theme) => {
			const is_active = active_theme && active_theme.slug == theme.slug;
			const is_default = theme.slug == "default";
			const use_action = is_active
				? "<span class=\"theme-active\">Active</span>"
				: `<button type=\"button\" class=\"btn-sm\" data-theme-slug=\"${theme.slug}\" data-action=\"themes#applyTheme\">Use Theme</button>`;
			const uninstall_action = is_default || is_active
				? ""
				: `<button type=\"button\" class=\"btn-sm is-destructive\" data-theme-slug=\"${theme.slug}\" data-action=\"themes#uninstallTheme\">Uninstall</button>`;
			const action = `${use_action}${uninstall_action ? `\n\t\t\t\t\t\t${uninstall_action}` : ""}`;
			const safe_name = this.escapeHtml(theme.name);
			return `
				<div class=\"theme-item\" data-theme-slug=\"${theme.slug}\">
					<div class=\"theme-info\">
						<p class=\"theme-title\">${safe_name}</p>
					</div>
					<div class=\"theme-actions\">
						${action}
					</div>
				</div>
			`;
		});

		this.listTarget.innerHTML = rows.join("");
	}

	showStatus(message) {
		if (!message) {
			this.clearStatus();
			return;
		}
		this.importStatusTarget.textContent = message;
		this.importStatusTarget.hidden = false;
	}

	clearStatus() {
		this.importStatusTarget.textContent = "";
		this.importStatusTarget.hidden = true;
	}

	escapeHtml(value) {
		const text = value || "";
		return text.replace(/[&<>"']/g, (character) => {
			switch (character) {
				case "&":
					return "&amp;";
				case "<":
					return "&lt;";
				case ">":
					return "&gt;";
				case "\"":
					return "&quot;";
				case "'":
					return "&#39;";
				default:
					return character;
			}
		});
	}
}
