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
