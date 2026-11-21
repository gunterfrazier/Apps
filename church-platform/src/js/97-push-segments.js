// ---------- Targeted Push Notifications & Dynamic User Segmentation (#admin-push) ----------
// Allows admins and ministry leaders to send targeted push notifications (and optional email/SMS simulcasts)
// to specific dynamic segments — such as only parents of 3rd graders, only the Worship team, specific campuses,
// or people registered for an upcoming event — with live recipient preview and deep-link routing.

const GRADE_BANDS = [
  ["grade:nursery", "Parents: Nursery & Toddlers (Ages 0–3)", 0, 3],
  ["grade:prek", "Parents: Pre-K (Ages 4–5)", 4, 5],
  ["grade:k", "Parents: Kindergarten (Age 5–6)", 5, 6],
  ["grade:1", "Parents: 1st Graders (Age 6–7)", 6, 7],
  ["grade:2", "Parents: 2nd Graders (Age 7–8)", 7, 8],
  ["grade:3", "Parents: 3rd Graders (Age 8–9)", 8, 9],
  ["grade:4", "Parents: 4th Graders (Age 9–10)", 9, 10],
  ["grade:5", "Parents: 5th Graders (Age 10–11)", 10, 11],
  ["grade:elem", "Parents: All Elementary (K–5th / Ages 5–11)", 5, 11],
  ["grade:middle", "Parents: Middle School (6th–8th / Ages 11–14)", 11, 14],
  ["grade:high", "Parents: High School (9th–12th / Ages 14–18)", 14, 18],
  ["grade:allkids", "Parents: Any child under 18", 0, 18],
];

/** Returns the household children array for any member userId. */
function familyChildrenOf(userId) {
  const u = S.user(userId);
  if (!u) return [];
  const list = userId === S.me().id ? (u.household || []) : (u.family || (Array.isArray(u.household) ? u.household : []));
  return Array.isArray(list) ? list.filter((p) => p.kind === "child" || p.birth) : [];
}

/** Builds all available dynamic target segments with their exact matching userId arrays. */
function buildTargetSegments() {
  const c = S.church();
  if (!c) return [];
  const members = S.members().filter((m) => S.user(m.userId));
  const allIds = [...new Set(members.map((m) => m.userId))];
  const uniq = (arr) => [...new Set(arr)].filter((u) => S.user(u));
  const segments = [];

  // 1. Church-wide
  segments.push({ key: "all", group: "General", label: "Everyone at church", ids: allIds });

  // 2. Parents by Child Grade / Age Band (always includes key bands like 3rd Graders so admins can pick or combine them)
  GRADE_BANDS.forEach(([key, label, minAge, maxAge]) => {
    const matched = uniq(allIds.filter((u) => {
      const kids = familyChildrenOf(u);
      return kids.some((k) => {
        const a = ageFrom(k.birth);
        if (a != null && a >= minAge && a <= maxAge) return true;
        if (k.grade != null && key === `grade:${k.grade}`) return true;
        return false;
      });
    }));
    // Also check kids registered in classes matching that age range
    const classKids = uniq(S.list("gatherings")
      .filter((g) => g.ageMin != null && g.ageMin <= maxAge && (g.ageMax ?? 18) >= minAge)
      .flatMap((g) => (g.members || []).filter((m) => m.childId && m.status === "in").map((m) => m.userId)));
    const combined = uniq([...matched, ...classKids]);
    segments.push({ key, group: "Parents by Child Grade & Age", label, ids: combined });
  });

  // 3. Parents of Kids Checked In Right Now
  const activeCheckinParents = uniq(S.list("checkins").filter((x) => !x.out && x.date === isoDay(new Date())).map((x) => x.by));
  if (activeCheckinParents.length) {
    segments.push({ key: "checkin:today", group: "Parents by Child Grade & Age", label: "Parents with kids checked in right now", ids: activeCheckinParents });
  }

  // 4. Volunteer & Ministry Teams (e.g. Worship Team, Kids Check-In, Welcome)
  teamsOf(c).forEach((t) => {
    const ids = uniq(S.list("teamMembers").filter((m) => m.team === t && m.status !== "requested").map((m) => m.userId));
    segments.push({ key: `team:${t}`, group: "Volunteer & Ministry Teams", label: `Team: ${t}`, ids });
  });
  const nextPlan = upcomingPlans()[0];
  if (nextPlan) {
    const nextCrew = uniq((nextPlan.assignments || []).filter((a) => a.status !== "declined").map((a) => a.userId));
    segments.push({ key: `plan:${nextPlan.id}`, group: "Volunteer & Ministry Teams", label: `Scheduled crew: ${nextPlan.title} (${fmtShort(fromIsoDay(nextPlan.date))})`, ids: nextCrew });
  }

  // 5. Classes & Small Groups (including Parents of each Kids Class)
  S.visible("gatherings", { ignoreCampus: true }).forEach((g) => {
    const memberIds = uniq([...(g.leaders || []), ...(g.members || []).filter((m) => m.status === "in").map((m) => m.userId)]);
    if (memberIds.length) {
      segments.push({ key: `group:${g.id}`, group: "Classes & Small Groups", label: `${g.type === "class" ? "Class" : "Group"}: ${g.name}`, ids: memberIds });
    }
    const parentIds = uniq((g.members || []).filter((m) => m.childId && m.status === "in").map((m) => m.userId));
    if (parentIds.length) {
      segments.push({ key: `parents:${g.id}`, group: "Parents by Child Grade & Age", label: `Parents of ${g.name}`, ids: parentIds });
    }
  });

  // 6. Roles & Leadership
  c.roles.forEach((r) => {
    const ids = uniq(members.filter((m) => m.roleId === r.id).map((m) => m.userId));
    if (ids.length) segments.push({ key: `role:${r.id}`, group: "Roles & Staff", label: `Role: ${r.name}`, ids });
  });
  const staffIds = uniq(members.filter((m) => isStaffMember(m.userId, c.id)).map((m) => m.userId));
  if (staffIds.length) segments.push({ key: "role:__staff", group: "Roles & Staff", label: "All Staff & Ministry Leaders", ids: staffIds });

  // 7. Campuses / Locations
  if ((c.locations || []).length > 1) {
    c.locations.forEach((l) => {
      const ids = uniq(members.filter((m) => m.locations === "all" || (Array.isArray(m.locations) && m.locations.includes(l.id)) || S.state.campus?.[c.id] === l.id).map((m) => m.userId));
      segments.push({ key: `loc:${l.id}`, group: "Campuses", label: `Campus: ${l.name} (${l.code})`, ids });
    });
  }

  // 8. Upcoming Event Registrants
  S.visible("events", { ignoreCampus: true }).filter((e) => e.signup && (e.registrations || []).length).slice(0, 10).forEach((e) => {
    const ids = uniq((e.registrations || []).map((r) => r.by));
    if (ids.length) segments.push({ key: `event:${e.id}`, group: "Event Registrants", label: `Signed up: ${e.title}`, ids });
  });

  return segments;
}

