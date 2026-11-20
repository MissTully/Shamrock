/* Public parade pages: upgrade the sign-in link when a member session exists. */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

var url = "https://oazwkwflgbthojvnclfc.supabase.co";
var key = "sb_publishable_aMCyVxkiolMuBt9_R990CA_xQmXLaaS";

function boot() {
  if (!window.kosParadeRsvp || typeof window.kosParadeRsvp.mountAll !== "function") return;
  var client = createClient(url, key);
  window.__kosPublicSb = client;
  window.kosParadeRsvp.mountAll(document, { client: client, publicPage: true });
}

boot();
