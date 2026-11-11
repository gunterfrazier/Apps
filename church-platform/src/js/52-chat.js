// ---------- Chat: group and class chats, teacher-parent chats, leadership chat and direct messages ----------
// Group, class and parent chats exist automatically for the people in them. In this preview, messages stay on this device.

function myChannels() {
  const me = S.me().id, cid = S.state.current, list = [];
  if (!S.isMember() || !S.on("chat") || !S.can("use.chat")) return list;
  if (S.can("chat.leaders")) list.push({ id: `leaders-${cid}`, kind: "leaders", name: "Leadership", sub: "Staff and leaders" });
  S.visible("gatherings", { ignoreCampus: true }).forEach((g) => {
    if (isIn(g)) list.push({ id: `g-${g.id}`, kind: "group", name: g.name, sub: g.type === "class" ? "Class chat" : "Group chat", gathering: g });
    if (g.ageMin != null && (kidsIn(g).length || isLeader(g))) list.push({ id: `p-${g.id}`, kind: "parents", name: `${g.name}: parents`, sub: "Teachers and parents", gathering: g });
  });
  S.state.channels.filter((c) => c.churchId === cid && c.members.includes(me)).forEach((c) => list.push({ id: c.id, kind: "dm", name: c.members.filter((x) => x !== me).map((x) => S.userName(x)).join(", "), sub: "Direct message", members: c.members }));
  return list;
}
const channelMessages = (id) => S.state.messages.filter((m) => m.channelId === id).sort((a, b) => a.at.localeCompare(b.at));
function isUnread(ch) { const last = channelMessages(ch.id).filter((m) => m.by !== S.me().id).pop(); return !!last && (!S.state.chatSeen[ch.id] || last.at > S.state.chatSeen[ch.id]); }
function unreadChats() { try { return myChannels().filter(isUnread).length; } catch { return 0; } }

Screens.chat = () => {
  if (!S.on("chat")) return { redirect: "home" };
  if (!S.isMember()) return { title: "Messages", back: "home", body: needMember("chat with your groups") };
  if (!S.can("use.chat")) return { title: "Messages", back: "home", body: noAccess("chat") };
  const chans = myChannels().map((c) => ({ ...c, last: channelMessages(c.id).pop() })).sort((a, b) => (b.last?.at || "").localeCompare(a.last?.at || ""));
  return {
    title: "Messages", back: "home",
    body: html`<div class="btns" style="margin-top:16px"><button class="btn" data-act="dm-new">${icon("plus")}New message</button></div>
      <div class="rows" style="margin-top:14px">${chans.length ? chans.map((c) => html`<a class="row" href="#thread-${c.id}"><span class="lead-ic">${icon(c.kind === "dm" ? "user" : c.kind === "leaders" ? "shield" : c.kind === "parents" ? "kid" : "people")}</span>
        <span class="body"><span class="t">${c.name}</span><span class="s">${c.last ? `${c.last.by === S.me().id ? "You" : S.userName(c.last.by).split(" ")[0]}: ${c.last.text.slice(0, 60)}` : c.sub}</span></span>
        ${isUnread(c) ? html`<span class="tag brand">New</span>` : c.last ? html`<span class="faint" style="font-size:.8rem;white-space:nowrap">${ago(c.last.at)}</span>` : ""}</a>`)
        : empty("Join a group or class to chat with it, or start a direct message.")}</div>
      <p class="faint">Chats for your groups and classes appear here automatically. Parents of kids in a class can talk with its teachers.</p>`,
  };
};

Screens.thread = (id) => {
  const ch = myChannels().find((c) => c.id === id);
  if (!ch) return { redirect: "chat" };
  const msgs = channelMessages(id);
  let lastDay = "";
  const who = ch.kind === "dm" ? "" : ch.kind === "leaders" ? "People whose role includes leadership chat" : ch.kind === "parents" ? `${listJoin(ch.gathering.leaders.map((u) => S.userName(u)))} and parents of kids in the class` : `${plural(gCount(ch.gathering), "member")}`;
  return {
    title: ch.name, back: "chat",
    body: html`${who ? html`<p class="faint" style="margin:12px 0 0">${who}</p>` : ""}
      <div class="thread" id="thread">${msgs.length ? msgs.map((m) => {
        const day = isoDay(m.at), mine = m.by === S.me().id;
        const sep = day !== lastDay ? (lastDay = day, html`<p class="day-sep">${isoDay(new Date()) === day ? "Today" : fmtDay(m.at)}</p>`) : "";
        return html`${sep}<div class="msg ${mine ? "mine" : ""}">${!mine ? html`<span class="msg-who">${S.userName(m.by)}</span>` : ""}<span class="msg-text">${m.text}</span><span class="msg-time">${fmtTime(m.at)}</span></div>`;
      }) : empty("No messages yet. Say hello.")}</div>
      <form class="composer" data-form="chat-send" novalidate><input type="hidden" name="ch" value="${id}"><label class="sr" for="msg">Message</label>
        <textarea id="msg" name="text" rows="1" placeholder="Message ${ch.kind === "dm" ? ch.name.split(" ")[0] : ch.name}" maxlength="2000"></textarea><button class="btn" aria-label="Send">${icon("send")}</button></form>
      ${IN_PREVIEW ? html`<p class="faint">In this preview, messages stay on this device.</p>` : ""}`,
    after() {
      S.state.chatSeen[id] = new Date().toISOString(); S.save();
      const t = $("#thread"); if (t) t.scrollTop = t.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
    },
  };
};
Forms["chat-send"] = (d, f) => {
  if (!d.text) return;
  S.state.messages.push({ id: uid(), channelId: d.ch, by: S.me().id, text: d.text, at: new Date().toISOString() });
  S.save(); render(); $("#msg")?.focus();
};
document.addEventListener("keydown", (e) => {
  if (e.target.id === "msg" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); }
});
Actions["dm-new"] = () => {
  const people = S.members().filter((m) => m.userId !== S.me().id).map((m) => S.user(m.userId)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  openSheet("New message", html`<label class="field" style="margin-top:0"><span class="sr">Search people</span><input type="search" placeholder="Search people" data-input="filter-rows" data-target="#dm-list" data-empty="#dm-none"></label>
    <div class="rows" id="dm-list">${people.map((u) => html`<button class="row" data-act="dm-start" data-user="${u.id}" data-search="${u.name}">${avatar(u)}<span class="body"><span class="t">${u.name}</span><span class="s">${S.role(S.state.current, u.id)?.name}</span></span>${icon("chev")}</button>`)}</div>
    <div id="dm-none" class="empty" hidden><p>Nobody matches.</p></div>`);
};
Actions["dm-start"] = (el) => {
  const me = S.me().id, other = el.dataset.user, cid = S.state.current;
  let ch = S.state.channels.find((c) => c.churchId === cid && c.members.length === 2 && c.members.includes(me) && c.members.includes(other));
  if (!ch) { ch = { id: `dm-${uid()}`, churchId: cid, kind: "dm", members: [me, other] }; S.state.channels.push(ch); S.save(); }
  closeSheet(true); go(`thread-${ch.id}`);
};
