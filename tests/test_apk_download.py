"""The Android APK must be served with the correct MIME type + filename so it
downloads as voltmint.apk, not voltmint.zip (APKs are ZIP archives, so a
text/plain default makes browsers / sniffing CDNs rename them)."""

from pathlib import Path

import pytest

APK = Path(__file__).resolve().parent.parent / "app" / "static" / "downloads" / "voltmint.apk"


@pytest.mark.skipif(not APK.is_file(), reason="APK not built/committed in this checkout")
def test_apk_served_as_android_package_with_filename(client):
    r = client.get("/static/downloads/voltmint.apk")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/vnd.android.package-archive"
    disposition = r.headers.get("content-disposition", "")
    assert "attachment" in disposition
    assert 'filename="voltmint.apk"' in disposition