// Upgrade emailAudiences() so Email and Text screens also benefit from the richer parent/grade/team segments!
{
  const prevEmailAudiences = typeof emailAudiences === "function" ? emailAudiences : () => [];
  emailAudiences = function () {
    const base = prevEmailAudiences();
    const seenKeys = new Set(base.map(([k]) => k));
    buildTargetSegments().forEach((s) => {
      if (!seenKeys.has(s.key) && s.ids.length) {
        base.push([s.key, s.label, s.ids]);
        seenKeys.add(s.key);
      }
    });
    return base;
  };
  if (typeof RECORD_KINDS !== "undefined" && !RECORD_KINDS.includes("pushCampaigns")) RECORD_KINDS.push("pushCampaigns");
  if (typeof QUIET_KINDS !== "undefined" && !QUIET_KINDS.includes("pushCampaigns")) QUIET_KINDS.push("pushCampaigns");
  const prevLoad = S.load.bind(S);
  S.load = function () {
    prevLoad();
    this.state.pushCampaigns ||= [];
  };
  if (S.state) S.state.pushCampaigns ||= [];
}

// ----- Admin Screen: Targeted Push Notifications (#admin-push) -----
let pushAudienceChurch = null;
let selectedPushSegments = [];
let pushGroupQuery = "";
let pushGroupCategory = "";
let pushCombineMode = "any"; // "any" (Union) | "all" (Intersection)

function computeMatchedRecipients(segments) {
  const chosen = segments.filter((s) => selectedPushSegments.includes(s.key));
  if (!chosen.length) return [];
  if (pushCombineMode === "all") {
    const [first, ...rest] = chosen;
    return first.ids.filter((id) => rest.every((s) => s.ids.includes(id)));
  }
  return [...new Set(chosen.flatMap((s) => s.ids))];
}

