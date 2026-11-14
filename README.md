# East Creek Living

Website for eastcreekliving.com, hosted on Cloudflare Workers (Worker name: `index`).

- `public/index.html` / `public/location.html`: the site pages. Edit these directly; every commit to `main` redeploys.
- `src/index.js`: form handler that sends the Community Survey and Housing Interest forms to Airtable. Field names and dropdown options are at the top of the file.
- `wrangler.jsonc`: Cloudflare config.

Secret required on the Worker: `AIRTABLE_PERSONAL_ACCESS_TOKEN`.
