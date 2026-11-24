// Our Faithful Church App's settings on its own website. Safe to publish: the publishable key only works within the
// database's row-level security rules. Never put a secret key (sb_secret_...) here.
window.OUR_FAITHFUL_CONFIG = {
  supabaseUrl: "https://iigterjskwnqmnoysbha.supabase.co",
  supabasePublishableKey: "sb_publishable_aga6WeZ8m1mj-vqH2H-J_w_-kSnAMFP",
  vapidPublicKey: "",   // added in SETUP.md step 7
  // The app's one address: ourfaithfulchurch.com/app/ (the website is at the root). The www name forwards here, and so
  // does the address it moved from, once this one is serving the app (SETUP.md, "Your own domain on Cloudflare").
  home: "https://ourfaithfulchurch.com/app/",
  movedFrom: ["gunterfrazier.github.io"],
  // Email sent from the app comes from the sender's name at this domain, verified in Resend (SETUP.md).
  emailDomain: "mail.ourfaithfulchurch.com",
  // Church web addresses (SETUP.md, "Church web addresses"). Every church's page is at ourfaithfulchurch.com/<church ID>.
  // Set churchSubdomains to true once the wildcard DNS record and the church-sites Worker are live, and the app shows
  // <church ID>.ourfaithfulchurch.com instead. shortDomain adds a shorter address, like "ofc.church".
  churchSubdomains: false,
  shortDomain: "",
};
