# SETUP_GUIDE.md

A step-by-step guide to put the website online. It is written for a beginner. Go in order. Do not skip a step.
Time: about 2 to 3 hours the first time. Cost: $0 (but read the Vercel note in step 8).

**Words you will see**

- **Repository (repo):** the folder of code on GitHub.
- **Environment variable:** a named setting (like a password or key) that you type into a website's settings page. The code reads it. It is never saved in the code.
- **Secret:** a value that must stay private. If someone gets it, they can harm the site.
- **Deploy:** put the website online.

**Golden rules**

1. Never paste a secret into a chat, an email, a screenshot, or the code.
2. Use a password manager (for example Bitwarden, free) to keep every password and key from this guide.
3. Turning on 2-step login (2FA) on your accounts is not required for now. Add it later, once the site works.

---

## Step 0. What you need

- A computer with Google Chrome.
- Your business Gmail (`rgsbookkeeping73@gmail.com`).
- Node.js 22 and pnpm on your computer (only for steps 4 and 5). Ask the developer to do steps 4 and 5 with you if you are not sure.

---

## Step 1. Make the code safe on GitHub (public repo)

The repository is public, so anyone can read the code. That is fine **because no secret is in the code**. A test checks this
every time. Do these once:

1. Sign in at github.com with your regular login.
2. Open your repo > **Settings** > **Code security** (or **Advanced Security**).
3. Turn **ON**: **Secret scanning** and **Push protection** (they block a key from being pushed by mistake) and **Private vulnerability reporting**. Also turn on **Dependabot alerts**.
4. **Settings** > **Branches** > **Add branch ruleset** (or **Add rule**) for `main`: tick **Block force pushes** and **Restrict deletions**. If you use a pull request flow, tick **Require a pull request**.
5. Never upload a file named `.env.local`. It is already ignored by git.

**If a key is ever shown in public by mistake:** treat it as stolen. Go to the service (Supabase, Brevo, Cloudflare), make a new key, delete the old key, and change the value in Vercel (step 8). Deleting the file from GitHub is **not** enough.

---

## Step 2. Supabase (database, files, admin login)

1. Go to supabase.com > **Start your project** > sign in (use GitHub or your Gmail).
2. Click **New project**. Fill in:
   - **Name:** `rg-bookkeeping`
   - **Database password:** click **Generate a password**. **Save it in your password manager now.** You cannot see it again.
   - **Region:** **Southeast Asia (Singapore)**. (The privacy notice says Singapore.)
   - Plan: **Free**.
3. Wait 1 to 2 minutes until the project is ready.
4. Lock the doors (very important for "nobody can read all the data"):
   - **Authentication** > **Sign In / Providers** (or **Providers**): turn **OFF** "Allow new users to sign up". Only invited admins should exist. Keep **Email** provider ON.
   - **Authentication** > **Multi-Factor** (or **Sign In / Providers**): make sure **TOTP** is enabled.
   - **Project Settings** > **API** (or **Data API**): keep **Enable Data API** turned **OFF**. If Supabase shows "Database access requires the Data API / Client library database queries will not work", ignore it. This app does not use that feature: the server talks to the database directly, and login and files use their own Supabase services. Turning it ON would only add a door that nobody needs.
   - **Storage**: the buckets are made later by a command (step 5). They must be **private**.
5. Copy the values you need (keep them in the password manager). See the table in step 7 for where each one goes:
   - **Project Settings** > **API Keys**: the **Project URL**, the **Publishable key**, and the **Secret key** (click **Reveal**).
   - Top bar > **Connect** (or **Project Settings** > **Database** > **Connection string**):
     - **Transaction pooler** (port **6543**) = `DATABASE_URL`
     - **Direct connection** (port **5432**) = `DIRECT_DATABASE_URL`. If the direct connection says "not IPv4 compatible", use the **Session pooler** string (port 5432) instead.
   - In each connection string, replace `[YOUR-PASSWORD]` with the database password from step 2.

---

## Step 3. Cloudflare Turnstile (spam check)

1. Go to dash.cloudflare.com > sign up (free)
2. Left menu > **Turnstile** > **Add widget** (or **Add site**).
3. **Widget name:** `rg-bookkeeping`. **Hostname:** add your Vercel address (for example `rg-bookkeeping.vercel.app`; you get it in step 8, so you can come back and add it). Also add `localhost` if you test on your computer.
4. **Widget Mode:** **Managed**. Click **Create**.
5. Copy the **Site Key** (public) and the **Secret Key** (private).

