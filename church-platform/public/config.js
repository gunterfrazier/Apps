// Our Faithful Church App's settings on its own website. Safe to publish: the publishable key only works within the
// database's row-level security rules. Never put a secret key (sb_secret_...) here.
window.OUR_FAITHFUL_CONFIG = {
  supabaseUrl: "https://iigterjskwnqmnoysbha.supabase.co",
  supabasePublishableKey: "sb_publishable_aga6WeZ8m1mj-vqH2H-J_w_-kSnAMFP",
  vapidPublicKey: "",   // added in SETUP.md step 7
  // The app's one address. The www name forwards here, and so does the address it moved from, once this one is serving
  // the app (SETUP.md, "Your own domain on Cloudflare").
  home: "https://ourfaithfulchurch.com/",
  movedFrom: ["gunterfrazier.github.io"],
};
