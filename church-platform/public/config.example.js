// Copy this file to config.js next to index.html on your website and fill it in (see SETUP.md).
// Everything here is safe to publish: the publishable key only works within your database's security rules.
// Never put a secret key (sb_secret_...) or the service_role key here.
window.OUR_FAITHFUL_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabasePublishableKey: "sb_publishable_...",
  vapidPublicKey: "YOUR-VAPID-PUBLIC-KEY",
  appUrl: "https://YOUR-SITE/",
  // Optional, for a site with its own domain. home is the one address people should end up at: www.YOUR-DOMAIN forwards
  // to it. movedFrom lists hosts the app used to live at; they forward once the new address is serving the app.
  // home: "https://YOUR-DOMAIN/",
  // movedFrom: ["OLD-HOST.example"],
};
