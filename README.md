# ASL Memory Match on Cloudflare

This Cloudflare Worker serves the game, handles photo requests and leaderboard submissions, and stores the shared top ten in D1.

## D1 setup

The `memorymatch` D1 database has already been created for this project. Run `schema.sql` in its SQL console to create the leaderboard table if it is not present.

## GitHub deployment

Cloudflare is configured to deploy the `memorymatch` Worker from this repository with `npx wrangler deploy`. Commit these project files to the repository's `main` branch. If no new build starts automatically, choose **Retry build** on the Cloudflare deployment page.

## Teacher leaderboard reset

The game includes a teacher reset button. Set a Worker secret before using it. In Cloudflare, open the `memorymatch` Worker, go to **Settings → Variables and Secrets**, and add a secret named `LEADERBOARD_RESET_PASSWORD`. Choose a strong password and share it only with trusted teachers. The password is checked by the Worker and is never stored in the public game page.

You can also set it from a trusted terminal with `npx wrangler secret put LEADERBOARD_RESET_PASSWORD`.

## Terminal deployment

```sh
npx wrangler login
npx wrangler d1 migrations apply memorymatch --remote
npx wrangler deploy
```

- D1 stores the shared top ten.
- Every deck pairs each meaning photo with an ASL sign card and an embedded Sign ASL video. When the dictionary lacks a clip for an exact compound or pictured item, the game uses a closely related word with an available clip; clips may show regional or contextual variants.
- Meaning photos search Wikimedia Commons first. Cloudflare tries a term-tagged LoremFlickr photo if needed; the browser uses the matching emoji only if both photo sources are unavailable. Photos require an internet connection.
- The leaderboard accepts public submissions without accounts. Names and score values are validated; anyone with the site URL can submit a score.
