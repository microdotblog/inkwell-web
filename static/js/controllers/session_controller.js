import { Controller } from "../stimulus.js";
import { parse_hash, ROUTE_CHANGE } from "../router.js?20260322.1";

export default class extends Controller {
	connect() {
		this.currentPost = null;
		this.layout_element = this.element.querySelector(".layout");
		this.handlePostOpen = this.handlePostOpen.bind(this);
		this.handleDetailOpen = this.handleDetailOpen.bind(this);
		this.handleDetailClose = this.handleDetailClose.bind(this);
		this.handleUrlChange = this.handleUrlChange.bind(this);
		window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("reader:summary", this.handleDetailOpen);
		window.addEventListener("reader:resolvingRoute", this.handleDetailOpen);
		window.addEventListener("subscriptions:open", this.handleDetailOpen);
		window.addEventListener("highlights:open", this.handleDetailOpen);
		window.addEventListener("discover:open", this.handleDetailOpen);
		window.addEventListener("reader:clear", this.handleDetailClose);
		window.addEventListener("reader:welcome", this.handleDetailClose);
		window.addEventListener("reader:blank", this.handleDetailClose);
		window.addEventListener(ROUTE_CHANGE, this.handleUrlChange);
		const route = parse_hash();
		this.setDetailOpen(this.isRoutedDetailOpen(route));
	}

	disconnect() {
		window.removeEventListener("post:open", this.handlePostOpen);
		window.removeEventListener("reader:summary", this.handleDetailOpen);
		window.removeEventListener("reader:resolvingRoute", this.handleDetailOpen);
		window.removeEventListener("subscriptions:open", this.handleDetailOpen);
		window.removeEventListener("highlights:open", this.handleDetailOpen);
		window.removeEventListener("discover:open", this.handleDetailOpen);
		window.removeEventListener("reader:clear", this.handleDetailClose);
		window.removeEventListener("reader:welcome", this.handleDetailClose);
		window.removeEventListener("reader:blank", this.handleDetailClose);
		window.removeEventListener(ROUTE_CHANGE, this.handleUrlChange);
	}

	handlePostOpen(event) {
		this.currentPost = event.detail.post;
		this.dispatch("change", { detail: { post: this.currentPost }, prefix: "session" });
		this.setDetailOpen(true);
	}

	handleDetailOpen() {
		this.setDetailOpen(true);
	}

	handleDetailClose() {
		this.currentPost = null;
		if (this.isRoutedDetailOpen(parse_hash())) {
			this.setDetailOpen(true);
			return;
		}
		this.setDetailOpen(false);
	}

	showTimeline(event) {
		event?.preventDefault();
		window.dispatchEvent(new CustomEvent("subscriptions:close"));
		window.dispatchEvent(new CustomEvent("timeline:back"));
		this.setDetailOpen(false);
	}

	handleUrlChange(event) {
		const route = event.detail || parse_hash();
		if (this.isRoutedDetailOpen(route)) {
			this.setDetailOpen(true);
			return;
		}
		if (!this.currentPost) {
			this.setDetailOpen(false);
		}
	}

	setDetailOpen(is_open) {
		if (!this.layout_element) {
			this.layout_element = this.element.querySelector(".layout");
		}
		if (!this.layout_element) {
			return;
		}
		this.layout_element.classList.toggle("is-detail-open", Boolean(is_open));
	}

	isRoutedDetailOpen(route) {
		return Boolean(route?.postId || route?.pane);
	}
}
