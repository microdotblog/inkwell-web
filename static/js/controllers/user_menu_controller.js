import { Controller } from "../stimulus.js";

const HIDE_READ_KEY = "inkwell_hide_read";

export default class extends Controller {
	static targets = ["button", "popover", "toggleReadPosts"];

	connect() {
		this.handleDocumentClick = this.handleDocumentClick.bind(this);
		this.handleKeydown = this.handleKeydown.bind(this);
	}

	disconnect() {
		this.removeListeners();
	}

	toggle() {
		if (this.popoverTarget.hidden) {
			this.open();
			return;
		}
		this.close();
	}

	open() {
		this.updateHideReadLabel();
		this.popoverTarget.hidden = false;
		this.buttonTarget.setAttribute("aria-expanded", "true");
		document.addEventListener("click", this.handleDocumentClick);
		document.addEventListener("keydown", this.handleKeydown);
	}

	close() {
		if (this.popoverTarget.hidden) {
			return;
		}
		this.popoverTarget.hidden = true;
		this.buttonTarget.setAttribute("aria-expanded", "false");
		this.removeListeners();
	}

	markAllRead() {
		window.dispatchEvent(new CustomEvent("timeline:markAllRead"));
	}

	refresh() {
		window.dispatchEvent(new CustomEvent("timeline:sync"));
	}

	toggleHideRead() {
		window.dispatchEvent(new CustomEvent("timeline:toggleHideRead"));
		this.updateHideReadLabel();
	}

	updateHideReadLabel() {
		if (!this.hasToggleReadPostsTarget) {
			return;
		}
		const stored_hide_read = localStorage.getItem(HIDE_READ_KEY);
		const is_hide_read = stored_hide_read == "true";
		this.toggleReadPostsTarget.textContent = is_hide_read ? "Show Read Posts" : "Hide Read Posts";
	}

	openSubscriptions(event) {
		const menu_mode = event.currentTarget?.dataset.userMenuMode || "manage";
		window.dispatchEvent(
			new CustomEvent("subscriptions:open", { detail: { mode: menu_mode } })
		);
	}

	openHelp() {
		window.dispatchEvent(new CustomEvent("reader:welcome"));
		window.dispatchEvent(new CustomEvent("subscriptions:close"));
	}

	openThemes() {
		window.dispatchEvent(new CustomEvent("themes:open"));
	}

	handleDocumentClick(event) {
		if (this.element.contains(event.target)) {
			return;
		}
		this.close();
	}

	handleKeydown(event) {
		if (event.key == "Escape") {
			this.close();
		}
	}

	removeListeners() {
		document.removeEventListener("click", this.handleDocumentClick);
		document.removeEventListener("keydown", this.handleKeydown);
	}
}
