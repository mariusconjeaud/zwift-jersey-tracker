# Jersey Hunt

Track every Zwift jersey you've captured, world by world. Free, no account, and synced across your
devices with a **sync code**.

- **Site:** static React app (Vite) on GitHub Pages.
- **Sync API:** a Cloudflare Worker with a D1 (SQLite) database, both on Cloudflare's free plan.
- **Without sync:** the app still works; progress is saved in the browser, and the backup code
  (copy/paste) is always available.

```
GitHub Pages (React app) ──fetch──▶ Cloudflare Worker ──▶ D1: profiles(code, username, progress, …)
```

## How syncing works

1. On the first device, tap the sync button in the header ("This device only · sync"), pick a
   nickname and tap **Get a sync code**. The Worker creates a random code like `7KQ2-M9XD-4RTA`.
2. On another device, enter that code and tap **Link this device**. If that device already has
   jerseys ticked, you choose **Merge both** or **Use synced progress only**.
3. Or open the **personal link** shown next to the code, `<site>/#7KQ2-M9XD-4RTA`, which links the
   device in one tap and can be bookmarked.
4. From then on every tap is saved locally right away and pushed about a second later. Devices pull
   the latest copy when the app is opened or brought back to the foreground.

**Personal links.** The code after `#` never leaves the browser, so it isn't sent to the web host.
When the app opens with one:

- device not linked: it links, or asks "Merge both / Use synced progress only" if the device has
  jerseys of its own;
- already linked to that code: nothing changes, it just syncs;
- linked to another code: it asks before switching (the old progress stays saved under its code);
- bad or deleted code: it says so and leaves the device as it is.

The code stays in the address bar while it matches the linked code, so the page can be bookmarked.
It's removed when the user declines, the code is bad, or the device is unlinked. The app never adds
the code to the address bar by itself, so sharing the plain site address can't leak it.

The sync code is the only credential: anyone who has it can read and edit that progress, so it's
treated like a password, and so is the personal link. Codes are 12 Crockford base32 characters
(60 random bits), which makes guessing one impractical. Users can unlink a device or delete the cloud copy from the sync panel.

**Conflicts.** Each change is recorded as "set jersey X to state Y". Pushes include the revision they
were based on; if another device saved first, the Worker answers `409` with its copy, the app replays
its own pending changes on top and pushes again. Ticks and un-ticks from different devices are both
kept; for the same jersey, the last device to sync wins. Offline changes are kept in `localStorage`
and pushed when the connection is back.

**What's stored** (table `profiles`, see `worker/migrations/0001_init.sql`): the code, the nickname,
the progress string (same format as the backup code), a revision counter, when the user said they
donated, when they last dismissed the donation card, and created/updated timestamps. No email,
no IP address, no analytics.

## Badges

A panel at the top of the list shows 27 achievement badges with a progress bar each, the badges
already unlocked, and the three closest to unlocking ("Show all" lists every one). Unlocking one
while the app is open pops a toast. Badges are worked out from the jersey list, so nothing extra is
stored or synced, and un-ticking a jersey can lock a badge again. Combined jerseys don't count
towards milestones or world clears (same as the world counters), except in The Full English.

