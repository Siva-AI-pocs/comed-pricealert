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
