// ---------- Customizable, Moderated Community Board (#board on Connect, #admin-boards in Admin) ----------
// Localized, moderated community boards where church members coordinate care/meals, carpools, prayer & praise,
// youth/parent updates, and blessing exchanges, with per-board topic customization and moderation queues.

const BOARD_ICONS = [
  ["people", "Community"],
  ["hand", "Care & Serve"],
  ["give", "Blessing / Exchange"],
  ["kid", "Parents & Youth"],
  ["calendar", "Events & Rides"],
  ["pray", "Prayer & Praise"],
  ["star", "Announcements"],
];
const POST_TYPES = [
  ["discussion", "Discussion / Update"],
  ["need", "Care Need / Meal Train Sign-Up"],
  ["ride", "Carpool / Ride Coordination"],
  ["exchange", "Blessing Exchange (Give / Borrow)"],
  ["poll", "Community Poll"],
];
const REACTION_KINDS = [
  ["amen", "🙏 Amen"],
  ["praying", "❤️ Praying"],
  ["help", "🙌 I can help"],
  ["thanks", "✨ Thank you"],
];

function defaultBoardsFor(cid) {
  return [
    { id: `${cid}-brd-care`, churchId: cid, locationId: null, name: "Care & Meal Trains", icon: "hand", description: "Coordinate meals for new parents or recovering members, rides to appointments, and practical care.", requireApproval: false, postPerm: "members", order: 1 },
    { id: `${cid}-brd-community`, churchId: cid, locationId: null, name: "Fellowship & Local Life", icon: "people", description: "Connect with church families during the week, share recommendations, and organize casual meetups.", requireApproval: false, postPerm: "members", order: 2 },
    { id: `${cid}-brd-parents`, churchId: cid, locationId: null, name: "Parents & Youth Corner", icon: "kid", description: "Coordinate youth carpools, camp packing lists, and Sunday school updates for families.", requireApproval: false, postPerm: "members", order: 3 },
    { id: `${cid}-brd-blessing`, churchId: cid, locationId: null, name: "Blessing Exchange", icon: "give", description: "Give away or borrow strollers, furniture, tools, books, and household items within our church family.", requireApproval: true, postPerm: "members", order: 4 },
  ];
}

function defaultPostsFor(cid) {
  const now = Date.now();
  return [
    {
      id: `${cid}-post-1`, churchId: cid, boardId: `${cid}-brd-care`, locationId: null,
      by: "u-elena", authorName: "Elena Morales",
      title: "Meal Train for the Miller Family (New Baby!)",
      body: "Praise God! Baby Caleb arrived Tuesday morning. Let's bless them with warm dinners over the next two weeks. No shellfish allergies; porch drop-off between 5:00 and 6:00 PM works best.",
      postType: "need", status: "approved", pinned: true, locked: false,
      slots: [
        { id: "s1", label: "Tuesday Dinner (Nov 17)", claimedBy: "u-marcus", claimedName: "Marcus Vance" },
        { id: "s2", label: "Thursday Dinner (Nov 19)", claimedBy: "", claimedName: "" },
        { id: "s3", label: "Saturday Dinner (Nov 21)", claimedBy: "", claimedName: "" },
      ],
      reactions: { amen: ["u-marcus"], help: ["u-elena"] },
      replies: [
        { id: "rep-1", by: "u-marcus", name: "Marcus Vance", text: "We've got Tuesday covered with baked ziti and salad!", at: new Date(now - 3600e3 * 5).toISOString() },
      ],
      at: new Date(now - 3600e3 * 12).toISOString(),
    },
    {
      id: `${cid}-post-2`, churchId: cid, boardId: `${cid}-brd-parents`, locationId: null,
      by: "u-marcus", authorName: "Marcus Vance",
      title: "Eastside Carpool for Friday Youth Night",
      body: "Driving our 7-passenger van from the Eastside shopping center at 6:15 PM this Friday. We have 3 open seats for middle or high schoolers!",
      postType: "ride", status: "approved", pinned: false, locked: false,
      slots: [
        { id: "r1", label: "Seat 1", claimedBy: "", claimedName: "" },
        { id: "r2", label: "Seat 2", claimedBy: "", claimedName: "" },
        { id: "r3", label: "Seat 3", claimedBy: "", claimedName: "" },
      ],
      reactions: { thanks: ["u-elena"] },
      replies: [],
      at: new Date(now - 3600e3 * 8).toISOString(),
    },
  ];
}

