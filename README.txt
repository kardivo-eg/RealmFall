Realm Fall mini page for realmfall.kardivo.store

This is a separate Cloudflare project. It does not touch the Kardivo store code, and nothing in the store links to it.

Deploy:
  1. Unzip this folder and open a terminal inside it.
  2. Run: npx wrangler deploy
  3. Open https://realmfall.kardivo.store (DNS and the certificate are created automatically, it can take a minute).

To change the address later, edit public/index.html (search for realmfall.falix.pro) and run npx wrangler deploy again.
