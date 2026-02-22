import { Controller } from "../stimulus.js";
import { mockSubscriptions } from "../mock_data.js";
import { USE_MOCK_DATA } from "../config.js";
import {
	createFeedSubscription,
	deleteFeedSubscription,
	fetchFeedIcons,
	fetchFeedSubscriptions,
	isSignedIn,
	searchMicroBlogContacts,
	updateFeedSubscription
} from "../api/feeds.js";

const DEFAULT_SUBSCRIPTION_ICON_URL = "/images/blank_avatar.png";

export default class extends Controller {
	static targets = [
		"pane",
		"list",
		"formWrapper",
		"input",
		"searchInput",
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
		this.subscriptions_storage_key = "inkwell_subscriptions_cache";
		this.rename_subscription_id = "";
		this.rename_value = "";
		this.rename_is_loading = false;
		this.search_query = "";
		this.mode = "manage";
		this.import_delay_ms = 250;
		this.subscription_icon_urls = new Map();
		this.handleOpen = this.handleOpen.bind(this);
		this.handleClose = this.handleClose.bind(this);
		this.handleAuthReady = this.handleAuthReady.bind(this);
		this.handlePostOpen = this.handlePostOpen.bind(this);
		this.handleDiscoverOpen = this.handleDiscoverOpen.bind(this);
		window.addEventListener("subscriptions:open", this.handleOpen);
		window.addEventListener("subscriptions:close", this.handleClose);
		window.addEventListener("auth:ready", this.handleAuthReady);
		window.addEventListener("post:open", this.handlePostOpen);
		window.addEventListener("reader:summary", this.handlePostOpen);
		window.addEventListener("discover:open", this.handleDiscoverOpen);
		this.resetImportStatus();
		this.setImporting(this.is_importing);
	}