// Register boards & boardPosts in RECORD_KINDS and S.load
{
  if (typeof RECORD_KINDS !== "undefined" && !RECORD_KINDS.includes("boards")) RECORD_KINDS.push("boards", "boardPosts");
  if (typeof QUIET_KINDS !== "undefined" && !QUIET_KINDS.includes("boards")) QUIET_KINDS.push("boards", "boardPosts");
  const prevLoad = S.load.bind(S);
  S.load = function () {
    prevLoad();
    this.state.boards ||= [];
    this.state.boardPosts ||= [];
    Object.values(this.state.churches || {}).forEach((c) => {
      if (!Backend.configured() && !this.state.boards.some((b) => b.churchId === c.id)) {
        this.state.boards.push(...defaultBoardsFor(c.id));
        this.state.boardPosts.push(...defaultPostsFor(c.id));
      }
    });
  };
  if (S.state) {
    S.state.boards ||= [];
    S.state.boardPosts ||= [];
    Object.values(S.state.churches || {}).forEach((c) => {
      if (!Backend.configured() && !S.state.boards.some((b) => b.churchId === c.id)) {
        S.state.boards.push(...defaultBoardsFor(c.id));
        S.state.boardPosts.push(...defaultPostsFor(c.id));
      }
    });
  }
}

const canModBoard = () => S.isMember() && S.canAny(["manage.prayer", "manage.content", "manage.church", "manage.classes"]);
function boardsOf(cid = S.state.current) {
  let list = (S.state.boards || []).filter((b) => b.churchId === cid && S.inScope(b));
  if (!list.length && S.church(cid)) {
    // A church with no boards yet gets the starter set. On the live app they're only saved when a moderator opens the
    // board; everyone else sees them without saving anything.
    const seeded = defaultBoardsFor(cid);
    if (!Backend.configured() || canModBoard()) S.state.boards.push(...seeded);
    list = seeded;
  }
  return list.sort((a, b) => (a.order || 99) - (b.order || 99) || a.name.localeCompare(b.name));
}

let activeBoardId = "ALL";
let boardFilter = "all"; // all | pinned | needs | mine | pending

