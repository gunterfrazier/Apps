/**
 * Veritas Logos embed script. Add it once to a page, then use:
 *   <veritas-passage reference="John 3:16-18" translation="KJV"></veritas-passage>
 *   <veritas-word id="G26"></veritas-word>
 *   <veritas-person id="david"></veritas-person>
 *   <veritas-guide code="..."></veritas-guide>   (the code from a guide's embed link)
 * Add theme="light" or theme="dark" to force a theme.
 */
(function () {
  var script = document.currentScript;
  var base = script ? new URL(".", script.src).href : "";
  var BOOKS = ["genesis","exodus","leviticus","numbers","deuteronomy","joshua","judges","ruth","1samuel","2samuel","1kings","2kings","1chronicles","2chronicles","ezra","nehemiah","esther","job","psalms","proverbs","ecclesiastes","songofsolomon","isaiah","jeremiah","lamentations","ezekiel","daniel","hosea","joel","amos","obadiah","jonah","micah","nahum","habakkuk","zephaniah","haggai","zechariah","malachi","matthew","mark","luke","john","acts","romans","1corinthians","2corinthians","galatians","ephesians","philippians","colossians","1thessalonians","2thessalonians","1timothy","2timothy","titus","philemon","hebrews","james","1peter","2peter","1john","2john","3john","jude","revelation"];
  var frames = {};
  var counter = 0;
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (d && d.type === "veritas:height" && frames[d.id] && e.source === frames[d.id].contentWindow) frames[d.id].style.height = Math.ceil(d.height) + "px";
  });
  function slugFor(reference) {
    var m = String(reference).trim().toLowerCase().replace(/psalm\b/, "psalms").replace(/song of songs/, "song of solomon").replace(/[–—]/g, "-").match(/^(\d?\s?[a-z ]+?)\s*(\d+)(?::(\d+)(?:-(\d+))?)?$/);
    if (!m) return null;
    var book = m[1].replace(/\s+/g, "");
    if (BOOKS.indexOf(book) < 0) return null;
    return [book, m[2], m[3], m[4]].filter(Boolean).join("-");
  }
  function mount(el, hash) {
    if (el.firstChild) return;
    var id = "v" + ++counter;
    var theme = el.getAttribute("theme");
    var f = document.createElement("iframe");
    f.src = base + "embed.html?id=" + id + (theme ? "&theme=" + encodeURIComponent(theme) : "") + "#" + hash;
    f.title = el.getAttribute("title") || "Veritas Logos";
    f.loading = "lazy";
    f.style.cssText = "width:100%;height:220px;border:0;display:block";
    frames[id] = f;
    el.style.display = "block";
    el.appendChild(f);
  }
  function define(name, toHash) {
    if (customElements.get(name)) return;
    customElements.define(name, class extends HTMLElement {
      connectedCallback() {
        var hash = toHash(this);
        if (hash) mount(this, hash);
        else this.textContent = "Veritas Logos: this element needs a valid reference or id.";
      }
    });
  }
  define("veritas-passage", function (el) {
    var slug = slugFor(el.getAttribute("reference"));
    var t = (el.getAttribute("translation") || "").toLowerCase();
    return slug ? "passage-" + slug + (t ? "-" + t : "") : null;
  });
  define("veritas-word", function (el) { return el.id ? "word-" + el.id.toLowerCase() : null; });
  define("veritas-person", function (el) { return el.id ? "person-" + el.id : null; });
  define("veritas-guide", function (el) { var c = el.getAttribute("code"); return c ? "guide-" + c : null; });
})();
