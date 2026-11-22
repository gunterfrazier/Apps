// ---------- Ministry resources ----------
// A short, checked list of free outside resources for kids, youth and church leaders, from the list at
// nickblevins.com/free-church-resources. These are other sites with their own terms, so the app links to them rather
// than copying them in. The one exception worth knowing: Ministry-to-Children's lessons are CC BY-SA 4.0, so a teacher
// may adapt them in the lesson builder as long as the lesson credits the author and links back, and shares alike.
// Sites from that list that are gone, stale or only sell curriculum are left out.

const MINISTRY_SITES = [
  ["Kids lessons you can use and adapt", "kids", [
    ["Ministry-to-Children", "https://ministry-to-children.com/", "Free Sunday school lessons, crafts and coloring pages. Licensed CC BY-SA 4.0: adapt them freely, credit the author and Ministry-to-Children.com with a link, and share your version the same way."],
    ["Rotation.org", "https://www.rotation.org/", "Creative Sunday school lessons and teaching ideas shared by teachers, now open to everyone. An optional yearly membership adds extras."],
    ["Life.Church Open Network", "https://open.life.church/", "Life.Church's kids curriculum, sermons, videos and graphics, free with an account."],
    ["The Meeting House Kids & Youth", "https://kidsandyouth.themeetinghouse.com/", "A Jesus-centered curriculum that places each Bible story in the whole story of Scripture. Free after you register."],
  ]],
  ["More for kids leaders (check each site's terms)", "kids", [
    ["Deeper KidMin", "https://deeperkidmin.com/", "Creative kids ministry ideas, with a free library for email subscribers. Full curriculum is paid."],
    ["Church Leaders: kids ministry", "https://churchleaders.com/children/free-resources-childrens-ministry", "Free articles, lessons and downloads for children's ministry leaders."],
    ["FourFiveSix", "https://www.fourfivesix.org/", "Training and a free idea podcast for preteen (4th to 6th grade) ministry."],
    ["Future Flying Saucers", "https://www.futureflyingsaucers.com/", "Mostly paid curriculum, with three free Gospel lessons for an email sign-up."],
  ]],
  ["Youth ministry", "youth", [
    ["Stuff You Can Use (Grow)", "https://www.stuffyoucanuse.org/", "Grow Curriculum for preschool, kids and students, plus free planning tools, games and training."],
    ["YouthMinistry360 free stuff", "https://youthministry360.com/free-stuff", "Free youth lessons and leader resources."],
    ["YouthMinistry.com freebie library", "https://youthministry.com/freebie-library/", "Free youth group games, lessons and articles from Group."],
    ["Dare 2 Share", "https://www.dare2share.org/products-resources/free-youth-leader-stuff/", "Free resources for youth leaders, focused on teens sharing their faith."],
    ["Church Leaders: youth ministry", "https://churchleaders.com/youth/free-resources-youth-leaders", "Free articles and downloads for youth leaders."],
    ["The Source for Youth Ministry", "https://www.thesource4ym.com/", "Free discussion ideas, games and event ideas. Not updated recently."],
  ]],
  ["Free tools for the whole church", "church", [
    ["Church Online Platform", "https://online.church/", "Life.Church's free platform for live and on-demand online services, with chat and prayer."],
    ["Church Metrics", "https://churchmetrics.com/", "Life.Church's free tool for tracking attendance, giving and other church numbers."],
    ["YouVersion Bible App", "https://www.bible.com/", "Free Bible app with reading plans your church can point people to."],
    ["Canva", "https://www.canva.com/canva-for-nonprofits/", "Graphic design. Canva's paid plan is free for qualifying nonprofits, including many churches."],
  ]],
];

Screens.ministryres = () => {
  const c = S.church();
  if (!c || !canBuild()) return { redirect: "admin" };
  const icons = { kids: "kid", youth: "people", church: "church" };
  return {
    title: "Ministry resources", back: "admin", tab: "home",
    body: html`<p class="muted" style="margin-top:14px">Free lessons, curriculum and tools from other ministries. They're separate sites with their own terms, so the app links to them. Use something in your own lesson only if its site allows it, and credit it as the site asks.</p>
      <p class="muted">For pictures and worship backgrounds, see the <a href="#medialib">Media library</a>.</p>
      ${MINISTRY_SITES.map(([group, kind, list]) => html`<section class="sec"><h2 class="sec-head">${group}</h2><div class="rows">${list.map(([name, url, what]) => html`<a class="row" href="${url}" target="_blank" rel="noopener"><span class="lead-ic">${icon(icons[kind] || "globe")}</span><span class="body"><span class="t">${name}</span><span class="s">${what}</span></span>${icon("chev")}</a>`)}</div></section>`)}
      <p class="faint">From the list at <a href="https://nickblevins.com/free-church-resources/" target="_blank" rel="noopener">nickblevins.com/free-church-resources</a>, checked November 2026.</p>`,
  };
};
