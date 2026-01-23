const now = Date.now();
const hoursAgo = (hours) => new Date(now - hours * 60 * 60 * 1000).toISOString();

export const timelineColors = {
  "day-1": "#f7f9fc",
  "day-2": "#eef3f8",
  "day-3": "#e5edf5",
  "day-4": "#dde7f1",
  "day-5": "#d6e1ed",
  "day-6": "#cfdbe9",
  "day-7": "#c9d6e5"
};

export const timelineBorderColors = {
  "day-1": "#d9e2ee",
  "day-2": "#cedae8",
  "day-3": "#c2d2e2",
  "day-4": "#b7cada",
  "day-5": "#aec3d4",
  "day-6": "#a6bccf",
  "day-7": "#9fb5c9"
};

export const mockPosts = [
  {
    id: "post-001",
    source: "Micro.blog",
    title: "The Quiet Edge of Morning",
    summary: "Notes on the first hour and the room it creates.",
    url: "https://example.com/post-001",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(2),
    is_read: false,
    is_archived: false,
    age_bucket: "day-1"
  },
  {
    id: "post-002",
    source: "Desk Notes",
    title: "Designing a calmer timeline",
    summary: "We can tune the feed to breathe instead of shout.",
    url: "https://example.com/post-002",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(6),
    is_read: false,
    is_archived: false,
    age_bucket: "day-1"
  },
  {
    id: "post-003",
    source: "Leaf & Ink",
    title: "Rain, type, and long afternoons",
    summary: "A short field note from the studio window.",
    url: "https://example.com/post-003",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(12),
    is_read: true,
    is_archived: false,
    age_bucket: "day-1"
  },
  {
    id: "post-004",
    source: "Signal Drift",
    title: "How to keep a reading stack",
    summary: "Three tiny rituals for staying with the text.",
    url: "https://example.com/post-004",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(20),
    is_read: false,
    is_archived: false,
    age_bucket: "day-1"
  },
  {
    id: "post-005",
    source: "Studio Log",
    title: "Sketching the week in margins",
    summary: "Margins are where the real thinking happens.",
    url: "https://example.com/post-005",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(28),
    is_read: true,
    is_archived: false,
    age_bucket: "day-2"
  },
  {
    id: "post-006",
    source: "Paper Trail",
    title: "A softer inbox",
    summary: "Let the inbox be a shoreline, not a cliff.",
    url: "https://example.com/post-006",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(36),
    is_read: false,
    is_archived: false,
    age_bucket: "day-2"
  },
  {
    id: "post-007",
    source: "Ink & Signal",
    title: "The long walk home",
    summary: "Walking untangles the knots we carry.",
    url: "https://example.com/post-007",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(52),
    is_read: true,
    is_archived: false,
    age_bucket: "day-3"
  },
  {
    id: "post-008",
    source: "Atlas Notes",
    title: "Keeping a readerly mind",
    summary: "Gentle structures for daily reading.",
    url: "https://example.com/post-008",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(76),
    is_read: false,
    is_archived: false,
    age_bucket: "day-4"
  },
  {
    id: "post-009",
    source: "Field Journal",
    title: "As the light changes",
    summary: "A sketch of late afternoon color.",
    url: "https://example.com/post-009",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(100),
    is_read: true,
    is_archived: true,
    age_bucket: "day-5"
  },
  {
    id: "post-010",
    source: "Small Systems",
    title: "Calibrating attention",
    summary: "Build habits that respect focus.",
    url: "https://example.com/post-010",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(124),
    is_read: true,
    is_archived: true,
    age_bucket: "day-6"
  },
  {
    id: "post-011",
    source: "Drift Notes",
    title: "A shelf of quiet essays",
    summary: "A list of essays for slow mornings.",
    url: "https://example.com/post-011",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(148),
    is_read: true,
    is_archived: true,
    age_bucket: "day-7"
  },
  {
    id: "post-012",
    source: "Pencil Lines",
    title: "Revisiting old drafts",
    summary: "Why older work still feels alive.",
    url: "https://example.com/post-012",
    avatar_url: "/images/blank_avatar.png",
    published_at: hoursAgo(164),
    is_read: true,
    is_archived: true,
    age_bucket: "day-7"
  }
];

export const mockSubscriptions = [
	{
		id: "sub-001",
		feed_id: "feed-001",
		title: "Micro.blog",
		site_url: "https://micro.blog",
		feed_url: "https://micro.blog/feed.xml"
	},
	{
		id: "sub-002",
		feed_id: "feed-002",
		title: "Desk Notes",
		site_url: "https://example.com/desk-notes",
		feed_url: "https://example.com/desk-notes/feed.xml"
	},
	{
		id: "sub-003",
		feed_id: "feed-003",
		title: "Leaf & Ink",
		site_url: "https://example.com/leaf-ink",
		feed_url: "https://example.com/leaf-ink/feed.xml"
	},
	{
		id: "sub-004",
		feed_id: "feed-004",
		title: "Signal Drift",
		site_url: "https://example.com/signal-drift",
		feed_url: "https://example.com/signal-drift/feed.xml"
	},
	{
		id: "sub-005",
		feed_id: "feed-005",
		title: "Studio Log",
		site_url: "https://example.com/studio-log",
		feed_url: "https://example.com/studio-log/feed.xml"
	}
];

export const mockReaderContent = {
  "post-001": {
    title: "The Quiet Edge of Morning",
    html: `
      <p class="lead">Morning arrives with a different texture when you give it a few minutes of air.</p>
      <p>Today I kept my phone face down and let the coffee find its pace. The room felt wider. The first page of the notebook was suddenly enough.</p>
      <h3>Small cues</h3>
      <p>Light in the kitchen, the clink of a mug, the dog stretching. These cues remind me the day can start without a rush.</p>
      <p>Reading at this hour is a different kind of listening. The page is still.</p>
    `
  },
  "post-002": {
    title: "Designing a calmer timeline",
    html: `
      <p class="lead">A feed is a room. We can decide how loud the chairs scrape.</p>
      <p>I have been watching my own scrolling habits and noticing the moments that make me exhale. Those are the moments I want to keep.</p>
      <p>What if a timeline could soften as it aged, instead of burying its own history?</p>
    `
  },
  "post-004": {
    title: "How to keep a reading stack",
    html: `
      <p class="lead">A stack is a promise, not a list.</p>
      <p>Keep the stack short. Three to five pieces, tops. The stack should fit in a single glance.</p>
      <p>Then take notes that are more texture than summary. What did it feel like to read this?</p>
    `
  },
  "post-007": {
    title: "The long walk home",
    html: `
      <p class="lead">Walking lets the day decompress.</p>
      <p>Even a short loop around the block is enough to reset the nervous system. I bring one question with me and let the street answer.</p>
      <p>The return home is quieter, and the page waits.</p>
    `
  },
  "post-009": {
    title: "As the light changes",
    html: `
      <p class="lead">Late afternoon light turns everything into a sketch.</p>
      <p>I like to put unfinished work near a window at this hour. The glow adds perspective.</p>
      <p>When the light fades, the work looks different but still familiar.</p>
    `
  }
};
