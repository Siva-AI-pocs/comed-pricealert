# Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/profile` page where a logged-in user can edit their display name + timezone, change their email, and change their password, reached from an account dropdown in the header.

**Architecture:** Backend adds two nullable `User` columns (`name`, `timezone`) via the repo's idempotent `ALTER TABLE` pattern in `init_db()` (no Alembic), plus two new authenticated endpoints (`PATCH /auth/me`, `POST /auth/change-email`) alongside the existing `POST /auth/change-password`. Frontend adds a `patch` client helper, two `authApi` wrappers, three `AuthContext` methods, a `ProfilePage` (ProtectedRoute) with four independent form sections, and converts `AccountMenu` into a dropdown reusing the ThemePicker popover pattern.

**Tech Stack:** FastAPI · SQLAlchemy · Pydantic v2 · pytest/TestClient (in-memory SQLite) · React · React Router · Vitest · Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-05-profile-page-design.md`

**Working dir / commands:**
- Backend tests: from repo root `D:\personal-projects\comed-pricealert` → `./venv/Scripts/python.exe -m pytest <path> -v`
- Frontend tests: from `frontend/` → `npx vitest run <path>`
- The dev backend may be running on :8000 (PID from earlier). Restart it after backend changes: it auto-runs `init_db()` on startup.

---

## File Structure

**Backend**
- `app/models.py` — `User`: add `name`, `timezone` columns.
- `app/database.py` — `init_db()`: append two `ALTER TABLE users ADD COLUMN` migrations.
- `app/schemas.py` — extend `UserOut`; add `ProfileUpdateRequest`, `ChangeEmailRequest`.
- `app/api/auth.py` — add `_user_out()` helper; refactor `register`/`login`/`me` to use it; add `PATCH /auth/me` and `POST /auth/change-email`.
- `tests/test_api_profile.py` — new backend tests.

**Frontend**
- `frontend/src/api/client.js` — add `patch` helper.
- `frontend/src/api/auth.js` — add `updateProfile`, `changeEmail`.
- `frontend/src/api/auth.test.js` — new wrapper test.
- `frontend/src/auth/AuthContext.jsx` — expose `updateProfile`, `changeEmail`, `changePassword`.
- `frontend/src/tabs/ProfilePage.jsx` + `ProfilePage.css` — new page.
- `frontend/src/tabs/ProfilePage.test.jsx` — new page test.
- `frontend/src/components/AppShell.jsx` — add `/profile` route.
- `frontend/src/components/AccountMenu.jsx` + `AccountMenu.css` — dropdown.
- `frontend/src/components/AccountMenu.test.jsx` — new dropdown test.

---

## Task 1: Backend — User profile fields + `_user_out` helper

**Files:**
- Modify: `app/models.py` (User class, ~line 49–71)
- Modify: `app/database.py` (`init_db` DDL list, ~line 49–53)
- Modify: `app/schemas.py` (`UserOut`, ~line 214)
- Modify: `app/api/auth.py` (add helper; refactor `register`/`login`/`me`)
- Test: `tests/test_api_profile.py` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/test_api_profile.py`:

```python
"""Integration tests for the profile endpoints:
  GET   /auth/me          (now returns name/timezone)
  PATCH /auth/me          (update name/timezone)
  POST  /auth/change-email
"""


def _register(client, email="user@test.com", password="origpass1"):
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r


class TestMeIncludesProfileFields:
    def test_me_returns_name_and_timezone_keys(self, client):
        _register(client)
        r = client.get("/auth/me")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] is None
        assert body["timezone"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/Scripts/python.exe -m pytest tests/test_api_profile.py -v`
Expected: FAIL — `KeyError: 'name'` (UserOut has no such field yet).

- [ ] **Step 3: Add columns to the User model**

In `app/models.py`, inside `class User`, after the `created_at` column add:

```python
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str | None] = mapped_column(Text, nullable=True)
```

(`Text`, `Mapped`, `mapped_column` are already imported and used by this model.)