	disconnect() {
		window.removeEventListener("subscriptions:open", this.handleOpen);
		window.removeEventListener("subscriptions:close", this.handleClose);
		window.removeEventListener("auth:ready", this.handleAuthReady);
		window.removeEventListener("post:open", this.handlePostOpen);
		window.removeEventListener("reader:summary", this.handlePostOpen);
		window.removeEventListener("discover:open", this.handleDiscoverOpen);
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

	handleDiscoverOpen() {
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
		if (!isSignedIn()) {
			this.subscriptions = [];
			this.subscription_icon_urls = new Map();
			this.clearStatus();
			this.render();
			return;
		}
		this.is_loading = true;
		this.subscription_icon_urls = new Map();
		this.renderLoading();

		try {
			const [subscriptions_result, icons_result] = await Promise.allSettled([
				fetchFeedSubscriptions(),
				fetchFeedIcons()
			]);
			if (subscriptions_result.status != "fulfilled") {
				throw subscriptions_result.reason;
			}
			const payload = subscriptions_result.value;
			this.subscriptions = Array.isArray(payload) ? payload : [];
			this.setStoredSubscriptions(this.subscriptions);
			if (icons_result.status == "fulfilled") {
				const icon_pairs = Array.isArray(icons_result.value)
					? icons_result.value
						.map((icon) => [`${icon?.host || ""}`.trim().toLowerCase(), `${icon?.url || ""}`.trim()])
						.filter(([host, url]) => host && url)
					: [];
				this.subscription_icon_urls = new Map(icon_pairs);
			}
			else {
				console.warn("Failed to load subscription icons", icons_result.reason);
			}
		}
		catch (error) {
			console.warn("Failed to load subscriptions", error);
			if (USE_MOCK_DATA) {
				this.subscriptions = [...mockSubscriptions];
				this.setStoredSubscriptions(this.subscriptions);
				this.clearStatus();
			}
			else {
				const cached = this.getStoredSubscriptions();
				this.subscriptions = cached.length ? cached : [];
				let response_text = "";
				if (error && typeof error.response_text == "string") {
					response_text = error.response_text.trim();
				}
				const status_message = cached.length
					? "Unable to refresh subscriptions. Showing cached list."
					: (
						response_text
							? `Unable to load subscriptions. ${response_text}`
							: "Unable to load subscriptions."
					);
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

		if (this.isContactSearchQuery(feed_url)) {
			const search_terms = this.getContactSearchTerms(feed_url);
			if (!search_terms) {
				this.showStatus("Enter a username to search.");
				return;
			}

			this.inputTarget.value = "";
			this.setSubmitting(true);
			this.clearStatus();

			try {
				const payload = await searchMicroBlogContacts(search_terms);
				const contact_choices = this.normalizeContactChoices(payload);
				this.showContactChoices(contact_choices);
			}
			catch (error) {
				console.warn("Failed to search contacts", error);
				this.showStatus("Username search failed. Please try again.");
			}
			finally {
				this.setSubmitting(false);
			}
			return;
		}

		this.setSubmitting(true);
		this.clearStatus();

		try {
			const payload = await createFeedSubscription(feed_url);
			if (Array.isArray(payload)) {
				const feed_choices = this.normalizeFeedChoices(payload);
				this.showFeedChoices(feed_choices);
				return;
			}
			this.inputTarget.value = "";
			await this.loadSubscriptions();
			this.dispatchTimelineSync();
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

	selectFeedChoice(event) {
		event.preventDefault();

		if (this.is_submitting) {
			return;
		}

		const feed_url = event.currentTarget?.dataset.feedUrl || "";
		const trimmed_feed_url = feed_url.trim();
		if (!trimmed_feed_url) {
			return;
		}

		this.inputTarget.value = trimmed_feed_url;
		this.clearStatus();
		this.inputTarget.focus();
		const form = this.inputTarget.form;
		if (form) {
			form.requestSubmit();
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

	filterTimelineByFeed(event) {
		event.preventDefault();
		const feed_id = (event.currentTarget?.dataset.feedId || "").trim();
		if (!feed_id) {
			return;
		}

		const feed_source = (event.currentTarget?.dataset.feedSource || "").trim();
		window.dispatchEvent(
			new CustomEvent("timeline:filterByFeed", {
				detail: {
					feedId: feed_id,
					source: feed_source
				}
			})
		);
	}

	startRename(event) {
		event.preventDefault();
		this.clearStatus();

		if (this.is_loading) {
			this.showStatus("Loading subscriptions. Please try again.");
			return;
		}

		const item = event.currentTarget.closest("[data-subscription-id]");
		const subscription_id = item?.dataset.subscriptionId;
		if (!subscription_id) {
			return;
		}

		const subscription = this.subscriptions.find((entry) => entry.id == subscription_id) || null;
		this.rename_subscription_id = subscription_id;
		this.rename_value = this.getSubscriptionTitle(subscription);
		this.rename_is_loading = false;
		this.render();
		this.focusRenameInput(subscription_id);
	}

	updateRenameValue(event) {
		this.rename_value = event.target.value;
	}

	handleRenameKeydown(event) {
		if (event.key == "Escape") {
			event.preventDefault();
			this.cancelRename();
			return;
		}

		if (event.key == "Enter") {
			event.preventDefault();
			this.updateRename(event);
		}
	}

	focusRenameInput(subscription_id) {
		requestAnimationFrame(() => {
			const input = this.element.querySelector(`[data-rename-input="${subscription_id}"]`);
			if (input) {
				input.focus();
				input.select();
			}
		});
	}

	async updateRename(event) {
		event.preventDefault();
		if (this.rename_is_loading) {
			return;
		}

		const item = event.currentTarget.closest("[data-subscription-id]");
		const subscription_id = item?.dataset.subscriptionId;
		if (!subscription_id) {
			return;
		}

		const subscription = this.subscriptions.find((entry) => entry.id == subscription_id) || null;
		const current_title = this.getSubscriptionTitle(subscription);
		const trimmed_title = (this.rename_value || "").trim();
		if (!trimmed_title) {
			this.showStatus("Feed name cannot be empty.");
			return;
		}

		if (trimmed_title == current_title.trim()) {
			this.rename_subscription_id = "";
			this.rename_value = "";
			this.render();
			return;
		}

		this.rename_is_loading = true;
		this.render();

		try {
			const updated = await updateFeedSubscription(subscription_id, trimmed_title);
			if (subscription) {
				subscription.title = updated?.title || trimmed_title;
			}
			this.setStoredSubscriptions(this.subscriptions);
			this.rename_subscription_id = "";
			this.rename_value = "";
			this.rename_is_loading = false;
			await this.loadSubscriptions();
			this.showStatus("Feed renamed.");
		}
		catch (error) {
			console.warn("Failed to rename subscription", error);
			this.rename_is_loading = false;
			this.render();
			this.showStatus("Unable to rename feed.");
		}
	}

	cancelRename(event) {
		event?.preventDefault();
		if (this.rename_is_loading) {
			return;
		}
		this.rename_subscription_id = "";
		this.rename_value = "";
		this.render();
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
			this.dispatchTimelineSync();
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

	handleSearchInput(event) {
		this.search_query = (event.target?.value || "").trim().toLowerCase();
		this.render();
	}

	render() {
		if (this.is_loading) {
			return;
		}

		const sorted_subscriptions = [...this.subscriptions].sort((left, right) => {
			const left_title = this.getSubscriptionTitle(left);
			const right_title = this.getSubscriptionTitle(right);
			return left_title.localeCompare(right_title);
		});

		if (sorted_subscriptions.length == 0) {
			this.listTarget.innerHTML = "<p class=\"subscriptions-empty\">No subscriptions yet.</p>";
			return;
		}

		const filtered_subscriptions = this.filterSubscriptions(sorted_subscriptions);
		if (filtered_subscriptions.length == 0) {
			this.listTarget.innerHTML = "";
			return;
		}

		const items = filtered_subscriptions
			.map((subscription) => {
				const is_editing = subscription.id == this.rename_subscription_id;
				const title = this.escapeHtml(this.getSubscriptionTitle(subscription));
				const url = this.escapeHtml(this.getSubscriptionUrl(subscription));
				const icon_url = this.escapeHtml(this.getSubscriptionIconUrl(subscription));
				const feed_id = this.getSubscriptionFeedId(subscription);
				const safe_feed_id = this.escapeHtml(feed_id);
				const safe_feed_source = this.escapeHtml(this.getSubscriptionTitle(subscription));
					const link = url ? `<a href="${url}">${url}</a>` : "";
					const title_link = feed_id
						? `<a href="#" class="subscription-title-link" data-action="subscriptions#filterTimelineByFeed" data-feed-id="${safe_feed_id}" data-feed-source="${safe_feed_source}">${title}</a>`
						: title;
					const icon_link = feed_id
						? `<a href="#" class="subscription-icon-link" aria-label="Filter by ${safe_feed_source}" data-action="subscriptions#filterTimelineByFeed" data-feed-id="${safe_feed_id}" data-feed-source="${safe_feed_source}"><img class="subscription-site-icon" src="${icon_url}" alt="" aria-hidden="true" width="30" height="30" loading="lazy"></a>`
						: `<img class="subscription-site-icon" src="${icon_url}" alt="" aria-hidden="true" width="30" height="30" loading="lazy">`;
					const safe_value = this.escapeHtml(this.rename_value || this.getSubscriptionTitle(subscription));
					const spinner_hidden = (is_editing && this.rename_is_loading) ? "" : "hidden";
					const update_disabled = (is_editing && this.rename_is_loading) ? "disabled" : "";
				if (is_editing) {
					return `
						<div class="subscription-item subscription-item--edit" data-subscription-id="${subscription.id}">
							<img class="subscription-site-icon" src="${icon_url}" alt="" aria-hidden="true" width="30" height="30" loading="lazy">
							<input
								type="text"
								class="subscription-edit"
								value="${safe_value}"
								data-rename-input="${subscription.id}"
								data-action="input->subscriptions#updateRenameValue keydown->subscriptions#handleRenameKeydown"
								${update_disabled}
							>
							<div class="subscription-actions">
								<img class="subscriptions-spinner subscriptions-spinner--inline" src="/images/progress_spinner.svg" alt="" aria-hidden="true" ${spinner_hidden}>
								<button type="button" class="subscription-cancel btn-sm" data-action="subscriptions#cancelRename" ${update_disabled}>
									Cancel
								</button>
								<button type="button" class="subscription-update btn-sm" data-action="subscriptions#updateRename" ${update_disabled}>
									Update
								</button>
							</div>
						</div>
					`;
				}
					return `
						<div class="subscription-item" data-subscription-id="${subscription.id}">
							<div class="subscription-main">
								${icon_link}
								<div class="subscription-info">
									<p class="subscription-title">${title_link}</p>
									<p class="subscription-url">${link}</p>
							</div>
						</div>
						<div class="subscription-buttons">
							<button type="button" class="subscription-rename btn-sm" data-action="subscriptions#startRename">
								Rename
							</button>
							<button type="button" class="subscription-remove btn-sm" data-action="subscriptions#remove">
								Remove
							</button>
						</div>
					</div>
				`;
			})
			.join("");

		this.listTarget.innerHTML = items;
	}

	filterSubscriptions(subscriptions) {
		const query = (this.search_query || "").trim().toLowerCase();
		if (!query) {
			return subscriptions;
		}

		return (subscriptions || []).filter((subscription) => this.matchesSubscriptionSearch(subscription, query));
	}

	matchesSubscriptionSearch(subscription, query) {
		if (!subscription) {
			return false;
		}

		const title = `${this.getSubscriptionTitle(subscription) || ""}`.toLowerCase();
		const site_url = `${this.getSubscriptionSiteUrl(subscription) || ""}`.toLowerCase();
		const feed_url = `${this.getSubscriptionFeedUrl(subscription) || ""}`.toLowerCase();
		return title.includes(query) || site_url.includes(query) || feed_url.includes(query);
	}

	getSubscriptionTitle(subscription) {
		const title = subscription?.title || subscription?.site_url || subscription?.feed_url || "";
		return title.trim() || "Untitled feed";
	}

	getSubscriptionUrl(subscription) {
		const url = subscription?.site_url || subscription?.feed_url || "";
		return url.trim();
	}

	getSubscriptionFeedId(subscription) {
		const feed_id = subscription?.feed_id;
		if (feed_id == null) {
			return "";
		}
		return String(feed_id).trim();
	}

	getSubscriptionFeedUrl(subscription) {
		const url = subscription?.feed_url || "";
		return url.trim();
	}

	getSubscriptionSiteUrl(subscription) {
		const url = subscription?.site_url || "";
		return url.trim();
	}

	getSubscriptionIconUrl(subscription) {
		if (!subscription) {
			return DEFAULT_SUBSCRIPTION_ICON_URL;
		}

		const json_icon = `${subscription?.json_feed?.icon || subscription?.json_feed?.favicon || ""}`.trim();
		if (json_icon) {
			return json_icon;
		}

		const source_url = this.getSubscriptionSiteUrl(subscription) || this.getSubscriptionFeedUrl(subscription);
		const host = this.getDomainName(source_url).toLowerCase();
		if (host && this.subscription_icon_urls.has(host)) {
			const icon_url = `${this.subscription_icon_urls.get(host) || ""}`.trim();
			if (icon_url) {
				return icon_url;
			}
		}

		return DEFAULT_SUBSCRIPTION_ICON_URL;
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

	dispatchTimelineSync() {
		window.dispatchEvent(new CustomEvent("timeline:sync"));
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

	showFeedChoices(choices) {
		if (!Array.isArray(choices) || choices.length == 0) {
			this.showStatus("Multiple feeds found. Please enter a specific feed URL.");
			return;
		}

		const items = choices
			.map((choice) => {
				const feed_url = choice.feed_url || "";
				const safe_feed_url = this.escapeHtml(feed_url);
				const title = this.escapeHtml(choice.title || "Untitled feed");
				const display_url = this.escapeHtml(this.trimHttpsScheme(feed_url));
				const is_json = choice.feed_type == "json";
				const icon_src = is_json ? "/images/jsonfeed_icon.png" : "/images/rss_icon.png";
				const icon_alt = is_json ? "JSON Feed" : "RSS Feed";

				return `
					<button
						type="button"
						class="subscription-choice"
						data-action="subscriptions#selectFeedChoice"
						data-feed-url="${safe_feed_url}"
					>
						<img class="subscription-choice-icon" src="${icon_src}" width="16" height="16" alt="${icon_alt}">
						<div class="subscription-choice-info">
							<p class="subscription-choice-title">${title}</p>
							<p class="subscription-choice-url">${display_url}</p>
						</div>
					</button>
				`;
			})
			.join("");

		this.statusTarget.innerHTML = `
			<span class="subscriptions-status-label">Multiple feeds found:</span>
			<div class="subscription-choices">${items}</div>
		`;
		this.statusTarget.hidden = false;
	}

	showContactChoices(choices) {
		if (!Array.isArray(choices) || choices.length == 0) {
			this.showStatus("No matching Micro.blog usernames found.");
			return;
		}

		const items = choices
			.map((choice) => {
				const feed_url = choice.feed_url || "";
				const safe_feed_url = this.escapeHtml(feed_url);
				const title = this.escapeHtml(choice.title || "Unknown user");
				const display_url = this.escapeHtml(feed_url);
				const avatar_url = this.escapeHtml(choice.avatar_url || DEFAULT_SUBSCRIPTION_ICON_URL);

				return `
					<button
						type="button"
						class="subscription-choice subscription-choice-contact"
						data-action="subscriptions#selectFeedChoice"
						data-feed-url="${safe_feed_url}"
					>
						<img class="subscription-choice-avatar" src="${avatar_url}" width="30" height="30" alt="">
						<div class="subscription-choice-info">
							<p class="subscription-choice-title">${title}</p>
							<p class="subscription-choice-url">${display_url}</p>
						</div>
					</button>
				`;
			})
			.join("");

		this.statusTarget.innerHTML = `
			<span class="subscriptions-status-label">Micro.blog usernames:</span>
			<div class="subscription-choices">${items}</div>
		`;
		this.statusTarget.hidden = false;
	}

	isContactSearchQuery(raw_value) {
		const trimmed = (raw_value || "").trim();
		return trimmed.startsWith("@");
	}

	getContactSearchTerms(raw_value) {
		const trimmed = (raw_value || "").trim();
		if (!trimmed.startsWith("@")) {
			return "";
		}
		return trimmed.replace(/^@+/, "").trim();
	}

	normalizeContactChoices(payload) {
		const contacts = Array.isArray(payload?.contacts) ? payload.contacts : [];
		const choices = contacts
			.map((contact) => this.contactToFeedChoice(contact))
			.filter(Boolean);
		return this.uniqueFeedChoices(choices);
	}

	contactToFeedChoice(contact) {
		if (!contact || typeof contact != "object") {
			return null;
		}

		const nickname = `${contact.nickname || ""}`.trim();
		if (!nickname || nickname.includes("@") || nickname.includes(".")) {
			return null;
		}

		const normalized_nickname = nickname.toLowerCase();
		const feed_url = `https://${normalized_nickname}.micro.blog/feed.json`;
		const fallback_name = `@${normalized_nickname}`;
		const display_name = `${contact.name || fallback_name}`.trim() || fallback_name;
		const avatar_url = this.normalizeContactAvatarUrl(contact.photo);

		return {
			title: display_name,
			feed_url,
			avatar_url
		};
	}

	normalizeContactAvatarUrl(raw_url) {
		const trimmed = `${raw_url || ""}`.trim();
		if (!trimmed) {
			return DEFAULT_SUBSCRIPTION_ICON_URL;
		}

		try {
			const parsed = new URL(trimmed);
			if (parsed.protocol == "http:" || parsed.protocol == "https:") {
				return parsed.toString();
			}
		}
		catch (error) {
			return DEFAULT_SUBSCRIPTION_ICON_URL;
		}

		return DEFAULT_SUBSCRIPTION_ICON_URL;
	}

	normalizeFeedChoices(payload) {
		if (!Array.isArray(payload)) {
			return [];
		}

		const choices = payload
			.map((entry) => {
				if (typeof entry == "string") {
					const feed_url = entry.trim();
					if (!feed_url) {
						return null;
					}
					return {
						title: feed_url,
						feed_url,
						feed_type: this.detectFeedType({ feed_url })
					};
				}

				if (!entry || typeof entry != "object") {
					return null;
				}

				const feed_url = this.getFeedChoiceUrl(entry);
				if (!feed_url) {
					return null;
				}

				const title = this.getFeedChoiceTitle(entry) || feed_url;
				return {
					title,
					feed_url,
					feed_type: this.detectFeedType(entry)
				};
			})
			.filter(Boolean);

		return this.uniqueFeedChoices(choices);
	}

	uniqueFeedChoices(choices) {
		const seen = new Set();
		const unique_choices = [];
		(choices || []).forEach((choice) => {
			const feed_url = (choice?.feed_url || "").trim();
			if (!feed_url) {
				return;
			}
			const key = feed_url.toLowerCase();
			if (seen.has(key)) {
				return;
			}
			seen.add(key);
			unique_choices.push(choice);
		});
		return unique_choices;
	}

	getFeedChoiceTitle(choice) {
		const title = choice?.title || choice?.name || "";
		return title.trim();
	}

	getFeedChoiceUrl(choice) {
		const feed_url = choice?.feed_url || choice?.url || choice?.xml_url || "";
		return feed_url.trim();
	}

	detectFeedType(choice) {
		const feed_type = `${choice?.feed_type || choice?.type || ""}`.trim().toLowerCase();
		if (feed_type.includes("json")) {
			return "json";
		}

		if (choice?.json_feed) {
			return "json";
		}

		const version = `${choice?.version || choice?.json_feed?.version || ""}`.trim().toLowerCase();
		if (version.includes("jsonfeed.org")) {
			return "json";
		}

		const feed_url = this.getFeedChoiceUrl(choice).toLowerCase();
		if (feed_url.endsWith(".json") || feed_url.includes(".json?") || feed_url.includes("/json")) {
			return "json";
		}

		return "rss";
	}

	trimHttpsScheme(url) {
		const trimmed = (url || "").trim();
		if (!trimmed) {
			return "";
		}
		return trimmed.replace(/^https:\/\//i, "");
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

	getStoredSubscriptions() {
		try {
			const stored = localStorage.getItem(this.subscriptions_storage_key);
			if (!stored) {
				return [];
			}
			const parsed = JSON.parse(stored);
			return Array.isArray(parsed) ? parsed : [];
		}
		catch (error) {
			return [];
		}
	}

	setStoredSubscriptions(subscriptions) {
		const cleaned = Array.isArray(subscriptions) ? subscriptions : [];
		try {
			if (cleaned.length == 0) {
				localStorage.removeItem(this.subscriptions_storage_key);
			}
			else {
				localStorage.setItem(this.subscriptions_storage_key, JSON.stringify(cleaned));
			}
		}
		catch (error) {
			// Ignore storage errors.
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