---

## Step 4. Brevo (emails)

1. Go to brevo.com > **Sign up free** > confirm your email.
2. **Senders, Domains & Dedicated IPs** (menu top right) > **Senders** > **Add a sender**. Name: `RG'S Bookkeeping and Accounting Services`. Email: `rgsbookkeeping73@gmail.com`. Brevo emails you a code. Enter it.
3. **SMTP & API** > **API Keys** > **Generate a new API key**. Name: `rg-app`. Copy it (you see it only once).

**Please know:** emails sent "from a Gmail address" through Brevo can land in the spam folder, because Gmail does not allow it. It works for testing. For real clients, the best fix is your own domain (for example `rgbookkeeping.ph`) and a sender like `hello@rgbookkeeping.ph`, verified in Brevo. When you get a domain, tell the developer.
Until then, the "new request" emails to you may go to Spam. Mark them "Not spam" the first time.

---

## Step 5. Create the tables and the first owner account (on a computer)

This step uses the terminal. If it is new for you, do it together with the developer.

1. Install **Node.js 22** (nodejs.org, "LTS") and then open a terminal and type `corepack enable`.
2. Download the code (`git clone <your repo address>`), open the folder `rg-app` in the terminal.
3. Copy the file `.env.example` to a new file named `.env.local`.
4. Fill `.env.local` with the values from steps 2, 3 and 4 and the table in step 7. For the first owner:
   - `SEED_OWNER_EMAIL=rgsbookkeeping73@gmail.com` (or the owner's own email)
   - `SEED_OWNER_NAME=` the owner's name
   - `SEED_OWNER_PASSWORD=` a strong password of 12 or more characters (save it in your password manager)
5. Run these commands one by one:

   ```bash
   pnpm install
   pnpm db:migrate        # makes the tables
   pnpm storage:setup     # makes the two storage buckets (client-files is private)
   pnpm db:seed           # default settings, the 6 services, and the OWNER account
   ```

   The seed prints a clear message when it creates the **owner** account. That account has the highest role.
6. **Delete the `SEED_OWNER_PASSWORD` line** from `.env.local` after the seed has run.
7. In the Supabase dashboard > **Storage**, check that `client-files` is **not** marked Public.

---

## Step 6. Make the secret `TOKEN_HASH_SECRET`

This is a long random text that you make yourself. In the terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the line it prints. Keep it in the password manager. Do not change it later, or old cookies and tracking locks reset.

---

## Step 7. All settings the app needs (the list)

Put these in `.env.local` (your computer) and, except the `SEED_` ones, in Vercel (step 8).

| Name | Secret? | Value / where to get it |
|---|---|---|
| `DATABASE_URL` | **Yes** | Supabase > Connect > **Transaction pooler** string (port 6543), password filled in |
| `DIRECT_DATABASE_URL` | **Yes** | Supabase > Connect > **Direct** string (port 5432), password filled in. Needed only for your computer and GitHub jobs, not for Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase > Project Settings > API > **Project URL** (`https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | No (public by design) | Supabase > Project Settings > API Keys > **Publishable key** |
| `SUPABASE_SECRET_KEY` | **Yes** | Supabase > Project Settings > API Keys > **Secret key** (Reveal) |
| `SUPABASE_BUCKET_CLIENT_FILES` | No | Type `client-files` |
| `SUPABASE_BUCKET_PUBLIC_ASSETS` | No | Type `public-assets` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No | Cloudflare Turnstile **Site Key** (step 3) |
| `TURNSTILE_SECRET_KEY` | **Yes** | Cloudflare Turnstile **Secret Key** (step 3) |
| `BREVO_API_KEY` | **Yes** | Brevo API key (step 4) |
| `EMAIL_FROM_ADDRESS` | No | `rgsbookkeeping73@gmail.com` (the verified sender from step 4) |
| `EMAIL_FROM_NAME` | No | `RG'S Bookkeeping and Accounting Services` |
| `ADMIN_NOTIFY_EMAIL` | No | `rgsbookkeeping73@gmail.com` (where "new request" emails go) |
| `APP_BASE_URL` | No | Optional on Vercel (it is found by itself). Fill it only when you add your own domain, for example `https://rgbookkeeping.ph` |
| `TOKEN_HASH_SECRET` | **Yes** | The random text from step 6 |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_NAME`, `SEED_OWNER_PASSWORD` | **Yes** (password) | Only for `pnpm db:seed` on your computer. **Do not add to Vercel** |
| `DEV_ADMIN_BYPASS_EMAIL`, `DB_POOL_MAX` | | **Leave empty / do not add** on Vercel. They are for development only |

The app refuses to start in production without `TOKEN_HASH_SECRET` and `TURNSTILE_SECRET_KEY`. That is on purpose.

---

## Step 8. Vercel (put the website online)

1. Go to vercel.com > **Sign Up** > **Continue with GitHub**
2. **Add New** > **Project** > pick your `rg-app` repo > **Import**.
3. If the repo has other folders, set **Root Directory** to the folder that holds `package.json` (`rg-app`).
4. Framework: **Next.js** (found by itself). Do not change the build settings.
5. Open **Environment Variables**. Add every variable from the table in step 7 (names exactly the same). Choose **Production** and **Preview**. Click **Deploy**.
   - The variables that start with `NEXT_PUBLIC_` and `DATABASE_URL` must be there **before** the build, because the public pages are built from the database.
6. When it finishes, Vercel shows your address, like `rg-bookkeeping.vercel.app`. Open it.
7. Go back to Cloudflare Turnstile and add this address to the widget hostnames (step 3).
8. Supabase > **Authentication** > **URL Configuration**: set **Site URL** to your Vercel address.

**Important note about the free plan:** Vercel's free **Hobby** plan is meant for **non-commercial** use. A business that takes real client requests may need the paid plan. Read Vercel's current terms (vercel.com/legal/terms and the Hobby plan page) and decide before you open the site to real clients. Also, each deploy and each visit uses the free limits, so avoid deploying for every tiny change.

---

## Step 9. GitHub jobs (cleanup and keep-alive)

These keep Supabase awake and delete old client files.

1. GitHub repo > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**. Add three secrets (same values as step 7):
   - `DIRECT_DATABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
2. **Actions** tab > **Scheduled jobs** > **Run workflow**. Both jobs must show a green check.
3. GitHub stops scheduled jobs in a public repo after 60 days without a commit. If the admin dashboard shows a warning about an old job, open **Actions** and run it again.

**Do not turn on the backup job (`ENABLE_BACKUP`) while the repo is public.** The backup file holds clients' personal data. Use the CSV export in the admin area every week instead, and keep the file private.

---

## Step 10. First login and first test

1. Open `https://<your address>/admin`.
2. Sign in with the owner email and the seed password.
3. The page asks you to set up 2FA. Scan the QR code with your authenticator app and enter the 6-digit code. Also add a **second device** as a backup if you can.
4. **Settings**: change the password if you want, check the contact details, and add your payment methods (GCash, Maya, BDO) with the real QR and the exact account name. Each change asks for a fresh 2FA code.
5. **Services**: the six service names are there. Add the requirement checklists yourself (the app does not invent requirements or fees).
6. Open the public site on your phone. Send one test request with an email like `zolb-test+1@example.com`, add a test payment, then check the request in `/admin` and verify the payment. Check that:
   - you got the "new request" email (also look in Spam),
   - the tracking page shows the status,
   - the client gets a "payment received" email (a simple acknowledgment, not an official receipt).
7. Delete the test request in the admin area (Delete client data, owner only).
8. Read the privacy notice (`/privacy`) and the Terms (`/terms`). They are written in plain words, but you must approve them. Ask a lawyer to check them if you can.
9. Walk through `docs/SECURITY_CHECKLIST.md` section 3 and tick each item.

---

## If something goes wrong

| What you see | What to try |
|---|---|
| Vercel build fails with "DATABASE_URL" | The variable is missing or has the wrong password. Fix it in Vercel > Settings > Environment Variables, then **Redeploy** |
| The page says the spam check failed | The Turnstile hostname list does not include your address (step 3), or the two Turnstile keys are swapped |
| No emails arrive | Check Brevo > **Transactional** > **Logs**. Check Spam. Check the sender is verified |
| Cannot sign in to admin | Check the seed ran (step 5) and the email is the same. Check that the clock on your phone is automatic (2FA codes depend on it) |
| Uploads fail | Run `pnpm storage:setup` again, and check that `SUPABASE_SECRET_KEY` is the **Secret** key, not the Publishable key |
