# Turn Outreach HQ into a live, logged-in app (one-time setup)

This makes the site require a team password to open, and makes every edit (status changes)
save to a shared cloud database so a change by one person shows for everyone. About 10 minutes,
all clicks, no coding. You need to be signed into Google as events@drinkwillpower.com.

## 1. Create the Firebase project
1. Go to https://console.firebase.google.com and click **Add project**.
2. Name it `willpower-outreach` (or anything). Turn OFF Google Analytics (not needed). Create.

## 2. Add a Web App and copy the config
1. On the project home, click the **</>** (Web) icon to "Add app to get started".
2. Nickname it `hq`, click **Register app** (skip Firebase Hosting).
3. It shows a `firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." }` block.
   **Copy that whole block and paste it back to me in chat.** (These values are safe to share; they are meant to live in the public web page. Security comes from the login + rules below.)

## 3. Turn on Email/Password login
1. Left menu: **Build > Authentication > Get started**.
2. **Sign-in method** tab > **Email/Password** > Enable > Save.
3. **Users** tab > **Add user**. Email: `team@drinkwillpower.com` (any address works, it is just the shared login). Password: pick the team password you want everyone to use. Add.
   - Tell me the email you used. Do NOT send me the password; the team just needs to know it.

## 4. Turn on the database
1. Left menu: **Build > Firestore Database > Create database**.
2. Choose **Start in production mode**. Pick the US region. Enable.
3. Go to the **Rules** tab, replace everything with this, and Publish:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
This means only someone logged in with the team password can read or change anything.

## 5. Hand back to me
Paste the `firebaseConfig` block (step 2) and the login email (step 3). I flip it on, and from then on:
- Opening the site asks for the team password once (then it remembers on that device).
- Setting a status on any event saves to the shared database and updates live for everyone with the site open.
- The morning sync reads those edits and writes them into Notion, so the CRM stays the record of truth.

Until you send the config, the site keeps working exactly as it does now (edits save on your own device only).
