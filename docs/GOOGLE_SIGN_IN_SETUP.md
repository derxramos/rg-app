# GOOGLE_SIGN_IN_SETUP.md — Turn on "Continue with Google"

A beginner guide. You do these steps by hand, one time. It takes about 20 to 30 minutes.
You do not need to write code. The code is already in the app.

**Use the Google account `rgservices.ph@gmail.com`** for every Google step below. It becomes the owner of the
Google "project". Use the same account for the whole life of the website, so you never lose access.

> The names of buttons in the Google Cloud Console change from time to time. If a name here is a little
> different on your screen, look for the closest name. The steps and ideas stay the same.

---

## 1. How it works (read this first, 1 minute)

1. The client clicks **Continue with Google** on the sign in page.
2. Google asks them to pick their Google account and say yes.
3. Google sends them back to our website. Supabase (our login service) makes their account if it is new.
4. The client is signed in. They did not type a password.

What the client shares with us: **name, email address and profile picture**. Nothing else. We never see their
Google password.

Rules in our app:

- **Clients and users can use Google.**
- **Admins can NOT use Google.** Admins must sign in with email, password and the 2-step code. If an admin
  clicks Google, they are signed out again and told to use the email form. This keeps the admin area safe.
- If a person already has an account with the same email, Google sign in joins the same account. They keep
  their requests.

You will do three things:

- **Part A:** make a "client" in Google (you get a Client ID and a Client Secret).
- **Part B:** paste them in Supabase and allow our website address.
- **Part C:** turn the button on in our app and test it.

---

## 2. Before you start

You need:

- The Google account `rgservices.ph@gmail.com` (you can sign in to it).
- Your Supabase project, and you can open its dashboard.
- The public address of your website. Examples in this guide:
  - Live site: `https://your-site.vercel.app` (use your real address everywhere you see this)
  - On your computer: `http://localhost:3000`
- Your Supabase **Project Reference**. Find it in the Supabase dashboard address:
  `https://supabase.com/dashboard/project/`**`abcdefghijklmno`** — the part at the end is the reference.
  Your Supabase address is then `https://abcdefghijklmno.supabase.co`.

Keep a text note open. You will copy a few values between two websites.

---

## Part A. Google Cloud Console

### A1. Make a project

1. Open <https://console.cloud.google.com> and sign in as `rgservices.ph@gmail.com`.
2. If Google asks you to accept the terms, accept them.
3. At the top, click the **project picker** (it may say "Select a project").
4. Click **New project**.
5. Project name: `RG Services Website`. Leave "Organization" as it is. Click **Create**.
6. Wait a few seconds. Make sure the new project is selected in the top bar.

### A2. Set up the "consent screen" (what the client sees)

This is the Google screen that says "RG'S Bookkeeping wants to access your Google account".

1. Open the menu (three lines, top left) → **APIs & Services** → **OAuth consent screen**.
   (On new accounts this is called **Google Auth Platform**. Click **Get started** if you see it.)
2. **App information**
   - App name: `RG'S Bookkeeping and Accounting Services`
   - User support email: `rgservices.ph@gmail.com`
3. **Audience**: choose **External**. (External means any person with a Google account.)
4. **Contact information**: enter `rgservices.ph@gmail.com`.
5. Accept the policy and click **Create** (or **Save and continue**).
6. **Branding** (if you see it): you may add a logo. It is optional. Skip it for now.
   - **Authorized domains**: **leave this empty.** Sign in works without it. The box is only for
     links to a home page or a privacy page on the consent screen, and we do not add those.
     - If you see the error **"Invalid domain: must be a top private domain"**, it means you typed a shared
       domain such as `supabase.co` or `vercel.app`. Google wants a domain that belongs to one owner.
       Just clear the box and continue.
     - If you later add links to the consent screen, use your own domain (for example `rgservices.ph`) or the
       full address with your name in front (for example `abcdefghijklmno.supabase.co`).
7. **Data access / Scopes**: the page starts empty. Add the three basic scopes yourself:
   1. Click **Add or remove scopes**.
   2. Tick these three (use the filter box if the list is long):
      - `.../auth/userinfo.email` (see your email address)
      - `.../auth/userinfo.profile` (see your name and picture)
      - `openid` (associate you with your personal info on Google)
   3. Click **Update**, then **Save** at the bottom of the Data Access page.

   These three are "non-sensitive" scopes, so Google does not need to review the app. Do **not** tick any
   other scope: extra scopes can force a Google review.

### A3. Publish the app (important)

A new Google app starts in **Testing** mode. In Testing mode, **only people you list as "test users" can sign in**.
Real clients would see an error. So:

1. Go to **Audience** (or the **OAuth consent screen** page).
2. Under **Publishing status**, click **Publish app** → **Confirm**.
3. The status must say **In production**.

Because we only ask for the three basic scopes (name, email, picture), Google does not need to review the app.
Google may show a small notice that the app is not verified if you add a logo or sensitive scopes. We do not.

### A4. Make the Client ID and Client Secret

1. Go to **APIs & Services** → **Credentials**.
   (On the new screen: **Google Auth Platform** → **Clients**.)
2. Click **Create credentials** → **OAuth client ID** (or **Create client**).
3. **Application type**: choose **Web application**.
4. **Name**: `RG website`.
5. **Authorized JavaScript origins** → **Add URI**. Add these, one by one:
   - `https://your-site.vercel.app` (your real live address, no slash at the end)
   - `http://localhost:3000` (only if you test on your computer)
