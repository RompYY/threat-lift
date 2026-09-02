# Threat Lift

A private, gamified workout tracker — dark black/purple theme, XP & levels, PR logging, weight tracking, and a 6-day training split (Mon–Sat, Sun rest). Everything is stored locally on your device — no accounts, no servers, no syncing.

## What's inside

- **Today tab** — your workout for the day, tap each set to check it off. Sets, exercises, and full workouts all earn XP.
- **PRs tab** — log a weight (and optional reps) for any exercise, see a trend sparkline and full history.
- **Weight tab** — log your body weight over time with a trend line. A banner reminds you to weigh in every Monday (or if it's been 7+ days).
- **Profile tab** — your level, title, current/best streak, total XP, which phase you're in (90-day habit-building vs. ongoing maintenance), and backup/export tools.
- **Weekly backup popup** — right after you finish Saturday's (day 6) workout, a popup asks you to download a data backup for the week. If Saturday's workout doesn't get completed (or the app doesn't get opened), it catches you instead on Monday, asking about the week that just ended. Either "Download Backup" or "Not now" dismisses it for that week; downloading always counts as done.

Your training week:

| Day | Workout |
|---|---|
| Monday | Push (Chest/Shoulders/Triceps) |
| Tuesday | Pull (Back/Biceps) |
| Wednesday | Legs |
| Thursday | Upper |
| Friday | Lower |
| Saturday | Push II |
| Sunday | Rest |

The first 90 days are tracked as a "habit-building" phase (shown on your Profile tab); after that the same 6-day cycle just keeps running indefinitely — no data loss, no reset.

## Deploying to GitHub Pages

1. **Create a new repository** on GitHub (any name you like — `threat-lift`, or keep whatever you already used, renaming the repo itself is optional and doesn't affect the app). It can be public or private — Pages works with either (private repos need GitHub Pro/Team/Enterprise, or make it public since there's no personal data in the code itself, only in your local browser storage).
2. **Upload these files** to the repo root (`index.html`, `styles.css`, `data.js`, `app.js`, `manifest.json`, `sw.js`, and the `icons/` folder). Easiest way:
   - On GitHub, click **Add file → Upload files**, drag in everything, and commit.
   - Or, if you use git locally:
     ```bash
     cd threat-lift
     git init
     git add .
     git commit -m "Initial commit"
     git branch -M main
     git remote add origin https://github.com/<your-username>/<repo-name>.git
     git push -u origin main
     ```
3. **Enable Pages**: In the repo, go to **Settings → Pages**. Under "Build and deployment", set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`. Save.
4. Wait a minute or two, then your app will be live at:
   `https://<your-username>.github.io/<repo-name>/`
5. **Install it on your phone**: open that URL in Safari (iOS) or Chrome (Android), then use "Add to Home Screen". It'll behave like a real app — its own icon, full-screen, and it works offline after the first load.

## Updating later

Whenever you want to tweak the workout plan or styling, edit the files and push again (or re-upload through the GitHub web UI) — GitHub Pages redeploys automatically within a minute or two. Your workout logs, XP, PRs, and weight history are **not** stored in the repo — they live in your phone's local browser storage, so redeploying the app code never touches your data.

## Backing up your data

Since everything lives in local storage on one device, go to the **Profile** tab and tap **Export Backup** every so often (especially before you'd ever clear browser data or switch phones). It downloads a `.json` file you can re-import from that same screen with **Import Backup**.

## Notes

- No backend, no analytics, no network calls except loading the app itself — totally private.
- If you ever want push notifications instead of the in-app weigh-in banner, that's a bigger lift (real Web Push needs a backend or a service like Firebase Cloud Messaging, and iOS PWAs only support it on 16.4+ after being added to the home screen) — happy to build that as a v2 if you want it later.
