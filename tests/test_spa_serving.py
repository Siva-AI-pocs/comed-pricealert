"""Tests for serving the built React SPA at the site root (post-cutover),
without disturbing the API, auth, health, or the static legal pages."""

import app.main as main


def _build_fake_spa(tmp_path, monkeypatch):
    spa = tmp_path / "static_spa"
    (spa / "assets").mkdir(parents=True)
    (spa / "index.html").write_text("<!doctype html><div id='root'>SPA</div>")
    (spa / "assets" / "app.js").write_text("console.log('hi')")
    (spa / "manifest.webmanifest").write_text('{"name":"Pulse"}')
    monkeypatch.setattr(main, "STATIC_SPA", spa)
    return spa


class TestSpaServing:
    def test_serves_index_at_root(self, client, tmp_path, monkeypatch):
        _build_fake_spa(tmp_path, monkeypatch)
        r = client.get("/")
        assert r.status_code == 200
        assert "id='root'" in r.text

    def test_client_route_falls_back_to_index(self, client, tmp_path, monkeypatch):
        _build_fake_spa(tmp_path, monkeypatch)
        r = client.get("/forecast")
        assert r.status_code == 200
        assert "id='root'" in r.text  # SPA fallback, not a 404

    def test_serves_real_static_files(self, client, tmp_path, monkeypatch):
        _build_fake_spa(tmp_path, monkeypatch)
        r = client.get("/assets/app.js")
        assert r.status_code == 200
        assert "console.log" in r.text

    def test_legacy_dashboard_when_spa_not_built(self, client, tmp_path, monkeypatch):
        # When the SPA isn't built, / falls back to the legacy static dashboard
        # (200, not the SPA shell), and unknown client routes 404.
        monkeypatch.setattr(main, "STATIC_SPA", tmp_path / "missing")
        root = client.get("/")
        assert root.status_code == 200
        assert "id='root'" not in root.text
        assert client.get("/forecast").status_code == 404

    def test_app_paths_redirect_to_root(self, client, tmp_path, monkeypatch):
        _build_fake_spa(tmp_path, monkeypatch)
        r = client.get("/app", follow_redirects=False)
        assert r.status_code == 301
        assert r.headers["location"] == "/"
        r2 = client.get("/app/forecast", follow_redirects=False)
        assert r2.status_code == 301
        assert r2.headers["location"] == "/forecast"

    def test_does_not_shadow_api_health_or_legal(self, client, tmp_path, monkeypatch):
        _build_fake_spa(tmp_path, monkeypatch)
        # health + an API route unaffected by the root catch-all
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/api/prices/stats").status_code == 200
        # legal pages still served from the real static HTML, not the SPA shell
        for path in ("/privacy", "/terms"):
            r = client.get(path)
            assert r.status_code == 200
            assert "id='root'" not in r.text
