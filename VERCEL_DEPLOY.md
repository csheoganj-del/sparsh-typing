# Hindi practice on Vercel

The linked Vercel project is `typing`. Production uses private Vercel Blob storage for accounts and practice progress. Set `JWT_SECRET` and connect the private store before deploying. Never publish `.env` files, local progress files, account hashes, or passwords.

Production requires login to read or write progress. New accounts start empty; they never inherit another user’s history. Progress writes merge saved history and use conditional writes to protect simultaneous device updates. Storage failures remain visible in the app, and the browser retains its local copy for retry.

Run `npm test`, then deploy with `vercel --prod --yes`. Open the production alias shown by Vercel and sign in. The new permanent owner account credentials are kept in `.vercel/owner-login.txt`, outside Git and the deployment. This account replaces the old temporary default account; the old published default password is not used in the cloud.

Cloud saves are batched during typing and flushed after completed practice and logout. Look for “Saved to cloud” before moving to another device. Vercel Hobby storage quotas apply; no plan upgrade was made.