6. **Authorized redirect URIs** → **Add URI**. Add this one:
   - `https://abcdefghijklmno.supabase.co/auth/v1/callback`
     (replace `abcdefghijklmno` with **your** Supabase Project Reference)

   > You can also copy this exact address from Supabase: Dashboard → **Authentication** →
   > **Sign In / Providers** (or **Providers**) → **Google**. It shows "Callback URL (for OAuth)".
   > Copy it from there so there is no typing mistake.
7. Click **Create**.
8. A box shows your **Client ID** and **Client secret**. Copy both into your text note.
   You can also click **Download JSON** and keep the file safe.

> **The Client Secret is like a password.** Never put it in the code, in GitHub, in a chat or in an email.
> It goes only into the Supabase dashboard (Part B).

---

## Part B. Supabase dashboard

### B1. Turn on the Google provider

1. Open your Supabase project dashboard.
2. Go to **Authentication** → **Sign In / Providers** (older name: **Providers**).
3. Find **Google** and open it.
4. Switch **Enable Sign in with Google** to **on**.
5. Paste the **Client ID** into **Client IDs**.
6. Paste the **Client Secret** into **Client Secret (for OAuth)**.
7. Leave **Skip nonce checks** off.
8. Click **Save**.

### B2. Allow our website address

Supabase only sends people back to addresses you allow.

1. Go to **Authentication** → **URL Configuration**.
2. **Site URL**: your live address, for example `https://your-site.vercel.app`.
3. **Redirect URLs** → **Add URL**. Add:
   - `https://your-site.vercel.app/**`
   - `http://localhost:3000/**` (only if you test on your computer)
4. Click **Save**.

> If this list is missing your address, Google sign in finishes but sends the person to the wrong page.

---

## Part C. Turn it on in our app

### C1. Set the website address

In your hosting settings (Vercel → your project → **Settings** → **Environment Variables**) make sure
`APP_BASE_URL` is your real live address, for example `https://your-site.vercel.app` (no slash at the end).
The app uses it to tell Google where to send people back.

### C2. Turn the button on

Add one more environment variable:

| Name | Value |
|---|---|
| `GOOGLE_SIGNIN_ENABLED` | `true` |

On your computer, put the same line in `.env.local`:

```
GOOGLE_SIGNIN_ENABLED=true
```

Then **redeploy** on Vercel (or restart `pnpm dev`). The **Continue with Google** button now shows on the
**Sign in** page and the **Create an account** page. While the value is `false` or missing, the button is hidden,
so nobody sees a broken button.

Note: the Client ID and Client Secret are **not** put in `.env`. Supabase keeps them.

---

## Part D. Test it

Test with a Google account that is **not** an admin account on the website.

1. Open the Sign in page in a private window.
2. Click **Continue with Google**. Pick a Google account.
3. You should land on **My requests** (`/account`).
4. Check in Supabase → **Authentication** → **Users**: the person is listed with the provider **google**.
5. Sign out and sign in again with Google. It should work without a new account.
6. Test the admin rule: sign in with Google using the same email as an admin account. You should be sent back to
   the Sign in page with the message "Admins sign in with email and password", and you are signed out.
7. Test "cancel": click Google, then close or cancel on the Google screen. You should see
   "Google sign in was cancelled".

---

## Problems and fixes

| What you see | Likely cause | Fix |
|---|---|---|
| Google says **Error 400: redirect_uri_mismatch** | The redirect URI in Google is not exactly the Supabase callback URL | Part A4 step 6: copy the callback URL from Supabase and paste it in Google. Check for a typo, `http` vs `https`, and a slash at the end. |
| "Invalid domain: must be a top private domain" in Authorized domains | You typed `supabase.co` or `vercel.app` (shared domains) | Leave Authorized domains empty (Part A2 step 6). It is not needed for sign in. |
| Google says **Access blocked: app has not completed verification** or "only test users" | The app is still in **Testing** | Part A3: publish the app so it says **In production**. |
| The button does not show | `GOOGLE_SIGNIN_ENABLED` is not `true`, or you did not redeploy | Part C2. |
| After Google, you come back to the Sign in page with "We could not sign you in with Google" | Client ID or Secret pasted wrong in Supabase, or the provider is off | Part B1: paste them again and Save. |
| After Google, you land on the wrong website address | Your address is missing in **Redirect URLs** | Part B2. |
| "Google sign in is not available" | The button was turned off, or Supabase keys are missing | Check `GOOGLE_SIGNIN_ENABLED`, and the Supabase variables. |
| An admin cannot use Google | By design | Admins use email, password and the 2-step code. |

---

## Good habits

- Keep the Google account `rgservices.ph@gmail.com` safe: turn on **2-Step Verification** for it. If someone
  takes this Google account, they could change the sign in settings.
- Do not share the Client Secret. If it leaks: Google Cloud Console → **Credentials** → your client →
  **Add secret** (make a new one), paste it in Supabase, then disable the old one.
- Our app asks only for name, email and picture. Our Privacy notice already covers the account data we keep.
  If you add other Google features later, check the notice again.
- When you move to your own domain, repeat Part A4 (add the new domain to **Authorized JavaScript origins**),
  Part B2 (Site URL and Redirect URLs) and Part C1 (`APP_BASE_URL`).

## Useful links

- Supabase: [Sign in with Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
- Google Cloud Console: <https://console.cloud.google.com>
