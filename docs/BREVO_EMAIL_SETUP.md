# Brevo API email delivery from localhost

Beta sends signup verification codes and password recovery emails directly from Express through Brevo's API. Supabase creates accounts, generates OTPs, and verifies them; its Send Email hook is not used by these app flows.

## Local setup

Keep these backend-only settings in `server/.env`:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=your_verified_brevo_sender
BREVO_SENDER_NAME=Beta
FRONTEND_URL=http://localhost:5173
```

Use a Brevo **API key**, not an SMTP key. Use the Supabase **service-role/secret key** on the backend, since generating OTPs is an admin operation. Frontend `VITE_SUPABASE_ANON_KEY` remains a public key; never put the backend keys in `VITE_` variables.

Disable the old **Send Email** hook in **Supabase → Authentication → Hooks**. Keep email authentication and **Confirm Email** enabled. The backend no longer uses `SUPABASE_SEND_EMAIL_HOOK_SECRET`, a public callback URL, or an HTTPS tunnel.

Set Supabase's local Site URL to `http://localhost:5173` and allow `http://localhost:5173/auth?mode=update` for recovery. Use your actual frontend port if different. Express and Vite run locally; the backend only makes outbound calls to Supabase and Brevo.

Restart the backend after environment changes:

```powershell
cd C:\Users\HP\Desktop\beta\server
npm run dev
```

From the repository root, run `npm run dev` in another terminal for the frontend.

## Signup and verification

1. The signup form collects a name, email, and password.
2. `POST /api/auth/signup` validates input and asks Supabase's admin `generateLink` API to create an unconfirmed account and OTP. This operation generates credentials without sending an email.
3. Express sends the numeric OTP through Brevo. It returns only the email delivery outcome and resend cooldown; passwords, codes, token hashes, and privileged keys are never returned to the browser.
4. The app opens `/verify-otp`, which has only a code input. The email is carried in router state/tab session storage and displayed as context.
5. Supabase's `verifyOtp({email, token, type: 'email'})` validates the code. Only a confirmed account with a session can open the app. Incorrect or expired codes keep the user on the OTP page.
6. The signup name is stored as Supabase `user_metadata.full_name` and prefilled when onboarding creates the business profile.

The app supports Supabase numeric OTPs of 6–10 digits and preserves leading zeroes. Supabase controls expiration and one-time use. The password and code are not saved in tab storage.

If Brevo rejects the message after the account is created, signup still opens the OTP page with a delivery error. It does not report a successful email send. Users can resend after the cooldown without creating another account. For an existing unconfirmed account, sign in to reach the OTP page and use **Resend code**.

## Resend and recovery

- `POST /api/auth/resend` requests an OTP for an existing unconfirmed account and sends it through Brevo. It uses the admin recovery generator, which never creates accounts; Supabase's `type: 'email'` verifier accepts that OTP and confirms the account. Unknown and already confirmed accounts get a generic response with no verification email.
- `POST /api/auth/recover` generates a password recovery link and sends it through Brevo, using an allowed frontend redirect.
- All three endpoints share a 60-second per-email cooldown and an IP request limit. Signup verification never sends a login code to an already confirmed account.

## Check delivery

`/api/health` reports `email.provider: "brevo-api"`, `email.mode: "direct"`, and `email.configured: true` when the Brevo settings are present. This checks configuration, not inbox delivery.

Register a new account you control. Confirm it reaches the OTP-only page and the code arrives. Try an invalid code, resend after the cooldown, then verify the correct code opens onboarding with the name prefilled. Test recovery separately.

The backend terminal reports **Brevo accepted an authentication email** only after Brevo returns a message ID. Rejections report a safe HTTP status/error code, without logging passwords, recipient addresses, API keys, or OTPs. Check **Brevo → Transactional → Email logs** for delivery/spam/bounce issues after acceptance.

Automated checks: `npm run test -w server` and `npm run build -w apps/web`. Automated email tests use test doubles and send no real emails.

References: [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), [Supabase OTP token handling](https://github.com/supabase/auth/blob/master/internal/api/verify.go), and [Brevo transactional email API](https://developers.brevo.com/docs/send-a-transactional-email).