AdminScreens.push = () => {
  if (!S.isMember() || !S.canAny(["manage.content", "send.email", "send.texts", "manage.church", "schedule.teams"])) return guard("manage.content");
  const segments = buildTargetSegments();
  if (pushAudienceChurch !== S.state.current) {
    pushAudienceChurch = S.state.current;
    selectedPushSegments = [];
    pushCombineMode = "any";
    pushGroupQuery = "";
    pushGroupCategory = "";
  }
  const groups = [...new Set(segments.map((s) => s.group))];
  if (!groups.includes(pushGroupCategory)) pushGroupCategory = "";
  const matchedIds = computeMatchedRecipients(segments);
  const history = (S.state.pushCampaigns || []).filter((p) => p.churchId === S.state.current).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);

  const deepLinks = [
    ["#alerts", "Notifications & Announcements (#alerts)"],
    ["#home", "Home screen (#home)"],
    ["#serving", "Volunteer Serving & Schedule (#serving)"],
    ["#board", "Community Board (#board)"],
    ["#checkin", "Family & Kids Check-In (#checkin)"],
    ["#give", "Giving (#give)"],
    ...upcomingEvents().slice(0, 5).map((e) => [`#event-${e.id}`, `Event: ${e.title}`]),
    ...sermonsSorted().slice(0, 3).map((s) => [`#sermon-${s.id}`, `Sermon: ${s.title}`]),
  ];

  return {
    title: "Targeted push notifications", back: "admin",
    body: html`
      <section class="sec">
        <h2 class="sec-head">1. Choose recipient groups</h2>
        <div class="panel seg-builder-panel">
          <div class="push-group-filters">
            <label class="field"><span>Search groups</span><input type="search" data-input="push-group-search" value="${pushGroupQuery}" placeholder="Worship, 3rd grade, East campus…"></label>
            <label class="field"><span>Category</span><select data-change="push-group-category"><option value="">All categories</option>
              ${groups.map((group) => html`<option value="${group}" ${attr(group === pushGroupCategory, "selected")}>${group}</option>`)}
            </select></label>
          </div>
          <div id="push-group-results" class="rows push-group-results">${pushGroupResults(segments)}</div>
          <div id="push-selected-groups">${pushSelectedGroups(segments)}</div>
          <label class="field"><span>When selecting multiple groups</span><select data-change="push-combine">
            <option value="any" ${attr(pushCombineMode === "any", "selected")}>Include members in any selected group</option>
            <option value="all" ${attr(pushCombineMode === "all", "selected")}>Include only members in every selected group</option>
          </select></label>
          <details class="seg-preview-bar">
            <summary id="push-recipient-count" aria-live="polite">${plural(matchedIds.length, "recipient")}</summary>
            <div id="push-recipient-list">${pushRecipientList(matchedIds)}</div>
          </details>
        </div>
      </section>

      <section class="sec">
        <h2 class="sec-head">2. Compose notification</h2>
        <form data-form="push-targeted-send" class="panel" novalidate>
          <label class="field"><span>Notification title</span><input type="text" name="title" required maxlength="90" placeholder="e.g., 3rd Grade Parents: Room Change This Sunday / Worship Team Rehearsal"></label>
          <label class="field"><span>Message body</span><textarea name="body" rows="3" required maxlength="400" placeholder="Write a concise, helpful update..."></textarea></label>
          <label class="field"><span>Where tapping the notification opens</span><select name="link">${deepLinks.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>

          <fieldset class="field" style="border:0;padding:0"><legend>Delivery channels</legend>
            <div class="chips">
              <label class="chip-check"><input type="checkbox" name="ch" value="push" checked><span>${icon("bell")}Web Push &amp; In-App Bell</span></label>
              ${S.can("send.email") ? html`<label class="chip-check"><input type="checkbox" name="ch" value="email"><span>${icon("mail")}Also send Email</span></label>` : ""}
              ${typeof textingOn === "function" && textingOn() && S.can("send.texts") ? html`<label class="chip-check"><input type="checkbox" name="ch" value="text"><span>${icon("phone")}Also send SMS Text</span></label>` : ""}
            </div>
          </fieldset>

          <button class="btn block" id="push-send" ${attr(!matchedIds.length, "disabled")}>${icon("send")}<span>Send to ${plural(matchedIds.length, "recipient")}</span></button>
        </form>
      </section>

      ${history.length ? html`<section class="sec">
        <h2 class="sec-head">Recent targeted campaigns</h2>
        <div class="rows">
          ${history.map((h) => html`<div class="row">
            <span class="lead-ic">${icon("bell")}</span>
            <span class="body">
              <span class="t">${h.title}</span>
              <span class="s">${h.body}</span>
              <span class="s faint">To: ${h.audienceLabel} (${plural(h.count, "person", "people")}) · ${ago(h.at)} by ${h.senderName}</span>
            </span>
            <span class="tag ok">Sent</span>
          </div>`)}
        </div>
      </section>` : ""}
    `,
  };
};

function pushGroupResults(segments) {
  const words = pushGroupQuery.toLowerCase().trim().split(/\s+/);
  const matches = segments.filter((s) => {
    const searchable = `${s.label} ${s.group}`.toLowerCase();
    return (!pushGroupCategory || s.group === pushGroupCategory) && words.every((word) => searchable.includes(word));
  });
  return matches.length ? matches.map((s) => html`<button type="button" class="row" data-act="push-seg-toggle" data-key="${s.key}" aria-pressed="${selectedPushSegments.includes(s.key)}">
    <span class="body"><span class="t">${s.label}</span><span class="s">${s.group}</span></span>
    <span class="tag">${s.ids.length}</span>
  </button>`) : empty("No groups match your search.");
}

