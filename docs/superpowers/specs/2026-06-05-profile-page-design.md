# Profile Page — Design Spec

**Date:** 2026-06-05
**Status:** Approved (design), pending implementation plan
**Topic:** A user-facing Profile page to update profile fields, change email, and change password.

## Context

Today a ComEd Price Pulse account is just an email + password. The `User` model
(`app/models.py`) has only `email`, `hashed_password`, `created_at`, and the two
password-reset columns. Authenticated users have no way to manage their account from the
UI: there is no profile page, no profile-update endpoint, and the header `AccountMenu`
only shows the email text and a "Log out" button.

This spec adds a **Profile page** at `/profile` where a logged-in user can:

- set a **display name** and **timezone** (new fields),
- **change their email**, and
- **change their password** (endpoint already exists).

The page is reached from a new **account dropdown** in the header (not a top-nav tab).

## Goals / Non-goals

**Goals**
- Add `name` + `timezone` to the user record (one lightweight migration).
- Let users edit name/timezone, change email, and change password from one page.
- Reach the page via an account dropdown (Profile / Log out) in the header.
- Match existing design tokens and the `AuthForm` error/success patterns.

**Non-goals (YAGNI)**
- **No email-verification flow.** The app has no email verification anywhere (register
  auto-logs-in); adding it only on email change would be inconsistent scope creep.
  Email change instead requires re-entering the current password.
- No avatar/photo upload.
- No notification-preference or ComEd-connection management here — those live in the
  existing Alerts tab / ComEd connect flow.
- No account deletion in this version.

## Approach

**Separate endpoints per concern** rather than one mega-`PATCH`, because each concern has
different validation/security rules and this mirrors the existing split between
`change-password` and `reset-password`:

- Profile fields (name, timezone) — authenticated only.
- Change email — requires current-password re-entry + uniqueness check.
- Change password — already implemented (`POST /auth/change-password`), reused as-is.

A single `PATCH /auth/me` doing all three was rejected: password needs `old_password`,
email needs a password confirm, profile needs neither — conditional validation in one body
is muddier than three focused endpoints.

## Backend

### Model — `app/models.py` (`User`)
Add two nullable columns:
```python
name: Mapped[str | None] = mapped_column(Text, nullable=True)
timezone: Mapped[str | None] = mapped_column(Text, nullable=True)  # IANA, e.g. "America/Chicago"
```

### Migration — `app/database.py` (`init_db`)
No Alembic in this repo; `init_db()` runs `create_all` plus an idempotent list of
`ALTER TABLE … ADD COLUMN` statements (existing examples at lines 49–53). Append:
```
"ALTER TABLE users ADD COLUMN name TEXT",
"ALTER TABLE users ADD COLUMN timezone TEXT",
```
Each is wrapped in the existing try/except so it is a no-op when the column already exists,
and runs for both SQLite and Postgres.

### Schemas — `app/schemas.py`
- Extend `UserOut` with `name: str | None = None` and `timezone: str | None = None`.
- New `ProfileUpdateRequest { name: str | None, timezone: str | None }`.
  - `name`: optional, trimmed; empty string normalizes to `None`; max length 100.
  - `timezone`: optional; if present, validated against `zoneinfo.available_timezones()`
    and rejected (422) when unknown.
- New `ChangeEmailRequest { new_email: EmailStr, password: str }`.

### Endpoints — `app/api/auth.py` (all `Depends(get_current_user)`)
| Method | Path | Request | Success | Errors |
|---|---|---|---|---|
| PATCH | `/auth/me` | `ProfileUpdateRequest` | `UserOut` (200) | 422 invalid timezone |
| POST | `/auth/change-email` | `ChangeEmailRequest` | `UserOut` (200) | 401/403 wrong password; 409 email already in use |
| POST | `/auth/change-password` | `ChangePasswordRequest` | `{message}` (200) | **exists, unchanged** |

- `PATCH /auth/me`: apply provided fields (partial update — only keys sent are changed),
  commit, return refreshed `UserOut`.
- `POST /auth/change-email`: `verify_password(password, user.hashed_password)` → on
  mismatch raise the same error the change-password path uses; check no other user owns
  `new_email` (409 if taken); update `user.email`; commit; return `UserOut`. The session
  cookie is keyed by user id, so it stays valid after the change.

## Frontend

