import { Controller } from "../stimulus.js";
import {
	createFeedSubscription,
	deleteFeedSubscription,
	fetchFeedSubscriptions
} from "../api/feeds.js";

export default class extends Controller {
	static targets = [
		"pane",
		"list",
		"formWrapper",
		"input",
		"submit",
		"spinner",
		"status",
		"readerView"
	];

	connect() {
		this.subscriptions = [];
		this.is_loading = false;
		this.is_submitting = false;
		this.is_visible = false;
		this.mode = "manage";
		this.handleOpen = this.handleOpen.bind(this);
		this.handleAuthReady = this.handleAuthReady.bind(this);
		this.handlePostOpen = this.handlePostOpen.bind(this);
		window.addEventListener("subscriptions:open", this.handleOpen);
		window.addEventListener("auth:ready", this.handleAuthReady);
		window.addEventListener("post:open", this.handlePostOpen);
	}

	disconnect() {
		window.removeEventListener("subscriptions:open", this.handleOpen);
		window.removeEventListener("auth:ready", this.handleAuthReady);
		window.removeEventListener("post:open", this.handlePostOpen);
	}

	handleAuthReady() {
		if (this.is_visible) {
			this.loadSubscriptions();
		}
	}

	handleOpen(event) {
		const mode = event.detail?.mode || "manage";
		this.mode = mode;
		this.showPane();
		this.updateFormVisibility();
		this.loadSubscriptions();
		this.clearStatus();

		if (this.mode === "subscribe") {
			requestAnimationFrame(() => {
				this.inputTarget.focus();
			});
		}
	}

	handlePostOpen() {
		this.hidePane();
		this.setReaderEmptyState(false);
	}

	showPane() {
		if (this.is_visible) {
			return;
		}
		this.paneTarget.hidden = false;
		this.readerViewTarget.hidden = true;
		this.is_visible = true;
		this.setReaderEmptyState(false);
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

	updateFormVisibility() {
		const show_form = this.mode === "subscribe";
		this.formWrapperTarget.hidden = !show_form;
		if (!show_form) {
			this.setSubmitting(false);
			this.clearStatus();
		}
	}

	async loadSubscriptions() {
		if (this.is_loading) {
			return;
		}
		this.is_loading = true;
		this.renderLoading();

		try {
			const payload = await fetchFeedSubscriptions();
			this.subscriptions = Array.isArray(payload) ? payload : [];
		}
		catch (error) {
			console.warn("Failed to load subscriptions", error);
			this.subscriptions = [];
			this.showStatus("Unable to load subscriptions.");
		}
		finally {
			this.is_loading = false;
			this.render();
		}
	}

	async subscribe(event) {
		event.preventDefault();
		if (this.is_submitting) {
			return;
		}

		const feed_url = this.inputTarget.value.trim();
		if (!feed_url) {
			this.showStatus("Enter a feed URL to subscribe.");
			return;
		}

		this.setSubmitting(true);
		this.clearStatus();

		try {
			const payload = await createFeedSubscription(feed_url);
			if (Array.isArray(payload)) {
				this.showStatus("Multiple feeds found. Please enter a specific feed URL.");
				return;
			}
			this.inputTarget.value = "";
			await this.loadSubscriptions();
			this.showStatus("Subscription added.");
		}
		catch (error) {
			console.warn("Failed to add subscription", error);
			this.showStatus("Subscription failed. Please try again.");
		}
		finally {
			this.setSubmitting(false);
		}
	}

	async remove(event) {
		const item = event.currentTarget.closest("[data-subscription-id]");
		const subscription_id = item?.dataset.subscriptionId;
		if (!subscription_id) {
			return;
		}

		const button = event.currentTarget;
		button.disabled = true;
		this.clearStatus();

		try {
			await deleteFeedSubscription(subscription_id);
			await this.loadSubscriptions();
		}
		catch (error) {
			console.warn("Failed to remove subscription", error);
			this.showStatus("Unable to remove feed.");
		}
		finally {
			button.disabled = false;
		}
	}

	renderLoading() {
		this.listTarget.innerHTML = "<p class=\"subscriptions-empty\">Loading subscriptions...</p>";
	}

	render() {
		if (this.is_loading) {
			return;
		}

		const sorted = [...this.subscriptions].sort((left, right) => {
			const left_title = this.getSubscriptionTitle(left);
			const right_title = this.getSubscriptionTitle(right);
			return left_title.localeCompare(right_title);
		});

		if (sorted.length === 0) {
			this.listTarget.innerHTML = "<p class=\"subscriptions-empty\">No subscriptions yet.</p>";
			return;
		}

		const items = sorted
			.map((subscription) => {
				const title = this.escapeHtml(this.getSubscriptionTitle(subscription));
				const url = this.escapeHtml(this.getSubscriptionUrl(subscription));
				const link = url ? `<a href="${url}">${url}</a>` : "";
				return `
					<div class="subscription-item" data-subscription-id="${subscription.id}">
						<div class="subscription-info">
							<p class="subscription-title">${title}</p>
							<p class="subscription-url">${link}</p>
						</div>
						<button type="button" class="subscription-remove btn-sm" data-action="subscriptions#remove">
							Remove
						</button>
					</div>
				`;
			})
			.join("");

		this.listTarget.innerHTML = items;
	}

	getSubscriptionTitle(subscription) {
		const title = subscription?.title || subscription?.site_url || subscription?.feed_url || "";
		return title.trim() || "Untitled feed";
	}

	getSubscriptionUrl(subscription) {
		const url = subscription?.site_url || subscription?.feed_url || "";
		return url.trim();
	}

	setSubmitting(is_submitting) {
		this.is_submitting = is_submitting;
		this.spinnerTarget.hidden = !is_submitting;
		this.inputTarget.disabled = is_submitting;
		this.submitTarget.disabled = is_submitting;
	}

	showStatus(message) {
		if (!message) {
			this.clearStatus();
			return;
		}
		this.statusTarget.textContent = message;
		this.statusTarget.hidden = false;
	}

	clearStatus() {
		this.statusTarget.textContent = "";
		this.statusTarget.hidden = true;
	}

	resetScrollPosition() {
		this.element.scrollTop = 0;
	}

	restoreReaderEmptyState() {
		this.setReaderEmptyState(this.isReaderEmpty());
	}

	setReaderEmptyState(is_empty) {
		this.element.classList.toggle("is-empty", is_empty);
	}

	isReaderEmpty() {
		const content = this.readerViewTarget.querySelector("[data-reader-target=\"content\"]");
		return !content?.dataset.postId;
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
