# Make status edits save to Notion and show for everyone (no Firebase)

This connects the status dropdowns on the site to your Notion EVENT PIPELINE. When anyone changes a
status, it saves into Notion (your master list), so everyone sees it on refresh. About 15 minutes,
mostly clicking. You do the account steps (I cannot log in or handle secret tokens for you); I already
wrote all the code.

There are two parts: (A) a Notion token so the site can write to Notion, and (B) Netlify to run the
small helper and host the site.

## A. Create a Notion integration token
1. Go to https://www.notion.so/my-integrations and click **New integration**.
2. Name it `Outreach HQ Web`. Associate it with your workspace. Type: Internal. Submit.
3. Copy the **Internal Integration Secret** (starts with `ntn_` or `secret_`). Keep it private. You will paste it into Netlify in step B, not to me.
4. Give the integration access to the database: open the **EVENT PIPELINE** database in Notion
   (https://app.notion.com/p/a20964d0ceae41c590ef819266ed1334), click the **...** menu (top right) >
   **Connections** > **Connect to** > pick `Outreach HQ Web`. Do the same for the **CONTACTS** and
   **Event Calendar** databases so it can link people and events.

## B. Connect the site to Netlify and add the token
1. Go to https://app.netlify.com (sign in with the same account you use for the World of Sports site).
2. **Add new site > Import an existing project > GitHub**, and pick the repo **Willpower-HQ/wp-hub-k7**.
3. Build settings: leave the build command empty, publish directory `.` (the netlify.toml in the repo already sets this). Deploy.
4. After it deploys, go to **Site configuration > Environment variables > Add a variable**:
   - Key: `NOTION_TOKEN`
   - Value: the secret you copied in step A3.
   Save, then **Deploys > Trigger deploy > Deploy site** so the token takes effect.
5. Netlify gives the site a URL like `https://willpower-outreach.netlify.app`. That becomes the live
   site (it has the save-to-Notion helper; the GitHub Pages URL does not). You can set a custom domain
   here later (e.g. hq.drinkwillpower.com).

## Done
On the Netlify URL, the status dropdowns now read the live statuses from Notion and write changes back.
Change a status, and a teammate who refreshes sees it, because it lives in Notion. The morning sync and
the Scout agent keep working the same way; the site only ever sets the Status field (and creates a row
with Owner = Bot if the person was not on the event yet), so it never overwrites what a human set.

If the token or Netlify is not set up yet, the site still works and the dropdowns save on your own
device, exactly as before. Tell me the Netlify URL once it is live and I will point everything at it.
