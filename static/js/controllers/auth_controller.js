import { Controller } from "../stimulus.js";
import {
	fetchMicroBlogAvatar,
	getMicroBlogAvatar,
	getMicroBlogToken,
	setMicroBlogAvatar,
	setMicroBlogIsUsingAI,
	setMicroBlogToken
} from "../api/feeds.js";

const MICRO_BLOG_AUTH_URL = "https://micro.blog/indieauth/auth";
const MICRO_BLOG_TOKEN_URL = "https://micro.blog/indieauth/token";
const OAUTH_STATE_KEY = "inkwell_oauth_state";
const LEGACY_TOKEN_KEY = "inkwell_token";

export default class extends Controller {
	static targets = ["signin", "app", "avatar"];

	async connect() {
		this.updateAvatarFromStorage();
		await this.completeOAuthSignin();
		this.restoreSession();
	}

	signin() {
		const state_value = this.createOAuthState();
		if (!state_value) {
			return;
		}
		const app_url = this.getAppUrl();
		const client_id_url = this.getClientIdUrl(app_url);
		const params = new URLSearchParams({
			client_id: client_id_url,
			scope: "create",
			state: state_value,
			response_type: "code",
			redirect_uri: app_url
		});
		const auth_url = `${MICRO_BLOG_AUTH_URL}?${params.toString()}`;
		window.location.assign(auth_url);
	}

	signout() {
		localStorage.removeItem(OAUTH_STATE_KEY);
		localStorage.removeItem(LEGACY_TOKEN_KEY);
		this.stripOAuthParams(new URL(window.location.href));
		setMicroBlogToken("");
		setMicroBlogAvatar("");
		setMicroBlogIsUsingAI(null);
		this.showSignin();
	}

	restoreSession() {
		const micro_blog_token = getMicroBlogToken();
		if (micro_blog_token) {
			this.showApp();
			return;
		}

		this.showSignin();
	}

	showApp() {
		this.element.dataset.authState = "signed-in";
		this.appTarget.hidden = false;
		this.signinTarget.hidden = true;
		this.updateAvatarFromStorage();
		this.syncAvatar();
		window.dispatchEvent(new CustomEvent("auth:ready"));
	}

	showSignin() {
		this.element.dataset.authState = "signed-out";
		this.signinTarget.hidden = false;
		this.appTarget.hidden = true;
		this.preloadSigninBackground();
	}

	preloadSigninBackground() {
		if (!this.hasSigninTarget || this.signinBackgroundLoading || this.signinBackgroundLoaded) {
			return;
		}

		this.signinBackgroundLoading = true;
		const image = new Image();
		image.onload = () => {
			this.signinBackgroundLoaded = true;
			this.signinBackgroundLoading = false;
			this.signinTarget.classList.add("auth-screen--hi-res");
		};
		image.onerror = () => {
			this.signinBackgroundLoading = false;
		};
		image.src = "/images/homepage/background_6_high.jpg";
	}

	updateAvatarFromStorage() {
		if (!this.hasAvatarTarget) {
			return;
		}
		const avatar = getMicroBlogAvatar();
		this.avatarTarget.src = avatar || "/images/blank_avatar.png";
		this.avatarTarget.alt = "User avatar";
	}

	async syncAvatar() {
		if (!getMicroBlogToken() || !this.hasAvatarTarget) {
			return;
		}

		try {
			const verify_payload = await fetchMicroBlogAvatar();
			const avatar = verify_payload?.avatar;
			if (avatar) {
				this.avatarTarget.src = avatar;
				this.avatarTarget.alt = "User avatar";
			}
			if (!verify_payload?.has_inkwell) {
				alert("Inkwell is not yet enabled for your Micro.blog account.");
			}
			const is_using_ai = verify_payload?.is_using_ai;
			window.dispatchEvent(
				new CustomEvent("auth:verify", { detail: { is_using_ai } })
			);
		}
		catch (error) {
			console.warn("Failed to fetch Micro.blog avatar", error);
		}
	}

	getAppUrl() {
		const current_url = new URL(window.location.href);
		return `${current_url.origin}${current_url.pathname}`;
	}

	getClientIdUrl(app_url) {
		return new URL("client.json", app_url).toString();
	}

	createOAuthState() {
		if (!window.crypto?.getRandomValues) {
			return "";
		}
		const state_length = 10;
		const state_bytes = new Uint8Array(state_length);
		window.crypto.getRandomValues(state_bytes);
		const state_value = Array.from(state_bytes, (byte) => (byte % 10).toString()).join("");
		localStorage.setItem(OAUTH_STATE_KEY, state_value);
		return state_value;
	}

	clearOAuthState() {
		localStorage.removeItem(OAUTH_STATE_KEY);
	}

	stripOAuthParams(current_url) {
		if (!current_url.search) {
			return;
		}
		current_url.searchParams.delete("code");
		current_url.searchParams.delete("state");
		window.history.replaceState({}, document.title, current_url.toString());
	}

	async completeOAuthSignin() {
		const current_url = new URL(window.location.href);
		const auth_code = current_url.searchParams.get("code");
		if (!auth_code) {
			return;
		}
		const returned_state = current_url.searchParams.get("state");
		const stored_state = localStorage.getItem(OAUTH_STATE_KEY);
		this.stripOAuthParams(current_url);
		this.clearOAuthState();

		if (!returned_state || !stored_state || returned_state != stored_state) {
			console.warn("Micro.blog OAuth state mismatch");
			return;
		}

		try {
			const app_url = this.getAppUrl();
			const client_id_url = this.getClientIdUrl(app_url);
			const access_token = await this.fetchAccessToken(auth_code, app_url, client_id_url);
			if (!access_token) {
				return;
			}
			setMicroBlogToken(access_token);
			this.showApp();
		}
		catch (error) {
			console.warn("Failed to sign in with Micro.blog", error);
		}
	}

	async fetchAccessToken(auth_code, app_url, client_id_url) {
		const body = new URLSearchParams({
			code: auth_code,
			client_id: client_id_url,
			grant_type: "authorization_code",
			redirect_uri: app_url
		});
		const response = await fetch(MICRO_BLOG_TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"Accept": "application/json"
			},
			body
		});

		if (!response.ok) {
			throw new Error(`Micro.blog token exchange failed: ${response.status}`);
		}

		const payload = await response.json();
		const access_token = payload?.access_token;
		const profile_photo = payload?.profile?.photo;
		if (profile_photo) {
			setMicroBlogAvatar(profile_photo);
		}
		return access_token || "";
	}
}
