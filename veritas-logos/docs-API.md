# Connecting other applications

Links work on the private page. Embeds and the REST API need the app on your own website.

## Links
Every screen has its own address, so any app can link straight to it:

| Link ending | Opens |
|---|---|
| `#read-john-3-16-18-kjv` | A passage, with an optional translation |
| `#word-g26` | A Hebrew or Greek word |
| `#person-david-1`, `#tree-david-1` | A person, or their family tree |
| `#topic-forgiveness` | A topic |
| `#new-forgiveness` | The guide builder, filled in |
| `#ask-john-3-16` | The AI assistant, looking at a passage |
| `#shared-…` | A shared guide. The guide travels in the link |

## Embeds
Add one script to a page, then use the elements anywhere on it. Frames size themselves.

```html
<script src="https://YOUR-SITE/veritas-embed.js" async></script>
<veritas-passage reference="John 3:16-18" translation="KJV"></veritas-passage>
<veritas-word id="G26"></veritas-word>
<veritas-person id="david-1"></veritas-person>
<veritas-guide code="CODE-FROM-THE-GUIDES-SHARE-SCREEN"></veritas-guide>
```

Add `theme="light"` or `theme="dark"` to force a theme. You can also use a plain iframe: `https://YOUR-SITE/embed.html#passage-john-3-16`.

## REST API
The server describes itself at `/v1/openapi.json`. Reading is open and rate limited. Saving guides and using AI need a key, sent as `Authorization: Bearer <key>`.

```bash
# Read
curl "https://YOUR-SITE/v1/passages?ref=John%203:16&translation=KJV"
curl "https://YOUR-SITE/v1/insights?ref=Romans%201:17"
curl "https://YOUR-SITE/v1/lexicon/G26"

# Create a key (administrator)
curl -X POST https://YOUR-SITE/v1/keys -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"label":"my app"}'

# Build a guide, then save it
curl -X POST https://YOUR-SITE/v1/guides/generate -d '{"input":"forgiveness","format":"smallgroup","lens":"catholic"}' > guide.json
curl -X POST https://YOUR-SITE/v1/guides -H "Authorization: Bearer $KEY" -d "{\"guide\":$(cat guide.json),\"visibility\":\"public\"}"

# Ask the AI (server-sent events)
curl -N -X POST https://YOUR-SITE/v1/ai/ask -H "Authorization: Bearer $KEY" -d '{"purpose":"chat","messages":[{"role":"user","content":"How is Psalm 110 used in Hebrews?"}]}'
```

Show each dataset's credit wherever you display its data. See `DATA-LICENSES.md`.
