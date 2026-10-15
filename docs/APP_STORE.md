# UnicornRush on the App Store

The iPhone app is the same game as unicornrush.io, built into a native shell with
[Capacitor](https://capacitorjs.com) (`capacitor.config.ts`, project in `ios/`). Solo
games run entirely in the app; online rooms and the anonymous stats talk to
unicornrush.io (`src/client/net/api.ts`; the Worker allows the app's origin, see `withCors`
in `server/worker.ts`).

GitHub Actions builds it on a Mac runner and uploads it to TestFlight
(`.github/workflows/ios.yml`). Nobody needs a Mac.

## One-time setup

### 1. Register the app ID (developer.apple.com)
Certificates, Identifiers & Profiles → **Identifiers** → **+** → App IDs → App →
- Description: `UnicornRush`
- Bundle ID: **Explicit**, `io.unicornrush.app`
- Capabilities: leave the defaults. Continue → Register.

### 2. Create the app (App Store Connect)
appstoreconnect.apple.com → **Apps** → **+** → New App →
- Platform: iOS · Name: `UnicornRush` (if taken: `UnicornRush: City Tycoon`)
- Primary language: English · Bundle ID: `io.unicornrush.app` · SKU: `unicornrush`
- User access: Full access.

### 3. Create an API key for the build workflow
App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API** →
Team Keys → **+** → name `GitHub Actions`, access **Admin** (needed so Xcode can create the
signing certificate itself) → Generate. Download the `.p8` file (only possible once) and
note the **Key ID** and the **Issuer ID** at the top of the page.

Your **Team ID** is on developer.apple.com → Account → **Membership details**.

### 4. Add four secrets to GitHub
github.com/cleyfe/unicornrushIO → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
| --- | --- |
| `APPLE_TEAM_ID` | the 10-character Team ID |
| `ASC_KEY_ID` | the Key ID |
| `ASC_ISSUER_ID` | the Issuer ID (a UUID) |
| `ASC_KEY_P8` | the whole contents of the `.p8` file, including the BEGIN/END lines |

## Building a version

Actions → **iOS app** → Run workflow → version (e.g. `1.0`) → Run. Or push a tag:
`git tag app-v1.0 && git push origin app-v1.0`. The build number is the run number.

The build shows up in App Store Connect → **TestFlight** after Apple processes it
(5–30 minutes). Add yourself as an internal tester and install it with the TestFlight app.

## Submitting for review

In App Store Connect → the app → the iOS version page:

**Name:** UnicornRush
**Subtitle** (30): Race to $1B on real streets
**Promotional text** (170): Build a company on the real streets of Paris, New York, Zürich and more. Win customers, outsmart rival companies and be the first to reach a $1 billion valuation.
**Description:**

> Turn a tiny startup into a unicorn on the real streets of the world's cities.
>
> Every street is a market. Win its customers with your sales team, keep them with good
> service, and grow toward the rich neighbourhoods. Rival companies want the same streets:
> defend your front, launch ad campaigns, poach their sales staff or take them to court.
>
> • Real cities from OpenStreetMap: Paris, New York, London, Berlin, Zürich, Genève and more
> • Real-time strategy: every decision shows up on the map
> • Easy, Normal and Hard rivals
> • Play online with friends: create a room and share the code
> • Customers who stay spend more: hold your ground
> • Quick to learn, no ads, no account
>
> First to a $1 billion valuation wins.

**Keywords** (100): strategy,tycoon,business,city,map,startup,unicorn,territory,multiplayer,real-time,economy,io
**Support URL:** https://unicornrush.io · **Marketing URL:** https://unicornrush.io
**Privacy policy URL:** https://unicornrush.io/privacy-policy.html
**Category:** Games → Strategy (secondary: Simulation)
**Copyright:** 2026 (your name)
**Screenshots (6.9" iPhone, 1320×2868):** `app-assets/screenshots/1-menu.png` … `4-race.png`
**App icon:** included in the build.

**Age rating** questionnaire: answer *None* to everything (no violence, no gambling,
no user-generated content beyond company names in private rooms) → 4+.

**App Privacy** ("nutrition label"): Data collection → **Yes**:
- **Usage Data → Product Interaction** (games started and finished, city, difficulty):
  not linked to the user, not used for tracking, purpose *Analytics*.
- **Location → Coarse Location** (the country Cloudflare reports for each event):
  not linked to the user, not used for tracking, purpose *Analytics*.

Nothing else (no identifiers, no contact info). Tracking: **No**.

**Review notes:** "Single-player works offline. Online play: tap Create room; a second device
can join with the room code. No login."

## Later

- **Accounts:** if the app ever offers Google or Discord login, Apple requires **Sign in with
  Apple** too.
- **Purchases:** anything sold inside the app must use Apple's In-App Purchase.
- **Game Center** (leaderboards, achievements) needs the app record first; add it once the
  first build is on TestFlight.
- **Updating the native project** after changing the game: `npm run build && npx cap sync ios`
  (the workflow does this on every build).
