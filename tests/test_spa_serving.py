"""Tests for serving the built React SPA at /app (staging) without disturbing
the legacy app, API, or auth routes."""

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
    def test_serves_index_at_app_root(self, client, tmp_path, monkeypatch):
        _build_fake_spa(tmp_path, monkeypatch)
        r = client.get("/app")
        assert r.status_code == 200
        assert "id='root'" in r.text

    def test_client_route_falls_back_to_index(self, client, tmp_path, monkeypatch):
        _build_fake_spa(tmp_path, monkeypatch)
        r = client.get("/app/forecast")
        assert r.status_code == 200
        assert "id='root'" in r.text  # SPA fallback, not a 404

    def test_serves_real_static_files(self, client, tmp_path, monkeypatch):
        _build_fake_spa(tmp_path, monkeypatch)
        r = client.get("/app/assets/app.js")
        assert r.status_code == 200
        assert "console.log" in r.text

    def test_503_when_not_built(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr(main, "STATIC_SPA", tmp_path / "missing")
        assert client.get("/app").status_code == 503

    def test_does_not_shadow_legacy_or_api(self, client, tmp_path, monkeypatch):
        _build_fake_spa(tmp_path, monkeypatch)
        # legacy root still served from app/static/index.html
        assert client.get("/").status_code == 200
        assert "id='root'" not in client.get("/").text
        # health + an API route unaffected
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/api/prices/stats").status_code == 200
