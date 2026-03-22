import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const css_path = path.join(import.meta.dirname, "..", "static", "styles", "inkwell.css");
const stylesheet = fs.readFileSync(css_path, "utf8");

function get_rule(selector) {
	const escaped_selector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`${escaped_selector}\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
	const match = stylesheet.match(pattern);
	assert.ok(match, `Expected to find CSS rule for ${selector}`);
	return match[1];
}

test("discover cards reuse the same padding as subscriptions", () => {
	const root_rule = get_rule(":root");
	assert.match(root_rule, /--ink-list-item-padding:\s*0\.6rem;/);

	const subscription_item_rule = get_rule(".subscription-item");
	assert.match(subscription_item_rule, /padding:\s*var\(--ink-list-item-padding\);/);

	const discover_site_rule = get_rule(".discover-site");
	assert.match(discover_site_rule, /padding:\s*var\(--ink-list-item-padding\);/);

	const discover_post_rule = get_rule(".discover-post");
	assert.match(discover_post_rule, /padding:\s*var\(--ink-list-item-padding\);/);
});
