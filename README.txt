Realm Fall page for realmfall.kardivo.store (status + start button)

Separate Cloudflare project. It does not touch the Kardivo store.

Deploy:
  1. In Falix, create an API key limited as tightly as the dashboard allows
     (ideally: view + start for the Realm Fall server only). Do NOT use a full-access key.
  2. (API base URL is already set to the Falix v2 API in wrangler.toml.)
  3. npx wrangler secret put FALIX_API_KEY      (paste the key; it is stored by Cloudflare, not in files)
  4. npx wrangler deploy
  5. Open https://realmfall.kardivo.store

The key must never be committed to GitHub or pasted into public/index.html.
