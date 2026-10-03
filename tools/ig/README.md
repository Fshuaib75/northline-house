# Instagram daily post

Every day at 18:30 Lagos time, GitHub posts one style to **@northline_house**. Each post is a feed photo (1080×1350) plus a story (1080×1920), and both go up automatically.
- **Which style:** this week's drop comes first, then styles you added recently, then best-value styles (₦18k–45k). It alternates Men and Women, and skips anything posted in the last 60 days or hidden from agents.
- **Look:** Sky & Ink, the same as the site: product photo, name, colour, sizes, price, "Order: link in bio".
- **Caption:** the description, price, sizes, delivery promise, how to order and hashtags.
- **Optional:** with `FB_PAGE_ID` set, it also posts to the Facebook Page.

Files: `.github/workflows/ig-autopost.yml` (the schedule), `tools/ig/autopost.py` (picks, draws, posts), `tools/ig/posted.json` (what was posted), `ig/` (images, kept 30 days). Fonts: Fraunces and Figtree (SIL Open Font License).

## Turning it on (one time, about 20 minutes)

1. **Make @northline_house a professional account.** In Instagram go to Settings → Account type and tools → Switch to professional account. Choose **Business** and the category **Shopping & retail**.
2. **Link it to a Facebook Page.** Create a page called "Northline House" if you don't have one. On the Page go to Settings → Linked accounts → Instagram → Connect.
3. **Create a Meta app.** Go to developers.facebook.com → My Apps → Create app → type **Business** → add the product **Instagram** → choose "API setup with Facebook login".
4. **Get a token.** Open Graph API Explorer (developers.facebook.com/tools/explorer) and choose your app.
   - Add these permissions: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, plus `pages_manage_posts` if you also want Facebook posts.
   - Click **Generate Access Token** and approve.
   - Make it long-lived: Access Token Debugger → **Extend Access Token**.
   - In the Explorer, run `me/accounts` with that long-lived token. Copy the Page's `access_token` (this one doesn't expire) and its `id`.
   - Run `<page-id>?fields=instagram_business_account`. The number it returns is your **IG_USER_ID**.
5. **Add the secrets.** On GitHub open the repo → Settings → Secrets and variables → Actions → New repository secret:
   - `IG_USER_ID`: the number from step 4
   - `IG_TOKEN`: the Page access token from step 4
   - `FB_PAGE_ID`: the Page id (optional, adds Facebook posts)
6. **Test it.** Go to Actions → Instagram daily post → Run workflow.
   - With "Preview only" ticked, the images and caption appear under the run's **Artifacts**.
   - Untick it to post for real.
7. **Bio:** put the shop link `https://fshuaib75.github.io/northline-house/shop/` in the Instagram bio, plus your WhatsApp number.

Never paste the token into a chat, a file or the repo. It belongs only in GitHub Secrets.

## Every day
- Nothing to do. Choose what gets posted by starring styles and pressing **Publish starred as this week's drop** in your book.
- To pause posting: Actions → Instagram daily post → ··· → Disable workflow.
- If a run fails (expired token, Instagram refused the photo), GitHub emails you, and the next run tries again with the same style.
