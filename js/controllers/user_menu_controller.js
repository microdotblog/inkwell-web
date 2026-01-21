import { Controller } from "../stimulus.js";

export default class extends Controller {
  static targets = ["button", "popover"];

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

	openSubscriptions(event) {
		const menu_mode = event.currentTarget?.dataset.userMenuMode || "manage";
		window.dispatchEvent(
			new CustomEvent("subscriptions:open", { detail: { mode: menu_mode } })
		);
	}

  handleDocumentClick(event) {
    if (this.element.contains(event.target)) {
      return;
    }
    this.close();
  }

  handleKeydown(event) {
    if (event.key === "Escape") {
      this.close();
    }
  }

  removeListeners() {
    document.removeEventListener("click", this.handleDocumentClick);
    document.removeEventListener("keydown", this.handleKeydown);
  }
}
