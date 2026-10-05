# ASL Memory Match on Cloudflare

This Cloudflare Worker serves the game, handles photo requests and leaderboard submissions, and stores the shared top ten in D1.

## D1 setup

The `memorymatch` D1 database has already been created for this project. Run `schema.sql` in its SQL console to create the leaderboard table if it is not present.

## GitHub deployment

Cloudflare is configured to deploy the `memorymatch` Worker from this repository with `npx wrangler deploy`. Commit these project files to the repository's `main` branch. If no new build starts automatically, choose **Retry build** on the Cloudflare deployment page.

## Terminal deployment

```sh
npx wrangler login
npx wrangler d1 migrations apply memorymatch --remote
npx wrangler deploy
```

- D1 stores the shared top ten.
- The photo endpoint searches Wikimedia Commons and uses a seeded Picsum photo if it cannot find a match. Photos require an internet connection.
- The leaderboard accepts public submissions without accounts. Names and score values are validated; anyone with the site URL can submit a score.
