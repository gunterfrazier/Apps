const q = (name: string, description: string, required = false) => ({ name, in: "query", required, description, schema: { type: "string" } });
const path1 = (name: string, description: string) => ({ name, in: "path", required: true, description, schema: { type: "string" } });
const translation = q("translation", "BSB (default), NHEB, KJV, ASV or YLT");
const ok = { "200": { description: "Success" } };
const secured = [{ apiKey: [] }];
export const OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "Veritas Logos API",
    version: "1.0.0",
    description: "Scripture, Hebrew and Greek word data, sourced links between passages, biblical people, and study guides. Reading endpoints are open and rate limited. Saving guides and using AI need an API key, sent as a Bearer token. Include each dataset's attribution when you display its data (CC BY sources are named in responses).",
  },
  components: { securitySchemes: { apiKey: { type: "http", scheme: "bearer" } } },
  paths: {
    "/v1/translations": { get: { summary: "List Bible translations", responses: ok } },
    "/v1/passages": { get: { summary: "Get the text of a reference", parameters: [q("ref", "A reference such as John 3:16-18; Romans 8", true), translation], responses: { ...ok, "404": { description: "Reference isn't in the Bible text" } } } },
    "/v1/search": { get: { summary: "Search Bible text", parameters: [q("q", "Words to find", true), translation, q("mode", "words (default) or phrase"), q("limit", "1 to 100")], responses: ok } },
    "/v1/verses/words": { get: { summary: "Hebrew or Greek words of a verse", parameters: [q("ref", "One verse", true)], responses: ok } },
    "/v1/crossrefs": { get: { summary: "Cross-references for a verse", parameters: [q("ref", "One verse", true)], responses: ok } },
    "/v1/insights": { get: { summary: "Sourced data on a passage: Nave's topics, confessions citing it, quotations, parallels and possible allusions", parameters: [q("ref", "A verse or passage", true)], responses: ok } },
    "/v1/lexicon": { get: { summary: "Search the lexicon", parameters: [q("q", "An English meaning, transliteration or Strong's number", true), q("limit", "1 to 100")], responses: ok } },
    "/v1/lexicon/{id}": { get: { summary: "One lexicon entry", parameters: [path1("id", "Strong's number, such as G26")], responses: ok } },
    "/v1/lexicon/{id}/verses": { get: { summary: "Concordance for a word", parameters: [path1("id", "Strong's number"), translation, q("limit", "1 to 500"), q("offset", "Results to skip")], responses: ok } },
    "/v1/topics": { get: { summary: "Search topics", parameters: [q("q", "Topic", true)], responses: ok } },
    "/v1/topics/{slug}": { get: { summary: "One topic and its references", parameters: [path1("slug", "Topic slug")], responses: ok } },
    "/v1/figures": { get: { summary: "List or search biblical people", parameters: [q("q", "Name"), q("limit", "1 to 500")], responses: ok } },
    "/v1/figures/{id}": { get: { summary: "One person", parameters: [path1("id", "Person id")], responses: ok } },
    "/v1/figures/{id}/tree": { get: { summary: "Family tree around a person", parameters: [path1("id", "Person id"), q("depth", "1 to 10")], responses: ok } },
    "/v1/path": { get: { summary: "How two people are connected", parameters: [q("from", "Person id", true), q("to", "Person id", true)], responses: ok } },
    "/v1/guides/generate": { post: { summary: "Build a guide from a passage or topic, without saving it", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["input"], properties: { input: { type: "string" }, format: { enum: ["inductive", "exegetical", "smallgroup", "teaching"] }, lens: { enum: ["all", "reformed", "arminian", "catholic", "orthodox", "lutheran", "anglican", "baptist", "pentecostal", "messianic", "dispensational"] }, translation: { type: "string" }, title: { type: "string" } } } } } }, responses: { ...ok, "422": { description: "Nothing matched the input" } } } },
    "/v1/guides": {
      get: { summary: "List your saved guides", security: secured, responses: ok },
      post: { summary: "Save a guide", security: secured, requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { guide: { type: "object" }, visibility: { enum: ["private", "public"] } } } } } }, responses: { "201": { description: "Saved" } } },
    },
    "/v1/guides/{id}": {
      get: { summary: "Get a guide (yours, or any public guide)", parameters: [path1("id", "Guide id"), q("format", "json (default), md, txt or html")], responses: ok },
      put: { summary: "Replace your guide", security: secured, parameters: [path1("id", "Guide id")], responses: ok },
      delete: { summary: "Delete your guide", security: secured, parameters: [path1("id", "Guide id")], responses: ok },
    },
    "/v1/ai/status": { get: { summary: "Whether AI is available to this caller", responses: ok } },
    "/v1/ai/ask": { post: { summary: "Ask the AI assistant. Streams server-sent events: {text}, then {done, references}", security: secured, requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["purpose"], properties: { purpose: { enum: ["insight", "chat", "draft"] }, reference: { type: "string" }, messages: { type: "array" }, translation: { type: "string" }, lens: { type: "string" }, contextRef: { type: "string" }, guide: { type: "object" }, request: { type: "string" } } } } } }, responses: ok } },
    "/v1/keys": { post: { summary: "Create an API key (administrator only)", security: secured, responses: { "201": { description: "Created" } } } },
  },
};
