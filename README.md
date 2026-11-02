# Benjamin

**See where your money actually goes.** A personal money tracker that installs on your iPhone from the browser, works offline, and keeps your data in your own private GitHub repo.

- **One honest number.** Bank + cash + what people owe you − what you owe.
- **Import bank statements.** CSV, Excel or Numbers exports (Kotak, SBI, HDFC, ICICI, Axis, and most others). Every payment gets sorted into a category. Re-importing never creates duplicates, and payments you already logged by hand are matched instead of doubled.
- **Log anything in two seconds.** Type it like a text: `50 pan cash`, `zomato 420 split riya`, `aman owes me 500`, `got 15000 from mom`.
- **It learns.** Correct a category once, say "always", and every past and future payment from that payee follows. Notes you write on UPI payments (`diesel`, `Claude`) beat merchant names.
- **Ignores what isn't spending.** Transfers between your own accounts, group money you collect and pass on (trips, bookings), and lending are kept out of your totals.
- **Insights.** Month-by-month needs vs wants, the habits you want to watch (car wash, con store, pan store, subscriptions), late-night and small-payment leaks, bank fees, top payees.
- **A plan.** Split income into Needs / Wants / Future-you, set caps per category, get a "safe to spend today" number, check "can I afford it?", and read ground rules built from your own numbers.
- **People.** Who owes you, who you owe, splits, settling up. Incoming UPI from someone who owes you is offered as a settlement.

## Use it

Open the app → **Add to Home Screen** (Safari → Share). It runs full-screen and offline like a native app.

### Sync between devices (free, private)

Data is stored on each device and synced through a **private** GitHub repo you own (one JSON file). No server, no third parties.

1. Create a private repo (e.g. `benjamin-vault`).
2. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new?name=Benjamin+sync&expires_in=366&contents=write) with **Contents: Read and write** on that repo only.
3. In Benjamin: **Settings → Sync** → paste username, repo and token.
4. On another device: **Settings → Sync → Copy link** (or show the QR), and paste the link into Benjamin there.

Sync merges record by record (newest edit wins, deletions carry over), so editing on two devices offline is fine. Benjamin refuses to sync into a public repo.

### iOS Shortcut for instant logging

Shortcut: **Ask for Input** → **Open URL** `https://<you>.github.io/benjamin/#/add?text=[Provided Input]`. Say or type `80 chai cash`, tap **Log**.

## Privacy

The code is public; your data never is. It lives in your browser storage and your private repo. The built app has a strict Content-Security-Policy: it loads nothing from anywhere else and talks only to `api.github.com`. Fonts are self-hosted. No analytics.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests: parsing, rules, analytics, merge, sync, quick-add
npm run build      # typecheck + production build into dist/
```

Pushing to `main` runs the tests, builds, and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

### Seeding a vault from statements

`scripts/build-vault.ts` builds a vault file from statements plus a personal config (accounts, people, rules, overrides), using the same import code as the app. Keep the config and output **outside** this repo.

```bash
npx tsx scripts/build-vault.ts --statement statement.numbers --account bank \
  --config ~/benjamin-setup.json --out ~/vault.json --report
```

### Layout

| Path | What |
| --- | --- |
| `src/lib/statement.ts` | Finds the transaction table in any statement export; dates, amounts, Dr/Cr, balances |
| `src/lib/narration.ts` | Turns bank narrations into payee + note (Kotak, SBI, HDFC, ICICI UPI formats, NEFT, charges, ATM) |
| `src/lib/rules.ts` | Built-in merchant/keyword rules, your rules, priorities, fallbacks |
| `src/lib/importer.ts` | Dedupe, manual-entry matching, balance anchoring |
| `src/lib/analytics.ts` | Monthly stats, habits, balances, plan progress, insights |
| `src/lib/merge.ts`, `src/lib/github.ts` | Record-level merge and GitHub Contents API sync |
| `src/lib/quick.ts` | Quick-add text parser |
| `src/state/store.ts` | App state, persistence, undo, sync scheduling |
| `src/screens/*` | Home, Activity, Insights, Plan, People, Settings, sheets |

Not financial advice: Benjamin gives budgeting rules of thumb, not investment recommendations.

MIT licensed.