Screens.board = (tail = "") => {
  if (!S.church()) return { redirect: "churches" };
  if (!S.on("board")) return { redirect: "connect" };
  if (tail && S.state.boards.some((b) => b.id === tail)) activeBoardId = tail;
  const boards = boardsOf();
  if (activeBoardId !== "ALL" && !boards.some((b) => b.id === activeBoardId)) activeBoardId = "ALL";
  const mod = canModBoard(), me = S.me();
  const allPosts = (S.state.boardPosts || []).filter((p) => p.churchId === S.state.current && S.inScope(p));
  const pendingCount = allPosts.filter((p) => p.status === "pending" || p.status === "flagged").length;

  const visiblePosts = allPosts.filter((p) => {
    if (activeBoardId !== "ALL" && p.boardId !== activeBoardId) return false;
    if (boardFilter === "pending") return mod && (p.status === "pending" || p.status === "flagged");
    if (p.status !== "approved" && p.by !== me.id && !mod) return false;
    if (boardFilter === "pinned") return !!p.pinned;
    if (boardFilter === "needs") return p.postType === "need" || p.postType === "ride" || p.postType === "exchange";
    if (boardFilter === "mine") return p.by === me.id;
    return p.status === "approved" || p.by === me.id;
  }).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.at.localeCompare(a.at));

  const curBoard = boards.find((b) => b.id === activeBoardId);

  return {
    title: "Connect", tab: "connect",
    body: html`${seg(connectSeg(), "board")}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
        ${campusChip()}
        ${mod ? html`<a class="btn ghost sm" href="#admin-boards">${icon("shield")}Manage boards${pendingCount ? ` (${pendingCount})` : ""}</a>` : ""}
      </div>

      <div class="board-topics" role="tablist" aria-label="Community board topics">
        <button type="button" class="board-topic-card ${activeBoardId === "ALL" ? "active" : ""}" data-act="board-select" data-id="ALL">
          <span class="lead-ic">${icon("layers")}</span>
          <div><b>All topics</b><small>${plural(allPosts.filter((p) => p.status === "approved").length, "post")}</small></div>
        </button>
        ${boards.map((b) => {
          const cnt = allPosts.filter((p) => p.boardId === b.id && p.status === "approved").length;
          return html`<button type="button" class="board-topic-card ${activeBoardId === b.id ? "active" : ""}" data-act="board-select" data-id="${b.id}">
            <span class="lead-ic">${icon(b.icon || "people")}</span>
            <div><b>${b.name}</b><small>${plural(cnt, "post")}${b.requireApproval ? " · Moderated" : ""}</small></div>
          </button>`;
        })}
      </div>

      ${curBoard ? html`<div class="panel" style="margin-top:10px;padding:12px 16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>${curBoard.name}</b>${curBoard.requireApproval ? html`<span class="tag">Moderated topic</span>` : ""}</div><p class="faint" style="margin:4px 0 0">${curBoard.description}</p></div>` : ""}

      <div class="chips" style="margin-top:12px" role="group" aria-label="Filter posts">
        ${[
          ["all", "All posts"],
          ["needs", "Care, meals & rides"],
          ["pinned", "Pinned"],
          ["mine", "My posts"],
          ...(mod ? [["pending", `Moderation queue (${pendingCount})`]] : []),
        ].map(([k, l]) => html`<button type="button" class="chip" data-act="board-filter" data-f="${k}" aria-pressed="${boardFilter === k}">${l}</button>`)}
      </div>

      ${!S.isMember() ? needMember("post and reply on the community board") : html`
        <div class="btns" style="margin-top:10px">
          <button type="button" class="btn block" data-act="board-post-new">${icon("plus")}New community post</button>
        </div>`}

      <div class="board-feed" style="margin-top:14px">
        ${visiblePosts.length ? visiblePosts.map(renderBoardPost) : empty("No posts in this view yet. Start the conversation above!")}
      </div>`,
  };
};

function renderBoardPost(p) {
  const me = S.me(), mod = canModBoard(), mine = p.by === me.id;
  const board = (S.state.boards || []).find((b) => b.id === p.boardId);
  const typeBadge = { need: ["Care / Meal Train", "ok"], ride: ["Carpool / Ride", "brand"], exchange: ["Blessing Exchange", ""], poll: ["Poll", "brand"], discussion: ["Discussion", ""] }[p.postType] || ["Post", ""];
  const slots = p.slots || [];
  const pollOpts = p.pollOptions || [];
  const totalVotes = pollOpts.reduce((n, o) => n + (o.voters?.length || 0), 0);
  const replies = p.replies || [];

  return html`<article class="board-card ${p.pinned ? "is-pinned" : ""} ${p.status !== "approved" ? "is-pending" : ""}">
    <div class="board-card-head">
      ${avatar(S.user(p.by) || { id: p.by, name: p.authorName || "Member" }, "sm")}
      <div class="board-card-meta">
        <b>${p.authorName || S.userName(p.by)}</b>
        <span class="faint">${ago(p.at)}${board ? ` · ${board.name}` : ""}${p.locationId ? ` · ${locName(p.locationId)}` : ""}</span>
      </div>
      <div class="board-card-tags">
        ${p.pinned ? html`<span class="tag brand">Pinned</span>` : ""}
        ${p.status === "pending" ? html`<span class="tag warn">Awaiting approval</span>` : ""}
        ${p.status === "flagged" ? html`<span class="tag warn">Flagged</span>` : ""}
        <span class="tag ${typeBadge[1]}">${typeBadge[0]}</span>
      </div>
    </div>

    <h3 class="board-card-title">${p.title}</h3>
    <p class="board-card-body">${p.body}</p>

    ${slots.length ? html`<div class="board-slots">
      <div class="faint" style="font-size:.8rem;margin-bottom:6px"><b>Coordination slots (${slots.filter((s) => s.claimedBy).length}/${slots.length} claimed)</b></div>
      ${slots.map((s) => html`<div class="board-slot-row">
        <span><b>${s.label}</b>${s.claimedName ? html` · <span class="tag ok">Claimed by ${s.claimedName}</span>` : html` · <span class="faint">Open</span>`}</span>
        ${S.isMember() && (!s.claimedBy || s.claimedBy === me.id || mod) ? html`<button type="button" class="btn ${s.claimedBy ? "ghost" : ""} sm" data-act="board-slot-toggle" data-post="${p.id}" data-slot="${s.id}">${s.claimedBy ? "Release" : "Sign up"}</button>` : ""}
      </div>`)}
    </div>` : ""}

    ${pollOpts.length ? html`<div class="board-poll">
      ${pollOpts.map((o) => {
        const voted = (o.voters || []).includes(me.id);
        const pctVote = totalVotes ? Math.round(((o.voters?.length || 0) / totalVotes) * 100) : 0;
        return html`<button type="button" class="board-poll-opt ${voted ? "voted" : ""}" data-act="board-poll-vote" data-post="${p.id}" data-opt="${o.id}">
          <span class="board-poll-bar" style="width:${pctVote}%"></span>
          <span class="board-poll-label">${voted ? "✓ " : ""}${o.label}</span>
          <span class="board-poll-pct">${pctVote}% (${o.voters?.length || 0})</span>
        </button>`;
      })}
    </div>` : ""}

    <div class="board-reactions">
      ${REACTION_KINDS.map(([rk, rl]) => {
        const list = p.reactions?.[rk] || [];
        const active = list.includes(me.id);
        return html`<button type="button" class="react-chip ${active ? "on" : ""}" data-act="board-react" data-post="${p.id}" data-r="${rk}" aria-pressed="${active}">${rl}${list.length ? ` ${list.length}` : ""}</button>`;
      })}
      <button type="button" class="link-btn" data-act="board-reply-open" data-post="${p.id}">${icon("chat")}${plural(replies.length, "reply", "replies")}</button>
      ${S.isMember() && !mine ? html`<button type="button" class="link-btn faint" data-act="board-flag" data-post="${p.id}">Report</button>` : ""}
    </div>

    ${mod || mine ? html`<div class="board-mod-bar">
      ${mod && p.status !== "approved" ? html`<button type="button" class="btn sm" data-act="board-approve" data-post="${p.id}">${icon("check")}Approve post</button>` : ""}
      ${mod ? html`<button type="button" class="btn ghost sm" data-act="board-pin" data-post="${p.id}">${p.pinned ? "Unpin" : "Pin to top"}</button>` : ""}
      ${mod ? html`<button type="button" class="btn ghost sm" data-act="board-lock" data-post="${p.id}">${p.locked ? "Unlock replies" : "Lock replies"}</button>` : ""}
      <button type="button" class="btn danger sm" data-act="board-delete" data-post="${p.id}">Delete</button>
    </div>` : ""}

    ${replies.length ? html`<div class="board-replies">
      ${replies.map((r) => html`<div class="board-reply">
        <b>${r.name || S.userName(r.by)}</b> <span class="faint">${ago(r.at)}</span>
        ${mod || r.by === me.id ? html`<button type="button" class="link-btn" style="color:var(--warn);float:right" data-act="board-reply-del" data-post="${p.id}" data-reply="${r.id}">Remove</button>` : ""}
        <p style="margin:2px 0 0">${r.text}</p>
      </div>`)}
    </div>` : ""}

    ${S.isMember() && !p.locked ? html`<form data-form="board-reply" class="board-reply-form" novalidate>
      <input type="hidden" name="postId" value="${p.id}">
      <input type="text" name="text" placeholder="Write a comment or offer to help..." maxlength="600" required aria-label="Write a reply">
      <button class="btn sm">${icon("send")}</button>
    </form>` : p.locked ? html`<p class="faint" style="margin:8px 0 0;font-size:.82rem">Replies are locked on this post.</p>` : ""}
  </article>`;
}

Actions["board-select"] = (el) => { activeBoardId = el.dataset.id; render(); };
Actions["board-filter"] = (el) => { boardFilter = el.dataset.f; render(); };
Actions["board-post-new"] = () => {
  const boards = boardsOf();
  const defBoard = activeBoardId !== "ALL" ? activeBoardId : boards[0]?.id || "";
  openSheet("New community board post", html`<form data-form="board-post-save" novalidate>
    <label class="field"><span>Topic board</span><select name="boardId" required>${boards.map((b) => html`<option value="${b.id}" ${attr(b.id === defBoard, "selected")}>${b.name}${b.requireApproval ? " (moderated)" : ""}</option>`)}</select></label>
    <label class="field"><span>Post type</span><select name="postType" data-change="board-post-type">${POST_TYPES.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
    ${multiCampus() ? html`<label class="field"><span>Campus</span><select name="locationId">${locationOptions(S.campus() === "all" ? "" : S.campus())}</select></label>` : ""}
    <label class="field"><span>Headline</span><input type="text" name="title" required maxlength="100" placeholder="e.g., Meal Train for the Davis Family / Carpool to Youth Retreat"></label>
    <label class="field"><span>Details</span><textarea name="body" rows="4" required maxlength="1500" placeholder="Share the details, dates, or how people can coordinate..."></textarea></label>
    <label class="field" id="board-slots-field" hidden><span>Sign-up slots or poll choices (one per line)</span><textarea name="lines" rows="3" placeholder="Monday Dinner (May 4)&#10;Wednesday Dinner (May 6)&#10;Friday Dinner (May 8)"></textarea><small>Members can tap to sign up for a slot or vote on a poll option.</small></label>
    <button class="btn block">Post to board</button>
  </form>`, { wide: true });
};
Inputs["board-post-type"] = (el) => {
  const box = $("#board-slots-field", el.closest("form"));
  if (box) box.hidden = !["need", "ride", "poll"].includes(el.value);
};
Forms["board-post-save"] = (d, f) => {
  const board = (S.state.boards || []).find((b) => b.id === d.boardId);
  if (!board) return formError(f, "Choose a board.");
  const title = String(d.title || "").trim(), body = String(d.body || "").trim();
  if (!title || !body) return formError(f, "Enter a headline and details.");
  const lines = String(d.lines || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const needsMod = board.requireApproval && !canModBoard();
  const post = {
    id: uid(),
    churchId: S.state.current,
    boardId: board.id,
    locationId: d.locationId || null,
    by: S.me().id,
    authorName: S.me().name,
    title,
    body,
    postType: d.postType || "discussion",
    status: needsMod ? "pending" : "approved",
    pinned: false,
    locked: false,
    slots: ["need", "ride"].includes(d.postType) ? lines.map((l) => ({ id: uid(), label: l, claimedBy: "", claimedName: "" })) : [],
    pollOptions: d.postType === "poll" ? lines.map((l) => ({ id: uid(), label: l, voters: [] })) : [],
    reactions: {},
    replies: [],
    at: new Date().toISOString(),
  };
  S.state.boardPosts.unshift(post);
  S.save();
  logActivity(`Posted "${title}" on ${board.name}`, "board");
  closeSheet(true);
  toast(needsMod ? "Submitted! A moderator will approve your post shortly." : "Posted to the community board");
  render();
};

Actions["board-slot-toggle"] = (el) => {
  const p = (S.state.boardPosts || []).find((x) => x.id === el.dataset.post);
  const s = p?.slots?.find((x) => x.id === el.dataset.slot);
  if (!s || !S.isMember()) return;
  if (s.claimedBy) {
    s.claimedBy = ""; s.claimedName = "";
    toast("Slot released");
  } else {
    s.claimedBy = S.me().id; s.claimedName = S.me().name;
    if (p.by !== S.me().id) notify(p.by, { kind: "chat", title: `${S.me().name} signed up on your post`, body: `${s.label} — ${p.title}`, link: "#board" });
    toast(`Signed up for ${s.label}!`);
  }
  S.save(); render();
};

Actions["board-poll-vote"] = (el) => {
  const p = (S.state.boardPosts || []).find((x) => x.id === el.dataset.post);
  if (!p?.pollOptions || !S.isMember()) return;
  const me = S.me().id;
  p.pollOptions.forEach((o) => {
    o.voters = (o.voters || []).filter((u) => u !== me);
    if (o.id === el.dataset.opt) o.voters.push(me);
  });
  S.save(); render();
};

Actions["board-react"] = (el) => {
  const p = (S.state.boardPosts || []).find((x) => x.id === el.dataset.post);
  if (!p || !S.isMember()) return;
  const rk = el.dataset.r, me = S.me().id;
  p.reactions ||= {};
  const list = p.reactions[rk] || [];
  p.reactions[rk] = list.includes(me) ? list.filter((u) => u !== me) : [...list, me];
  S.save(); render();
};

Forms["board-reply"] = (d, f) => {
  const p = (S.state.boardPosts || []).find((x) => x.id === d.postId);
  const text = String(d.text || "").trim();
  if (!p || !text || p.locked) return;
  p.replies ||= [];
  p.replies.push({ id: uid(), by: S.me().id, name: S.me().name, text, at: new Date().toISOString() });
  if (p.by !== S.me().id) notify(p.by, { kind: "chat", title: `${S.me().name} replied to your post`, body: text.slice(0, 120), link: "#board" });
  S.save(); f.reset(); render();
};
Actions["board-reply-open"] = (el) => {
  const card = el.closest(".board-card");
  $("input[name=text]", card)?.focus();
};
Actions["board-reply-del"] = (el) => {
  const p = (S.state.boardPosts || []).find((x) => x.id === el.dataset.post);
  if (!p) return;
  p.replies = (p.replies || []).filter((r) => r.id !== el.dataset.reply);
  S.save(); render();
};
Actions["board-flag"] = (el) => {
  const p = (S.state.boardPosts || []).find((x) => x.id === el.dataset.post);
  if (!p) return;
  p.status = "flagged";
  S.save(); toast("Reported to board moderators"); render();
};
Actions["board-approve"] = (el) => {
  const p = (S.state.boardPosts || []).find((x) => x.id === el.dataset.post);
  if (!p || !canModBoard()) return;
  p.status = "approved";
  notify(p.by, { kind: "news", title: "Your community board post is live", body: p.title, link: "#board" });
  S.save(); toast("Post approved"); render();
};
Actions["board-pin"] = (el) => {
  const p = (S.state.boardPosts || []).find((x) => x.id === el.dataset.post);
  if (!p || !canModBoard()) return;
  p.pinned = !p.pinned; S.save(); toast(p.pinned ? "Pinned to top" : "Unpinned"); render();
};
Actions["board-lock"] = (el) => {
  const p = (S.state.boardPosts || []).find((x) => x.id === el.dataset.post);
  if (!p || !canModBoard()) return;
  p.locked = !p.locked; S.save(); toast(p.locked ? "Replies locked" : "Replies unlocked"); render();
};
Actions["board-delete"] = (el) => {
  S.state.boardPosts = (S.state.boardPosts || []).filter((x) => x.id !== el.dataset.post);
  S.save(); toast("Post removed"); render();
};

// ----- Admin Screen: Manage Community Boards & Moderation (#admin-boards) -----
AdminScreens.boards = () => {
  if (!canModBoard()) return guard("manage.content");
  const boards = boardsOf();
  const queue = (S.state.boardPosts || []).filter((p) => p.churchId === S.state.current && (p.status === "pending" || p.status === "flagged"));
  return {
    title: "Community boards", back: "admin",
    body: html`
      <p class="muted" style="margin-top:14px">Create localized topic boards for your church family, set whether posts require moderator approval first, and review flagged or pending posts.</p>
      <div class="btns"><button type="button" class="btn" data-act="board-topic-edit">${icon("plus")}New topic board</button><a class="btn ghost" href="#board">Open Community Board</a></div>

      ${queue.length ? html`<section class="sec"><h2 class="sec-head">Moderation queue (${queue.length})</h2><div class="board-feed">${queue.map(renderBoardPost)}</div></section>` : ""}

      <section class="sec"><h2 class="sec-head">Topic boards (${boards.length})</h2>
        <div class="rows">
          ${boards.map((b) => html`<button type="button" class="row" data-act="board-topic-edit" data-id="${b.id}">
            <span class="lead-ic">${icon(b.icon || "people")}</span>
            <span class="body"><span class="t">${b.name}</span><span class="s">${b.description || "No description"}${b.requireApproval ? " · Requires approval" : " · Instant posting"}</span></span>
            ${icon("edit")}
          </button>`)}
        </div>
      </section>`,
  };
};
Actions["board-topic-edit"] = (el) => {
  const b = (S.state.boards || []).find((x) => x.id === el.dataset.id) || { icon: "people", requireApproval: false };
  openSheet(b.id ? `Edit ${b.name}` : "New topic board", html`<form data-form="board-topic-save" novalidate>
    <input type="hidden" name="id" value="${b.id || ""}">
    <label class="field"><span>Board name</span><input type="text" name="name" value="${b.name || ""}" required maxlength="50" placeholder="Care & Meal Trains"></label>
    <label class="field"><span>Description</span><textarea name="description" rows="2" maxlength="200">${b.description || ""}</textarea></label>
    <label class="field"><span>Icon</span><select name="icon">${BOARD_ICONS.map(([k, l]) => html`<option value="${k}" ${attr(k === b.icon, "selected")}>${l}</option>`)}</select></label>
    ${multiCampus() ? html`<label class="field"><span>Campus scope</span><select name="locationId">${locationOptions(b.locationId)}</select></label>` : ""}
    <label class="check"><input type="checkbox" name="requireApproval" ${attr(b.requireApproval, "checked")}><span><b>Hold new member posts for moderator approval</b></span></label>
    <div class="btns"><button class="btn">Save board</button>${b.id ? html`<button type="button" class="btn danger" data-act="board-topic-del" data-id="${b.id}">Delete</button>` : ""}</div>
  </form>`);
};
Forms["board-topic-save"] = (d, f) => {
  const name = String(d.name || "").trim();
  if (!name) return formError(f, "Give the board a name.");
  const existing = (S.state.boards || []).find((x) => x.id === d.id);
  if (existing) {
    Object.assign(existing, { name, description: d.description || "", icon: d.icon || "people", locationId: d.locationId || null, requireApproval: !!d.requireApproval });
  } else {
    S.state.boards.push({ id: uid(), churchId: S.state.current, name, description: d.description || "", icon: d.icon || "people", locationId: d.locationId || null, requireApproval: !!d.requireApproval, order: boardsOf().length + 1 });
  }
  S.save(); closeSheet(true); toast("Board saved"); render();
};
Actions["board-topic-del"] = (el) => {
  S.state.boards = (S.state.boards || []).filter((x) => x.id !== el.dataset.id);
  S.save(); closeSheet(true); toast("Board deleted"); render();
};

// Hook Board tab into Connect segmented navigation
{
  const prevConnectSeg = connectSeg;
  connectSeg = () => {
    const base = prevConnectSeg();
    if (!base.some(([k]) => k === "board")) base.splice(1, 0, ["board", "Board", S.on("board")]);
    return base;
  };
}