### API wrappers — `frontend/src/api/auth.js`
First add a `patch` helper to `frontend/src/api/client.js` — it exposes only `get/post/del`
today, but the underlying `request(method, …)` already accepts any verb, so this is one line:
```js
patch: (path, body, opts) => request("PATCH", path, body, opts),
```
Then add (alongside the existing `changePassword`):
```js
updateProfile: (fields) => api.patch("/auth/me", fields),
changeEmail: (new_email, password) => api.post("/auth/change-email", { new_email, password }),
```

### Auth context — `frontend/src/auth/AuthContext.jsx`
Expose three methods that call the API then `setUser(updated)` so the cached user stays
fresh: `updateProfile(fields)`, `changeEmail(new_email, password)`, and surface the
existing `changePassword(old, new)`.

### Page — `frontend/src/tabs/ProfilePage.jsx` (new)
A page rendered under `ProtectedRoute` at `/profile`, built from the existing card/design
tokens, with four independent sections — each its own small form with its own
busy/error/success state using the `AuthForm` conventions (`<p role="alert">` /
`<p role="status">`, `disabled={busy}`, "Working…"):

1. **Profile** — display name (text) + timezone (`<select>`). On submit → `updateProfile`.
2. **Email** — new email + current password. On submit → `changeEmail`.
3. **Password** — old password + new password. On submit → `changePassword`.
4. **Account** — read-only "Member since {created_at}" + a Log out button.

Timezone select is a curated US list (America/Chicago default, plus New_York, Denver,
Los_Angeles, Phoenix, Anchorage, Honolulu) rather than the full IANA list — right for a
ComEd/Illinois audience and simpler than a 400-entry dropdown. The backend still accepts
any valid IANA zone.

### Routing — `frontend/src/components/AppShell.jsx`
Add `<Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />`.
`/profile` is **not** added to `MENU` (nav.js) — it is reached from the account dropdown.

### Header dropdown — `frontend/src/components/AccountMenu.jsx`
Convert the authenticated inline `email + Log out` into a dropdown: a trigger button
showing the email (and a ▾), opening a popover with a **Profile** link (to `/profile`) and
a **Log out** action. Reuse the Esc + outside-click popover pattern from `ThemePicker.jsx`
(ref + `mousedown`/`keydown` listeners registered while open). Anonymous state (Log in →
`AuthModal`) is unchanged.

## Error handling
Reuse `ApiError { status, detail }`. Messages are per-section and inline:
- 409 on email → "That email is already in use."
- 422 on timezone → "Please choose a valid timezone."
- wrong password (email/password forms) → backend `detail`.
- Any other failure → `err.detail || "Something went wrong."`
No global redirects beyond the existing 401 handler.

## Testing

**Backend** (`tests/test_auth.py` or new `tests/test_profile.py`):
- `PATCH /auth/me` updates name + timezone; `/auth/me` then returns them.
- `PATCH /auth/me` with an unknown timezone → 422; record unchanged.
- `POST /auth/change-email` happy path updates email and returns it.
- `change-email` with wrong password → 401/403.
- `change-email` to an address another user owns → 409.

**Frontend**:
- `ProfilePage.test.jsx`: renders the four sections; submitting Profile calls
  `updateProfile` and shows the success status; email/password sections surface API errors;
  invalid input is handled.
- `AccountMenu.test.jsx`: authenticated dropdown opens, shows a Profile link to `/profile`
  and a Log out action; closes on Escape.

## Files touched
- `app/models.py` — User: add `name`, `timezone`.
- `app/database.py` — append two `ALTER TABLE users` migrations.
- `app/schemas.py` — extend `UserOut`; add `ProfileUpdateRequest`, `ChangeEmailRequest`.
- `app/api/auth.py` — add `PATCH /auth/me`, `POST /auth/change-email`.
- `frontend/src/api/client.js` — add a `patch` helper.
- `frontend/src/api/auth.js` — add `updateProfile`, `changeEmail`.
- `frontend/src/auth/AuthContext.jsx` — expose `updateProfile`, `changeEmail`, `changePassword`.
- `frontend/src/tabs/ProfilePage.jsx` — new page (+ `ProfilePage.css` if needed).
- `frontend/src/components/AppShell.jsx` — add `/profile` route.
- `frontend/src/components/AccountMenu.jsx` — convert to dropdown with Profile link.
- Tests: `tests/test_profile.py`, `frontend/src/tabs/ProfilePage.test.jsx`,
  `frontend/src/components/AccountMenu.test.jsx`.
