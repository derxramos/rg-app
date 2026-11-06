# Security

## Reporting a problem

Please do **not** open a public issue for a security problem. Use GitHub's private reporting instead:
**Security tab > Report a vulnerability** on this repository. Say what you found and how to repeat it. Please do not
test against a real client's data.

## What protects the data (short version)

- The browser never talks to the database. Only the server does, and every server action and route checks access first.
- Row Level Security is ON for every table with no policies, so a leaked public key can read nothing.
- Client files are in a private bucket and are opened only through a 60 second link, after an admin check.
- Admins need a password and a 2FA code. Risky actions need a fresh code.
- **No secret is stored in this repository.** All keys live in the hosting settings (Vercel) and GitHub secrets. A test
  fails if a key, token or database password is ever committed.

See `docs/SECURITY_CHECKLIST.md` for every item and its proof.