- [ ] **Step 4: Add the idempotent migration**

In `app/database.py`, `init_db()`, extend the existing DDL tuple (currently lines ~49–53) so it reads:

```python
    for ddl in (
        "ALTER TABLE users ADD COLUMN reset_code_hash TEXT",
        "ALTER TABLE users ADD COLUMN reset_code_expires_at TIMESTAMP",
        "ALTER TABLE subscriptions ADD COLUMN notify_negative BOOLEAN DEFAULT TRUE",
        "ALTER TABLE users ADD COLUMN name TEXT",
        "ALTER TABLE users ADD COLUMN timezone TEXT",
    ):
```

(Each runs inside the existing try/except, so it's a no-op when the column already exists. Tests use `create_all`, which builds the new columns directly from the model.)

- [ ] **Step 5: Extend UserOut**

In `app/schemas.py`, update `UserOut`:

```python
class UserOut(BaseModel):
    id: int
    email: str
    created_at: datetime
    comed_connected: bool = False
    name: str | None = None
    timezone: str | None = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 6: Add `_user_out` helper and use it in register/login/me**

In `app/api/auth.py`, add this helper just after `_claim_orphan_subscriptions` (~line 55):

```python
def _user_out(db: Session, user: User) -> UserOut:
    """Build the UserOut response, including computed comed_connected + profile fields."""
    comed_connected = (
        db.query(ComedAccount).filter(ComedAccount.user_id == user.id).first()
        is not None
    )
    return UserOut(
        id=user.id,
        email=user.email,
        created_at=user.created_at,
        comed_connected=comed_connected,
        name=user.name,
        timezone=user.timezone,
    )
```

Then replace the inline `UserOut(...)` constructions:

In `register` (~lines 73–75) replace the `out = UserOut(...)` line with:
```python
    out = _user_out(db, user)
```

In `login` (~lines 104–113) replace the `comed_connected = ...` block and `out = UserOut(...)` with:
```python
    out = _user_out(db, user)
```

In `me` (~lines 203–214) replace the whole body's return with:
```python
@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _user_out(db, current_user)
```

- [ ] **Step 7: Run test to verify it passes**

Run: `./venv/Scripts/python.exe -m pytest tests/test_api_profile.py -v`
Expected: PASS.

- [ ] **Step 8: Run the existing auth suite to confirm no regressions**

Run: `./venv/Scripts/python.exe -m pytest tests/test_api_auth.py -v`
Expected: PASS (register/login/change-password unchanged in behavior).

- [ ] **Step 9: Commit**

```bash
git add app/models.py app/database.py app/schemas.py app/api/auth.py tests/test_api_profile.py
git commit -m "feat(profile): add name/timezone to User, _user_out helper"
```

---

## Task 2: Backend — `PATCH /auth/me` (update name + timezone)

**Files:**
- Modify: `app/schemas.py` (add `ProfileUpdateRequest`)
- Modify: `app/api/auth.py` (add endpoint + import)
- Test: `tests/test_api_profile.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_api_profile.py`:

```python
class TestUpdateProfile:
    def test_update_name_and_timezone(self, client):
        _register(client)
        r = client.patch(
            "/auth/me",
            json={"name": "Siva D", "timezone": "America/Chicago"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "Siva D"
        assert body["timezone"] == "America/Chicago"
        # Persisted: a fresh GET reflects it.
        me = client.get("/auth/me").json()
        assert me["name"] == "Siva D"
        assert me["timezone"] == "America/Chicago"

    def test_invalid_timezone_rejected(self, client):
        _register(client)
        r = client.patch("/auth/me", json={"timezone": "Mars/Olympus_Mons"})
        assert r.status_code == 422

    def test_update_requires_auth(self, client):
        # No registration → no cookie.
        r = client.patch("/auth/me", json={"name": "x"})
        assert r.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./venv/Scripts/python.exe -m pytest tests/test_api_profile.py::TestUpdateProfile -v`
Expected: FAIL — 405/404 (no PATCH route yet).

- [ ] **Step 3: Add the request schema**

In `app/schemas.py`, add at the top with the other imports:

```python
from zoneinfo import available_timezones
```

And add this schema (next to the other auth request models):

```python
class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    timezone: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if len(v) > 100:
            raise ValueError("Name must be at most 100 characters")
        return v or None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if v not in available_timezones():
            raise ValueError("Unknown timezone")
        return v
```

- [ ] **Step 4: Add the endpoint**

In `app/api/auth.py`, add `ProfileUpdateRequest` to the `from app.schemas import (...)` block, then add this route after `me` (~line 215):

```python
@router.patch("/me", response_model=UserOut)
def update_profile(
    req: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # exclude_unset → only overwrite fields the client actually sent.
    data = req.model_dump(exclude_unset=True)
    if "name" in data:
        current_user.name = data["name"]
    if "timezone" in data:
        current_user.timezone = data["timezone"]
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return _user_out(db, current_user)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./venv/Scripts/python.exe -m pytest tests/test_api_profile.py::TestUpdateProfile -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add app/schemas.py app/api/auth.py tests/test_api_profile.py
git commit -m "feat(profile): add PATCH /auth/me to update name + timezone"
```

---

## Task 3: Backend — `POST /auth/change-email`

**Files:**
- Modify: `app/schemas.py` (add `ChangeEmailRequest`)
- Modify: `app/api/auth.py` (add endpoint + import)
- Test: `tests/test_api_profile.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_api_profile.py`:

```python
class TestChangeEmail:
    def test_change_email_success(self, client):
        _register(client, email="old@test.com", password="origpass1")
        r = client.post(
            "/auth/change-email",
            json={"new_email": "new@test.com", "password": "origpass1"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["email"] == "new@test.com"
        # Can log in with the new email.
        assert (
            client.post(
                "/auth/login", json={"email": "new@test.com", "password": "origpass1"}
            ).status_code
            == 200
        )

    def test_change_email_wrong_password(self, client):
        _register(client, email="old@test.com", password="origpass1")
        r = client.post(
            "/auth/change-email",
            json={"new_email": "new@test.com", "password": "wrongpass"},
        )
        assert r.status_code == 401

    def test_change_email_already_taken(self, client):
        # Register B (client cookie now belongs to B), then A, then A tries B's email.
        _register(client, email="b@test.com", password="bpass1234")
        _register(client, email="a@test.com", password="apass1234")  # cookie now = A
        r = client.post(
            "/auth/change-email",
            json={"new_email": "b@test.com", "password": "apass1234"},
        )
        assert r.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./venv/Scripts/python.exe -m pytest tests/test_api_profile.py::TestChangeEmail -v`
Expected: FAIL — 404/405 (no route yet).

- [ ] **Step 3: Add the request schema**

In `app/schemas.py`, add:

```python
class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    password: str
```

- [ ] **Step 4: Add the endpoint**

In `app/api/auth.py`, add `ChangeEmailRequest` to the `from app.schemas import (...)` block, then add after `update_profile`:

```python
@router.post("/change-email", response_model=UserOut)
def change_email(
    req: ChangeEmailRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(req.password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Password is incorrect")
    taken = (
        db.query(User)
        .filter(User.email == req.new_email, User.id != current_user.id)
        .first()
    )
    if taken:
        raise HTTPException(status_code=409, detail="That email is already in use")
    current_user.email = req.new_email
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return _user_out(db, current_user)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./venv/Scripts/python.exe -m pytest tests/test_api_profile.py -v`
Expected: PASS (all classes).

- [ ] **Step 6: Run the full backend suite (no regressions)**

Run: `./venv/Scripts/python.exe -m pytest -q`
Expected: all pass (E2E excluded by pytest.ini).

- [ ] **Step 7: Commit**

```bash
git add app/schemas.py app/api/auth.py tests/test_api_profile.py
git commit -m "feat(profile): add POST /auth/change-email"
```

---

## Task 4: Frontend — API client `patch`, `authApi` wrappers, context methods

**Files:**
- Modify: `frontend/src/api/client.js` (~line 63–67, the `api` object)
- Modify: `frontend/src/api/auth.js` (`authApi` object)
- Modify: `frontend/src/auth/AuthContext.jsx`
- Test: `frontend/src/api/auth.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/api/auth.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { authApi } from "./auth.js";

function okJson(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(""),
  });
}

beforeEach(() => {
  global.fetch = vi.fn(() => okJson({ id: 1, email: "u@test.com" }));
});

describe("authApi profile wrappers", () => {
  it("updateProfile PATCHes /auth/me with the fields", async () => {
    await authApi.updateProfile({ name: "Siva", timezone: "America/Chicago" });
    expect(global.fetch).toHaveBeenCalledWith(
      "/auth/me",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, opts] = global.fetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ name: "Siva", timezone: "America/Chicago" });
  });

  it("changeEmail POSTs /auth/change-email", async () => {
    await authApi.changeEmail("new@test.com", "pw");
    expect(global.fetch).toHaveBeenCalledWith(
      "/auth/change-email",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx vitest run src/api/auth.test.js`
Expected: FAIL — `authApi.updateProfile is not a function`.

- [ ] **Step 3: Add the `patch` client helper**

In `frontend/src/api/client.js`, extend the exported `api` object:

```js
export const api = {
  get: (path, opts) => request("GET", path, undefined, opts),
  post: (path, body, opts) => request("POST", path, body, opts),
  patch: (path, body, opts) => request("PATCH", path, body, opts),
  del: (path, opts) => request("DELETE", path, undefined, opts),
};
```

- [ ] **Step 4: Add the `authApi` wrappers**

In `frontend/src/api/auth.js`, add to the `authApi` object (next to `changePassword`):

```js
  updateProfile: (fields) => api.patch("/auth/me", fields),
  changeEmail: (new_email, password) =>
    api.post("/auth/change-email", { new_email, password }),
```

- [ ] **Step 5: Expose context methods**

In `frontend/src/auth/AuthContext.jsx`, add these `useCallback`s (after `logout`) — `authApi` is already imported:

```js
  const updateProfile = useCallback(async (fields) => {
    const updated = await authApi.updateProfile(fields);
    setUser(updated);
    return updated;
  }, []);

  const changeEmail = useCallback(async (new_email, password) => {
    const updated = await authApi.changeEmail(new_email, password);
    setUser(updated);
    return updated;
  }, []);

  const changePassword = useCallback(
    (old_password, new_password) =>
      authApi.changePassword(old_password, new_password),
    [],
  );
```

And add them to the provider value:

```js
    <AuthContext.Provider
      value={{ user, status, login, register, logout, refresh, updateProfile, changeEmail, changePassword }}
    >
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/api/auth.test.js`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/auth.js frontend/src/auth/AuthContext.jsx frontend/src/api/auth.test.js
git commit -m "feat(profile): add patch client + updateProfile/changeEmail context methods"
```

---

## Task 5: Frontend — ProfilePage component + route

**Files:**
- Create: `frontend/src/tabs/ProfilePage.jsx`
- Create: `frontend/src/tabs/ProfilePage.css`
- Modify: `frontend/src/components/AppShell.jsx` (import + route)
- Test: `frontend/src/tabs/ProfilePage.test.jsx` (new)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/tabs/ProfilePage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils.jsx";
import ProfilePage from "./ProfilePage.jsx";

const USER = {
  id: 1,
  email: "u@test.com",
  created_at: "2026-01-01T00:00:00",
  name: null,
  timezone: null,
};

function okJson(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(""),
  });
}

beforeEach(() => localStorage.clear());

describe("ProfilePage", () => {
  it("renders the four account sections", async () => {
    renderWithProviders(<ProfilePage />, { authed: true, user: USER });
    expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Password" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
  });

  it("saves the profile and shows a success status", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />, { authed: true, user: USER });
    await screen.findByRole("heading", { name: "Profile" });
    // Now make PATCH /auth/me succeed.
    global.fetch = vi.fn((url, opts) =>
      `${opts?.method} ${url}` === "PATCH /auth/me"
        ? okJson({ ...USER, name: "Siva", timezone: "America/Chicago" })
        : Promise.resolve({ ok: false, status: 404, headers: { get: () => "application/json" }, json: () => Promise.resolve({}), text: () => Promise.resolve("") }),
    );
    await user.type(screen.getByLabelText("Display name"), "Siva");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/auth/me",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tabs/ProfilePage.test.jsx`
Expected: FAIL — cannot resolve `./ProfilePage.jsx`.

- [ ] **Step 3: Create the ProfilePage component**

Create `frontend/src/tabs/ProfilePage.jsx`:

```jsx
import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import "./ProfilePage.css";

const US_TIMEZONES = [
  ["America/Chicago", "Central — Chicago"],
  ["America/New_York", "Eastern — New York"],
  ["America/Denver", "Mountain — Denver"],
  ["America/Los_Angeles", "Pacific — Los Angeles"],
  ["America/Phoenix", "Arizona — Phoenix"],
  ["America/Anchorage", "Alaska — Anchorage"],
  ["Pacific/Honolulu", "Hawaii — Honolulu"],
];

function Status({ error, notice }) {
  if (error) return <p className="auth-error" role="alert">{error}</p>;
  if (notice) return <p className="auth-notice" role="status">{notice}</p>;
  return null;
}

const msg = (err) => err.detail || err.message || "Something went wrong.";

export default function ProfilePage() {
  const { user, updateProfile, changeEmail, changePassword, logout } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? "America/Chicago");
  const [pState, setPState] = useState({ busy: false, error: "", notice: "" });

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [eState, setEState] = useState({ busy: false, error: "", notice: "" });

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwState, setPwState] = useState({ busy: false, error: "", notice: "" });

  async function saveProfile(e) {
    e.preventDefault();
    setPState({ busy: true, error: "", notice: "" });
    try {
      await updateProfile({ name, timezone });
      setPState({ busy: false, error: "", notice: "Profile saved." });
    } catch (err) {
      setPState({ busy: false, error: msg(err), notice: "" });
    }
  }

  async function saveEmail(e) {
    e.preventDefault();
    setEState({ busy: true, error: "", notice: "" });
    try {
      await changeEmail(newEmail, emailPassword);
      setNewEmail("");
      setEmailPassword("");
      setEState({ busy: false, error: "", notice: "Email updated." });
    } catch (err) {
      setEState({ busy: false, error: msg(err), notice: "" });
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwState({ busy: true, error: "", notice: "" });
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setPwState({ busy: false, error: "", notice: "Password changed." });
    } catch (err) {
      setPwState({ busy: false, error: msg(err), notice: "" });
    }
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString()
    : "—";

  return (
    <div className="profile-page">
      <h1 className="profile-h1">Your account</h1>

      <section className="profile-card">
        <h2>Profile</h2>
        <form onSubmit={saveProfile} className="auth-form" noValidate>
          <Status error={pState.error} notice={pState.notice} />
          <label htmlFor="pf-name">Display name</label>
          <input
            id="pf-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label htmlFor="pf-tz">Timezone</label>
          <select
            id="pf-tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {US_TIMEZONES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="auth-submit" type="submit" disabled={pState.busy}>
            {pState.busy ? "Working…" : "Save profile"}
          </button>
        </form>
      </section>

      <section className="profile-card">
        <h2>Email</h2>
        <p className="profile-current">Current: {user?.email}</p>
        <form onSubmit={saveEmail} className="auth-form" noValidate>
          <Status error={eState.error} notice={eState.notice} />
          <label htmlFor="pf-email">New email</label>
          <input
            id="pf-email"
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
          <label htmlFor="pf-email-pw">Confirm current password</label>
          <input
            id="pf-email-pw"
            type="password"
            autoComplete="current-password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            required
          />
          <button className="auth-submit" type="submit" disabled={eState.busy}>
            {eState.busy ? "Working…" : "Update email"}
          </button>
        </form>
      </section>

      <section className="profile-card">
        <h2>Password</h2>
        <form onSubmit={savePassword} className="auth-form" noValidate>
          <Status error={pwState.error} notice={pwState.notice} />
          <label htmlFor="pf-old">Current password</label>
          <input
            id="pf-old"
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
          />
          <label htmlFor="pf-new">New password</label>
          <input
            id="pf-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <button className="auth-submit" type="submit" disabled={pwState.busy}>
            {pwState.busy ? "Working…" : "Change password"}
          </button>
        </form>
      </section>

      <section className="profile-card">
        <h2>Account</h2>
        <p className="profile-current">Member since {memberSince}</p>
        <button className="auth-submit" type="button" onClick={logout}>
          Log out
        </button>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Create the stylesheet**

Create `frontend/src/tabs/ProfilePage.css`:

```css
.profile-page {
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.profile-h1 {
  font-family: "Bricolage Grotesque", sans-serif;
  font-size: 24px;
  letter-spacing: -0.02em;
  margin: 4px 0 2px;
}
.profile-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 18px 20px;
}
.profile-card h2 {
  font-family: "Bricolage Grotesque", sans-serif;
  font-size: 16px;
  margin: 0 0 12px;
}
.profile-current {
  color: var(--dim);
  font-size: 13px;
  margin: 0 0 12px;
}
```

- [ ] **Step 5: Wire the route in AppShell**

In `frontend/src/components/AppShell.jsx`, add the import near the other tab imports:

```jsx
import ProfilePage from "../tabs/ProfilePage.jsx";
```

And add the route inside `<Routes>` (after the `/alerts` route, before `/privacy`):

```jsx
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/tabs/ProfilePage.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/tabs/ProfilePage.jsx frontend/src/tabs/ProfilePage.css frontend/src/components/AppShell.jsx frontend/src/tabs/ProfilePage.test.jsx
git commit -m "feat(profile): add ProfilePage with profile/email/password sections + /profile route"
```

---

## Task 6: Frontend — AccountMenu dropdown with Profile link

**Files:**
- Modify: `frontend/src/components/AccountMenu.jsx`
- Modify: `frontend/src/components/AccountMenu.css`
- Test: `frontend/src/components/AccountMenu.test.jsx` (new)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/AccountMenu.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils.jsx";
import AccountMenu from "./AccountMenu.jsx";

beforeEach(() => localStorage.clear());

describe("AccountMenu (authenticated)", () => {
  it("opens a dropdown with a Profile link and Log out, closes on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />, {
      authed: true,
      user: { id: 1, email: "u@test.com" },
    });
    const trigger = await screen.findByRole("button", { name: /u@test\.com/i });
    // Closed initially.
    expect(screen.queryByRole("menuitem", { name: "Profile" })).not.toBeInTheDocument();
    await user.click(trigger);
    const profile = screen.getByRole("menuitem", { name: "Profile" });
    expect(profile).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem", { name: "Profile" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/AccountMenu.test.jsx`
Expected: FAIL — no button matching the email (current authed UI shows email as plain text + a "Log out" button, no dropdown trigger).

- [ ] **Step 3: Rewrite AccountMenu with a dropdown**

Replace the entire contents of `frontend/src/components/AccountMenu.jsx`:

```jsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import AuthModal from "./AuthModal.jsx";
import "./AccountMenu.css";

export default function AccountMenu() {
  const { status, user, logout } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [menuOpen]);

  if (status === "loading") {
    return <div className="account-menu" aria-hidden="true" />;
  }

  if (status === "authenticated") {
    return (
      <div className="account-menu" ref={ref}>
        <button
          type="button"
          className="account-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="account-email" title={user.email}>{user.email}</span>
          <span aria-hidden="true">▾</span>
        </button>
        {menuOpen && (
          <div className="account-pop" role="menu">
            <Link
              className="account-pop-item"
              role="menuitem"
              to="/profile"
              onClick={() => setMenuOpen(false)}
            >
              Profile
            </Link>
            <button
              type="button"
              className="account-pop-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="account-menu">
      <button className="account-btn primary" onClick={() => setLoginOpen(true)}>
        Log in
      </button>
      <AuthModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 4: Add dropdown styles**

Append to `frontend/src/components/AccountMenu.css`:

```css
/* authenticated dropdown */
.account-menu {
  position: relative;
}
.account-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 200px;
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--txt);
  font: inherit;
  font-weight: 600;
  font-size: 13px;
  padding: 8px 11px;
  border-radius: 11px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.account-trigger:hover {
  border-color: var(--accent);
}
.account-trigger .account-email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-pop {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 60;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  padding: 6px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow);
}
.account-pop-item {
  display: block;
  text-align: left;
  text-decoration: none;
  border: 0;
  background: transparent;
  color: var(--txt);
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  padding: 9px 11px;
  border-radius: 9px;
  cursor: pointer;
}
.account-pop-item:hover {
  background: var(--card-2);
  color: var(--accent);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/AccountMenu.test.jsx`
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite (catch AppShell regressions)**

Run: `npx vitest run`
Expected: all pass. If an `AppShell.test.jsx` assertion relied on a directly-visible "Log out" button in the authed state, update it to open the dropdown first (`click` the email trigger, then assert the "Log out" menuitem) — mirroring the test in Step 1.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/AccountMenu.jsx frontend/src/components/AccountMenu.css frontend/src/components/AccountMenu.test.jsx
git commit -m "feat(profile): account dropdown with Profile link + Log out"
```

---

## Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Backend suite**

Run: `./venv/Scripts/python.exe -m pytest -q`
Expected: all pass.

- [ ] **Step 2: Frontend suite + build**

Run (from `frontend/`): `npx vitest run` then `npm run build`
Expected: all tests pass; build succeeds into `../app/static_spa/`.

- [ ] **Step 3: Manual smoke against the running app**

Restart the backend so `init_db()` adds the new columns to the dev Postgres:
`./venv/Scripts/python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
Then at `http://localhost:8000/app`:
1. Log in (demo `demo@example.com` / `demo1234`).
2. Click the account dropdown (email ▾) in the header → click **Profile** → lands on `/profile`.
3. Set a display name + timezone → **Save profile** → "Profile saved."; reload → values persist.
4. **Change password** to a new value → "Password changed."; log out and back in with the new password.
5. **Update email** with the current password → "Email updated."; the header now shows the new email.
6. Try updating email to an address already registered → inline "That email is already in use."

- [ ] **Step 4: Final commit (if any manual fixups were needed)**

```bash
git add -A
git commit -m "test(profile): verification fixups"
```

---

## Self-Review Notes (already reconciled against the spec)

- **Spec coverage:** name/timezone model+migration (Task 1) · `UserOut` fields (Task 1) · `PATCH /auth/me` (Task 2) · `change-email` with password confirm + 409 (Task 3) · client `patch` + wrappers + context (Task 4) · ProfilePage four sections + `/profile` route (Task 5) · AccountMenu dropdown entry point (Task 6) · all tests (Tasks 1–6) · verification (Task 7). No email-verification flow (intentional per spec).
- **Type/name consistency:** `_user_out(db, user)` used identically in register/login/me/update_profile/change_email; `UserOut` carries `name`/`timezone`; `ProfileUpdateRequest`/`ChangeEmailRequest` names match between schema and import/usage; `updateProfile`/`changeEmail`/`changePassword` names match across `authApi`, `AuthContext`, and `ProfilePage`.
- **No placeholders:** every step shows full code or exact commands with expected results.