function pushSelectedGroups(segments) {
  const chosen = segments.filter((s) => selectedPushSegments.includes(s.key));
  return chosen.length ? html`<div class="chips">${chosen.map((s) => html`<button type="button" class="chip" data-act="push-seg-toggle" data-key="${s.key}" aria-label="Remove ${s.label}">${s.label} ${icon("x")}</button>`)}
    <button type="button" class="chip" data-act="push-seg-clear">Clear selection</button></div>` : html`<p class="faint">No groups selected.</p>`;
}

function pushRecipientList(ids) {
  const names = ids.map((id) => S.userName(id)).sort((a, b) => a.localeCompare(b));
  return names.length ? html`<ul class="push-recipient-names">${names.map((name) => html`<li>${name}</li>`)}</ul>` : html`<p>No members match the selection.</p>`;
}

function refreshPushAudience() {
  const segments = buildTargetSegments();
  const ids = computeMatchedRecipients(segments);
  for (const button of $$("#push-group-results [aria-pressed]")) {
    button.setAttribute("aria-pressed", String(selectedPushSegments.includes(button.dataset.key)));
  }
  $("#push-selected-groups").innerHTML = flat(pushSelectedGroups(segments));
  $("#push-recipient-count").textContent = plural(ids.length, "recipient");
  $("#push-recipient-list").innerHTML = flat(pushRecipientList(ids));
  $("#push-send span").textContent = `Send to ${plural(ids.length, "recipient")}`;
  $("#push-send").disabled = !ids.length;
}

Actions["push-seg-toggle"] = (el) => {
  const k = el.dataset.key;
  selectedPushSegments = selectedPushSegments.includes(k) ? selectedPushSegments.filter((x) => x !== k) : [...selectedPushSegments, k];
  refreshPushAudience();
  if (!el.isConnected) $('[data-input="push-group-search"]').focus();
};
Actions["push-seg-clear"] = () => {
  selectedPushSegments = [];
  refreshPushAudience();
  $('[data-input="push-group-search"]').focus();
};
Inputs["push-combine"] = (el) => { pushCombineMode = el.value; refreshPushAudience(); };
Inputs["push-group-search"] = (el) => {
  pushGroupQuery = el.value;
  $("#push-group-results").innerHTML = flat(pushGroupResults(buildTargetSegments()));
};
Inputs["push-group-category"] = (el) => {
  pushGroupCategory = el.value;
  $("#push-group-results").innerHTML = flat(pushGroupResults(buildTargetSegments()));
};

Forms["push-targeted-send"] = async (d, f, fd) => {
  const segments = buildTargetSegments();
  const chosen = segments.filter((s) => selectedPushSegments.includes(s.key));
  const matchedIds = computeMatchedRecipients(segments);
  const title = String(d.title || "").trim(), body = String(d.body || "").trim();
  if (!title || !body) return formError(f, "Enter both a title and a message.");
  if (!chosen.length) return formError(f, "Select at least one target segment above.");
  if (!matchedIds.length) return formError(f, "No members currently match the selected segment(s).");

  const chans = fd.getAll("ch");
  const link = d.link || "#alerts";
  const audienceLabel = chosen.map((s) => s.label).join(pushCombineMode === "all" ? " AND " : " + ");

  if (chans.includes("push") || !chans.length) {
    matchedIds.forEach((u) => notify(u, { kind: "targeted", title, body, link, segment: audienceLabel }));
  }
  if (chans.includes("email") && Backend.on) {
    await Backend.call("send-email", { churchId: S.state.current, userIds: matchedIds, subject: title, body, audience: audienceLabel }).catch(() => {});
  }
  if (chans.includes("text") && Backend.on && !S.church().texting?.practice) {
    await Backend.call("texting", { action: "send", churchId: S.state.current, userIds: matchedIds, body: `${title}: ${body}`, audience: audienceLabel }).catch(() => {});
  }

  S.state.pushCampaigns.unshift({
    id: uid(),
    churchId: S.state.current,
    title,
    body,
    link,
    segments: selectedPushSegments,
    combineMode: pushCombineMode,
    audienceLabel,
    count: matchedIds.length,
    channels: chans,
    by: S.me().id,
    senderName: S.me().name,
    at: new Date().toISOString(),
  });
  logActivity(`Sent targeted notification "${title}" to ${plural(matchedIds.length, "person", "people")} (${audienceLabel})`, "push");
  S.save();
  f.reset();
  toast(`Targeted push sent to ${plural(matchedIds.length, "member")}`);
  render();
};
