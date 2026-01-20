import { Controller } from "../stimulus.js";
import { getToken, saveToken, clearToken } from "../api/auth.js";
import {
  fetchMicroBlogAvatar,
  getMicroBlogAvatar,
  getMicroBlogToken,
  setMicroBlogAvatar,
  setMicroBlogToken
} from "../api/feeds.js";

export default class extends Controller {
  static targets = ["signin", "app", "tokenInput", "avatar"];

  connect() {
    if (this.hasTokenInputTarget) {
      this.tokenInputTarget.value = getMicroBlogToken() || "";
    }
    this.updateAvatarFromStorage();
    this.restoreSession();
  }

  signin() {
    this.saveMicroBlogToken();
    const token = "mock-token";
    saveToken(token);
    this.showApp();
  }

  signout() {
    clearToken();
    this.showSignin();
  }

  restoreSession() {
    const token = getToken();
    const microBlogToken = getMicroBlogToken();
    if (token || microBlogToken) {
      this.showApp();
      return;
    }

    this.showSignin();
  }

  showApp() {
    this.appTarget.hidden = false;
    this.signinTarget.hidden = true;
    this.updateAvatarFromStorage();
    this.syncAvatar();
    window.dispatchEvent(new CustomEvent("auth:ready"));
  }

  showSignin() {
    this.signinTarget.hidden = false;
    this.appTarget.hidden = true;
  }

  saveMicroBlogToken(event) {
    if (!this.hasTokenInputTarget) {
      return;
    }
    const value = event?.target?.value ?? this.tokenInputTarget.value;
    setMicroBlogToken(value);
    if (!value) {
      setMicroBlogAvatar("");
      this.updateAvatarFromStorage();
      return;
    }
    this.syncAvatar();
  }

  updateAvatarFromStorage() {
    if (!this.hasAvatarTarget) {
      return;
    }
    const avatar = getMicroBlogAvatar();
    this.avatarTarget.src = avatar || "/images/avatar-placeholder.svg";
    this.avatarTarget.alt = "User avatar";
  }

  async syncAvatar() {
    if (!getMicroBlogToken() || !this.hasAvatarTarget) {
      return;
    }

    try {
      const avatar = await fetchMicroBlogAvatar();
      if (avatar) {
        this.avatarTarget.src = avatar;
        this.avatarTarget.alt = "User avatar";
      }
    }
    catch (error) {
      console.warn("Failed to fetch Micro.blog avatar", error);
    }
  }
}
