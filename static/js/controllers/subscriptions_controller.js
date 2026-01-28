import { Controller } from "../stimulus.js";
import { mockSubscriptions } from "../mock_data.js";
import { USE_MOCK_DATA } from "../config.js";
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
		"readerView",
		"importInput",
		"importButton",
		"importStatus",
		"importCancel",
		"importProgress",
		"importText",
		"failedSection",
		"failedList"
	];

	connect() {
		this.subscriptions = [];
		this.is_loading = false;
		this.is_submitting = false;
		this.is_importing = false;
		this.is_visible = false;
		this.failed_list_visible = false;
		this.cancel_import = false;
		this.failed_imports_storage_key = "inkwell_failed_import_urls";
		this.mode = "manage";
		this.import_delay_ms = 250;
		this.handleOpen = this.handleOpen.bind(this);
		this.handleClose = this.handleClose.bind(this);
		this.handleAuthReady = this.handleAuthReady.bind(this);
		this.handlePostOpen = this.handlePostOpen.bind(this);
		window.addEventListener("subscriptions:open", this.handleOpen);
		window.addEventListener("subscriptions:close", this.handleClose);
		window.addEventListener("auth:ready", this.handleAuthReady);
		window.addEventListener("post:open", this.handlePostOpen);
		this.resetImportStatus();
		this.setImporting(this.is_importing);
	}

	disconnect() {
		window.removeEventListener("subscriptions:open", this.handleOpen);
		window.removeEventListener("subscriptions:close", this.handleClose);
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
		this.element.hidden = false;
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

	handleClose() {
		this.hidePane();
	}

	startNewFeed(event) {
		event.preventDefault();
		this.mode = "subscribe";
		this.updateFormVisibility();
		this.clearStatus();
		requestAnimationFrame(() => {
			this.inputTarget.focus();
		});
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
			if (USE_MOCK_DATA) {
				this.subscriptions = [...mockSubscriptions];
				this.clearStatus();
			}
			else {
				this.subscriptions = [];
				let response_text = "";
				if (error && typeof error.response_text == "string") {
					response_text = error.response_text.trim();
				}
				const status_message = response_text
					? `Unable to load subscriptions. ${response_text}`
					: "Unable to load subscriptions.";
				this.showStatus(status_message);
			}
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

	importSubscriptions(event) {
		event.preventDefault();
		if (this.is_importing) {
			return;
		}
		this.clearStatus();
		this.importInputTarget.value = "";
		this.importInputTarget.click();
	}

	async importFileSelected(event) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		await this.importOpmlFile(file);
	}

	async importOpmlFile(file) {
		if (this.is_importing) {
			return;
		}

		this.is_importing = true;
		this.cancel_import = false;
		this.clearFailedImports();
		this.setImporting(true);
		this.clearStatus();

		try {
			const file_text = await file.text();
			const feed_urls = this.extractOpmlFeedUrls(file_text);
			if (!Array.isArray(feed_urls) || feed_urls.length == 0) {
				this.showStatus("No feeds found in the OPML file.");
				return;
			}

			this.setImportProgress(0, feed_urls.length, 0);
			const totals = await this.importFeedUrls(feed_urls);
			await this.loadSubscriptions();
			if (this.cancel_import) {
				return;
			}

			if (totals.failed_count == 0) {
				this.showStatus(`Imported ${totals.imported_count} feeds.`);
			}
			else {
				const success_count = totals.imported_count - totals.failed_count;
				this.showStatus(`Imported ${success_count} feeds. ${totals.failed_count} failed.`);
			}
		}
		catch (error) {
			console.warn("Failed to import OPML", error);
			this.showStatus("Unable to import OPML file.");
		}
		finally {
			this.cancel_import = false;
			this.setImporting(false);
		}
	}

	async importFeedUrls(feed_urls) {
		let imported_count = 0;
		let failed_count = 0;

		for (const feed_url of feed_urls) {
			if (this.cancel_import) {
				break;
			}
			try {
				const payload = await createFeedSubscription(feed_url);
				if (Array.isArray(payload)) {
					throw new Error("Multiple feeds found");
				}
			}
			catch (error) {
				if (!this.cancel_import) {
					failed_count += 1;
					this.addFailedImportUrl(feed_url);
				}
			}
			imported_count += 1;
			if (this.cancel_import) {
				break;
			}
			this.setImportProgress(imported_count, feed_urls.length, failed_count);
			if (this.cancel_import) {
				break;
			}
			await this.delay(this.import_delay_ms);
		}

		return { imported_count, failed_count };
	}

	extractOpmlFeedUrls(opml_text) {
		const parser = new DOMParser();
		const doc = parser.parseFromString(opml_text, "text/xml");
		const parser_error = doc.querySelector("parsererror");
		if (parser_error) {
			throw new Error("Invalid OPML");
		}

		const outlines = Array.from(doc.querySelectorAll("outline"));
		const feed_urls = outlines
			.map((outline) => {
				const xml_url = this.getOutlineAttribute(outline, ["xmlUrl", "xmlurl", "xmlURL"]);
				const html_url = this.getOutlineAttribute(outline, ["htmlUrl", "htmlurl", "htmlURL"]);
				return xml_url || html_url || "";
			})
			.filter((url) => url);

		return this.uniqueUrls(feed_urls);
	}

	getOutlineAttribute(outline, names) {
		if (!outline || !Array.isArray(names)) {
			return "";
		}
		for (const name of names) {
			const value = outline.getAttribute(name);
			if (value && value.trim()) {
				return value.trim();
			}
		}
		return "";
	}

	uniqueUrls(urls) {
		const seen = new Set();
		const unique_urls = [];
		(urls || []).forEach((url) => {
			const trimmed = (url || "").trim();
			if (!trimmed) {
				return;
			}
			const key = trimmed.toLowerCase();
			if (seen.has(key)) {
				return;
			}
			seen.add(key);
			unique_urls.push(trimmed);
		});
		return unique_urls;
	}

	setImporting(is_importing) {
		this.is_importing = is_importing;
		const failed_urls = this.getFailedImportUrls();
		const has_failed = Array.isArray(failed_urls) && failed_urls.length > 0;
		this.importStatusTarget.hidden = !(is_importing || has_failed);
		this.importButtonTarget.disabled = is_importing;
		this.importInputTarget.disabled = is_importing;
		this.importCancelTarget.hidden = !is_importing;
		if (!is_importing) {
			if (has_failed) {
				this.setImportFailedSummary(failed_urls.length);
			}
			else {
				this.setImportProgress(0, 0, 0);
			}
		}
	}

	resetImportStatus() {
		this.clearFailedImports();
		this.setImportProgress(0, 0, 0);
		this.importStatusTarget.hidden = true;
	}

	setImportProgress(completed, total, failed) {
		const safe_completed = Math.min(Number(completed) || 0, Number(total) || 0);
		const safe_total = Math.max(Number(total) || 0, 0);
		const failed_count = Math.max(Number(failed) || 0, 0);

		this.importProgressTarget.max = safe_total;
		this.importProgressTarget.value = safe_completed;

		if (safe_total == 0) {
			this.importTextTarget.textContent = "";
			return;
		}

		const feed_label = (safe_total == 1) ? "feed" : "feeds";
		let message = `Importing ${safe_total} ${feed_label}`;
		if (failed_count > 0) {
			message += ` (<a href="#" data-action="subscriptions#toggleFailedImports">${failed_count} failed</a>)`;
			this.importTextTarget.innerHTML = message;
			return;
		}
		this.importTextTarget.textContent = message;
	}

	setImportFailedSummary(failed_count) {
		const safe_failed = Math.max(Number(failed_count) || 0, 0);
		if (safe_failed == 0) {
			this.importProgressTarget.max = 0;
			this.importProgressTarget.value = 0;
			this.importTextTarget.textContent = "";
			return;
		}

		this.importProgressTarget.max = safe_failed;
		this.importProgressTarget.value = safe_failed;
		this.importTextTarget.innerHTML = `Last import (<a href="#" data-action="subscriptions#toggleFailedImports">${safe_failed} failed</a>)`;
	}

	cancelImport(event) {
		event.preventDefault();
		if (!this.is_importing) {
			this.resetImportStatus();
			return;
		}
		this.cancel_import = true;
		this.resetImportStatus();
		this.setImporting(false);
	}

	toggleFailedImports(event) {
		event.preventDefault();
		this.setFailedImportsVisible(!this.failed_list_visible);
	}

	setFailedImportsVisible(is_visible) {
		this.failed_list_visible = is_visible;
		const has_failed = this.failedListTarget.childElementCount > 0;
		this.failedSectionTarget.hidden = !(is_visible && has_failed);
	}

	getFailedImportUrls() {
		try {
			const stored = localStorage.getItem(this.failed_imports_storage_key);
			if (!stored) {
				return [];
			}
			const parsed = JSON.parse(stored);
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed
				.map((url) => (url || "").trim())
				.filter((url) => url);
		}
		catch (error) {
			return [];
		}
	}

	setFailedImportUrls(urls) {
		const cleaned = this.uniqueUrls(urls);
		try {
			if (cleaned.length == 0) {
				localStorage.removeItem(this.failed_imports_storage_key);
			}
			else {
				localStorage.setItem(this.failed_imports_storage_key, JSON.stringify(cleaned));
			}
		}
		catch (error) {
			// Ignore storage errors.
		}
		return cleaned;
	}

	clearFailedImports() {
		this.setFailedImportUrls([]);
		this.failed_list_visible = false;
		this.renderFailedImports([]);
	}

	addFailedImportUrl(url) {
		const current = this.getFailedImportUrls();
		current.push(url);
		const updated = this.setFailedImportUrls(current);
		this.renderFailedImports(updated);
	}

	renderFailedImports(failed_urls) {
		if (!Array.isArray(failed_urls) || failed_urls.length == 0) {
			this.failedListTarget.innerHTML = "";
			this.failedSectionTarget.hidden = true;
			return;
		}

		const items = failed_urls
			.map((url) => {
				const title = this.getDomainName(url) || url;
				const safe_title = this.escapeHtml(title);
				const safe_url = this.escapeHtml(url);
				return `
					<div class="subscription-item">
						<div class="subscription-info">
							<p class="subscription-title">${safe_title}</p>
							<p class="subscription-url"><a href="${safe_url}">${safe_url}</a></p>
						</div>
					</div>
				`;
			})
			.join("");

		this.failedListTarget.innerHTML = items;
		this.failedSectionTarget.hidden = !this.failed_list_visible;
	}

	delay(duration_ms) {
		return new Promise((resolve) => {
			setTimeout(resolve, duration_ms);
		});
	}

	exportSubscriptions(event) {
		event.preventDefault();
		this.clearStatus();

		if (this.is_loading) {
			this.showStatus("Loading subscriptions. Please try again.");
			return;
		}

		if (!Array.isArray(this.subscriptions) || this.subscriptions.length == 0) {
			this.showStatus("No subscriptions to export.");
			return;
		}

		const opml = this.buildOpml(this.subscriptions);
		const blob = new Blob([opml], { type: "text/xml" });
		const download_url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		const date_stamp = new Date().toISOString().slice(0, 10);
		link.href = download_url;
		link.download = `inkwell-subscriptions-${date_stamp}.opml`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(download_url);
	}

	renderLoading() {
		this.listTarget.innerHTML = "<p class=\"subscriptions-empty\"><img class=\"subscriptions-spinner\" src=\"/images/progress_spinner.svg\" alt=\"Loading subscriptions\"></p>";
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

	getSubscriptionFeedUrl(subscription) {
		const url = subscription?.feed_url || "";
		return url.trim();
	}

	getSubscriptionSiteUrl(subscription) {
		const url = subscription?.site_url || "";
		return url.trim();
	}

	buildOpml(subscriptions) {
		const created_at = new Date().toISOString();
		const sorted = [...subscriptions].sort((left, right) => {
			const left_title = this.getSubscriptionTitle(left);
			const right_title = this.getSubscriptionTitle(right);
			return left_title.localeCompare(right_title);
		});
		const outlines = sorted
			.map((subscription) => {
				const title = this.escapeHtml(this.getSubscriptionTitle(subscription));
				const feed_url = this.escapeHtml(this.getSubscriptionFeedUrl(subscription));
				const site_url = this.escapeHtml(this.getSubscriptionSiteUrl(subscription));
				const xml_url = feed_url || site_url;
				if (!xml_url) {
					return "";
				}
				const attributes = [
					`text="${title}"`,
					`title="${title}"`,
					`type="rss"`,
					xml_url ? `xmlUrl="${xml_url}"` : "",
					site_url ? `htmlUrl="${site_url}"` : ""
				]
					.filter(Boolean)
					.join(" ");
				return `\t\t<outline ${attributes} />`;
			})
			.filter(Boolean)
			.join("\n");

		const outline_block = outlines ? `${outlines}\n` : "";
		return `<?xml version="1.0" encoding="UTF-8"?>\n` +
			`<opml version="1.0">\n` +
			`\t<head>\n` +
			`\t\t<title>Inkwell Subscriptions</title>\n` +
			`\t\t<dateCreated>${created_at}</dateCreated>\n` +
			`\t</head>\n` +
			`\t<body>\n` +
			`${outline_block}` +
			`\t</body>\n` +
			`</opml>\n`;
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

	getDomainName(url) {
		if (!url || typeof url !== "string") {
			return "";
		}
		const trimmed = url.trim();
		if (!trimmed) {
			return "";
		}
		try {
			return new URL(trimmed).hostname || trimmed;
		}
		catch (error) {
			return trimmed;
		}
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