| Group | Badges |
| --- | --- |
| Milestones | Fresh Laundry (1 jersey), Laundry Day (10), Wardrobe Malfunction (25), Kit Hoarder (50), Lycra Dragon (100), Nothing Left to Wear (all) |
| Worlds | Jet Lagged (a jersey in every world, Bologna excused), one clear badge per world (Volcano Landlord, Shogun of Makuri, Le Patron, Ici c'est Paris, Mind the Gap, Big Apple Core, Filthy Richmond, Strudel Supremo, Flat Cap Legend, Laird of the Loch, Crit Happens, Full Bolognese), Ouhlala (France + Paris) |
| Collections | Green With Envy (all sprints), Chickenpox (all KOMs), Human Traffic Cone (all laps), The Full English (every combined at full) |
| Sets | Rainbow Wannabe (6 UCI course laps), Tickled Pink (Keith + Leith Hill), Buffalo Herd (Fuego Flats both ways) |

Definitions live in `src/badges.js`; add one by appending to `BADGES`.

## Donation card (World Bicycle Relief)

Once someone has ticked 5 jerseys, a card at the top of the list invites them to donate to your
World Bicycle Relief campaign. They can:

- **Donate to WBR ↗**: opens your campaign page in a new tab, then the card asks them to confirm.
- **I've donated**: the card never shows again (saved locally and, if synced, on every device).
- **Not now**: hidden for 30 days.

A small "Support World Bicycle Relief" link stays in the footer either way. Thresholds live in
`src/config.js`. To count how many users said they donated:

```sh
cd worker
npx wrangler d1 execute DB --remote --command \
  "SELECT COUNT(*) AS donors FROM profiles WHERE donated_at IS NOT NULL"
```

## Setup

### 1. Cloudflare: database and Worker (once)

```sh
cd worker
npm ci
npx wrangler login
npx wrangler d1 create jersey-hunt
```

Copy the `database_id` it prints into `worker/wrangler.toml` (replace the all-zero placeholder),
then:

```sh
npm run db:migrate:remote    # creates the profiles table
npx wrangler deploy          # prints https://jersey-hunt-sync.<your-subdomain>.workers.dev
```

`ALLOWED_ORIGINS` in `wrangler.toml` lists the sites allowed to call the API from a browser. It
already includes `https://mariusconjeaud.github.io` and the local dev servers; add your custom domain
there if you use one.

Optional: `wrangler.toml` has a commented-out `[[ratelimits]]` block that limits how many sync codes
one IP can create per minute. Enable it if the Rate Limiting binding is available on your plan; the
Worker picks it up automatically.

### 2. GitHub: Pages and settings

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → Variables**, add:
   - `SYNC_API_URL`: the Worker URL from step 1, e.g. `https://jersey-hunt-sync.<you>.workers.dev`
   - `DONATE_URL`: your World Bicycle Relief fundraising page. Until it's set, the link points to
     <https://worldbicyclerelief.org/>.
3. Optional, to deploy the Worker from GitHub on every change under `worker/`, add **Secrets**:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`: create it from the "Edit Cloudflare Workers" template and add the
     **Account → D1 → Edit** permission.

   Without these secrets the Worker workflow runs the tests and skips the deploy.
4. Push to `main` (or run the "Deploy site to GitHub Pages" workflow by hand). The site goes to
   `https://mariusconjeaud.github.io/zwift-jersey-tracker/`.

Changing a variable needs a new build: re-run the Pages workflow.

## Local development

```sh
# terminal 1: API with a local D1 database
cd worker && npm ci
npm run db:migrate:local
npm run dev                       # http://127.0.0.1:8787

# terminal 2: site
npm ci
cp .env.example .env.local        # points the site at the local API
npm run dev                       # http://localhost:5173
```

Tests (no Cloudflare account needed; the Worker tests run its real SQL on Node's built-in SQLite):

```sh
npm test                 # codec, sync engine, links, badges
cd worker && npm test    # API
```

## Project layout

| Path | What |
| --- | --- |
| `src/catalog.js` | The jersey catalog. IDs are part of the saved format: never rename one. |
| `src/codec.js` | Backup-code format, merging, change sets |
| `src/store.js` | localStorage persistence and the sync engine |
| `src/syncLink.js`, `src/useSyncLink.js` | Personal `#code` links |
| `src/badges.js` | Badge definitions and progress |
| `src/App.jsx` | The tracker UI |
| `src/components/Badges.jsx` | Badge panel and unlock toast |
| `src/components/SyncPanel.jsx` | Sync code + backup code panel |
| `src/components/DonateNag.jsx` | Donation card and footer link |
| `src/config.js` | API URL, donation URL, nag thresholds |
| `worker/src/index.js` | The sync API |
| `worker/migrations/` | D1 schema |

## Moving progress from the original artifact

In the old Jersey Hunt artifact, open "backup code", copy the code, then paste it into
**Restore from code** in the new app's sync panel. The format is unchanged, including the Vidéo list.

---

Fan-made, not affiliated with Zwift or World Bicycle Relief.
