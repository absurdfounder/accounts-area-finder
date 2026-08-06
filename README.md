# Accounts Area Finder

Static Super Sales Agro accounts browser with Google Contacts matching.

Live site: https://vocal-tulumba-d77c15.netlify.app

## Features

- Filter parties by year, state, region, area
- Connect Google Contacts (People API) or import CSV/vCard
- Suggested contact ↔ party matches; confirm links locally
- Search by phone number (Indian 10-digit normalization)

## Local run

```bash
npx --yes serve .
# or: python3 -m http.server 5173
```

Open the printed URL (use an origin you register in Google Cloud).

## Google Cloud setup (Connect with Google)

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable **People API**
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `https://vocal-tulumba-d77c15.netlify.app`
     - `http://localhost:5173` (and any other local origin you use)
5. Copy the client ID into [`config.js`](config.js):

```js
window.APP_CONFIG = {
  GOOGLE_CLIENT_ID: "123456789-xxxx.apps.googleusercontent.com",
  GOOGLE_API_KEY: "",
};
```

6. OAuth consent screen: add yourself as a test user while the app is in Testing

Scope used: `https://www.googleapis.com/auth/contacts.readonly`

Contacts and confirmed links are stored only in the browser (`localStorage`). Tokens are not persisted to a server.

## Import without Google OAuth

1. Open [Google Contacts](https://contacts.google.com) → Export
2. Export as Google CSV or vCard (`.vcf`)
3. In the app: **Import** → choose the file

For a quick local demo, import [`sample-contacts.csv`](sample-contacts.csv) — it includes a phone match for party `GRN` (Rajesh Nandlal).

## Redeploy to Netlify

```bash
npx --yes netlify-cli deploy --prod --dir . --site vocal-tulumba-d77c15
```

Ensure `config.js` on the machine you deploy from contains the real client ID (or set it in the Netlify UI after deploy if you prefer not to commit it).

## Scripts

| File | Role |
|------|------|
| `config.js` | Google client ID |
| `data.js` | Party accounts payload |
| `contacts.js` | Auth, sync, CSV/vCard, storage |
| `matcher.js` | Contact ↔ party scoring |
| `app.js` | UI |
