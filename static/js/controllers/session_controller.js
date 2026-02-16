import { Controller } from "../stimulus.js";
import { parse_hash } from "../router.js";

export default class extends Controller {
	connect() {
		this.currentPost = null;
		this.layout_element = this.element.querySelector(".layout");
		this.handlePostOpen = this.handlePostOpen.bind(this);
		this.handleDetailOpen = this.handleDetailOpen.bind(this);
		this.handleDetailClose = this.handleDetailClose.bind(this);
		window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("reader:summary", this.handleDetailOpen);
		window.addEventListener("reader:resolvingRoute", this.handleDetailOpen);
		window.addEventListener("subscriptions:open", this.handleDetailOpen);
		window.addEventListener("highlights:open", this.handleDetailOpen);
		window.addEventListener("reader:clear", this.handleDetailClose);
		window.addEventListener("reader:welcome", this.handleDetailClose);
		window.addEventListener("reader:blank", this.handleDetailClose);
		const route = parse_hash();
		this.setDetailOpen(Boolean(route.postId));
	}

	disconnect() {
		window.removeEventListener("post:open", this.handlePostOpen);
		window.removeEventListener("reader:summary", this.handleDetailOpen);
		window.removeEventListener("reader:resolvingRoute", this.handleDetailOpen);
		window.removeEventListener("subscriptions:open", this.handleDetailOpen);
		window.removeEventListener("highlights:open", this.handleDetailOpen);
		window.removeEventListener("reader:clear", this.handleDetailClose);
		window.removeEventListener("reader:welcome", this.handleDetailClose);
		window.removeEventListener("reader:blank", this.handleDetailClose);
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
		this.setDetailOpen(false);
	}

	showTimeline(event) {
		event?.preventDefault();
		this.setDetailOpen(false);
		window.dispatchEvent(new CustomEvent("timeline:back"));
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
}
