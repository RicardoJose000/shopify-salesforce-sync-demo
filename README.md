# Shopify and Salesforce, kept in step

A working demo of a two-way sync between Shopify and Salesforce for customers, orders and stock.

**Open the demo:** https://ricardojose000.github.io/shopify-salesforce-sync-demo/

Both systems are simulated in the browser with sample data, so it's safe to click anything.
The sync rules are the same ones used in the real build:

- records matched by Shopify ID, so nothing is duplicated
- a webhook delivered twice is only processed once
- the sync's own writes are recognised on the way back, so updates never loop
- if a side is down, changes wait in a retry queue and go through once it's back

Real build: Shopify webhooks (HMAC checked) into a small sync service, upserts to Salesforce by Shopify ID,
and Salesforce Change Data Capture back to the Shopify Admin API.

Footage from Mixkit, photos from Unsplash. Shopify and Salesforce are trademarks of their owners.
