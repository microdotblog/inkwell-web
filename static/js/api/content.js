import { mockReaderContent } from "../mock_data.js";
import { getFeedEntry } from "./feeds.js";

const preview_spinner_markup = "<p class=\"loading\"><img class=\"subscriptions-spinner subscriptions-spinner--inline\" src=\"/images/progress_spinner.svg\" alt=\"Loading preview\" style=\"width: 20px; height: 20px;\"></p>";

export async function fetchReadableContent(postId) {
  const feedEntry = getFeedEntry(postId);
  if (feedEntry) {
    const title = feedEntry.title || feedEntry.summary || "Untitled";
    const html =
      feedEntry.content ||
      (feedEntry.summary ? `<p>${feedEntry.summary}</p>` : preview_spinner_markup);
    return {
      title,
      byline: feedEntry.author || "",
      html
    };
  }

  const payload = mockReaderContent[postId];
  if (!payload) {
    return {
      title: "Untitled",
      byline: "",
      html: preview_spinner_markup
    };
  }

  return {
    title: payload.title,
    byline: payload.byline,
    html: payload.html
  };
}
