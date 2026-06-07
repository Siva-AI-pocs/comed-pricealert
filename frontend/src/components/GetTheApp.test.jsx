import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const SEEN_KEY = "voltmint-apk-seen-version";

async function renderWith(
  platform,
  { appStoreUrl = "", nativeApp = false, manifest = null, seen = null } = {},
) {
  vi.resetModules();
  localStorage.clear();
  if (seen != null) localStorage.setItem(SEEN_KEY, seen);
  global.fetch = manifest
    ? vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(manifest) })
    : vi.fn().mockRejectedValue(new Error("no network"));
  vi.doMock("../platform.js", () => ({
    detectPlatform: () => platform,
    isNativeApp: () => nativeApp,
  }));
  vi.doMock("../config/appLinks.js", () => ({
    ANDROID_APK_URL: "/static/downloads/voltmint.apk",
    APP_STORE_URL: appStoreUrl,
    APP_VERSION_URL: "/static/downloads/app-version.json",
  }));
  const { default: GetTheApp } = await import("./GetTheApp.jsx");
  return render(<GetTheApp />);
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("GetTheApp", () => {
  it("shows the Android download on Android", async () => {
    await renderWith("android");
    const link = screen.getByRole("link", { name: /download android app/i });
    expect(link).toHaveAttribute("href", "/static/downloads/voltmint.apk");
    expect(link).toHaveAttribute("download");
  });

  it("shows a 'coming soon' state on iOS when no App Store URL is set", async () => {
    await renderWith("ios", { appStoreUrl: "" });
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to the App Store on iOS when a URL is configured", async () => {
    await renderWith("ios", { appStoreUrl: "https://apps.apple.com/app/id000" });
    const link = screen.getByRole("link", { name: /app store/i });
    expect(link).toHaveAttribute("href", "https://apps.apple.com/app/id000");
  });

  it("shows both options on desktop", async () => {
    await renderWith("other", { appStoreUrl: "" });
    expect(screen.getByRole("link", { name: /download android app/i })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("renders nothing inside the native app", async () => {
    const { container } = await renderWith("android", { nativeApp: true });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/download android app/i)).not.toBeInTheDocument();
  });

  it("shows the version and release date when the manifest loads", async () => {
    await renderWith("android", {
      manifest: { version: "0.2.0", released: "2026-06-07", file: "/static/downloads/voltmint.apk" },
    });
    expect(await screen.findByText(/v0\.2\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Jun 7/)).toBeInTheDocument();
  });

  it("shows a 'New' badge when the released version differs from the last seen", async () => {
    await renderWith("android", {
      manifest: { version: "0.2.0", released: "2026-06-07", file: "/static/downloads/voltmint.apk" },
      seen: "0.1.0",
    });
    expect(await screen.findByText("New")).toBeInTheDocument();
  });

  it("shows the 'New' badge to a first-time visitor (no stored version)", async () => {
    await renderWith("android", {
      manifest: { version: "0.2.0", released: "2026-06-07", file: "/static/downloads/voltmint.apk" },
      seen: null,
    });
    expect(await screen.findByText("New")).toBeInTheDocument();
  });

  it("hides the 'New' badge when the last seen version equals the release", async () => {
    await renderWith("android", {
      manifest: { version: "0.2.0", released: "2026-06-07", file: "/static/downloads/voltmint.apk" },
      seen: "0.2.0",
    });
    expect(await screen.findByText(/v0\.2\.0/)).toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("marks the version as seen in localStorage when the download is clicked", async () => {
    await renderWith("android", {
      manifest: { version: "0.2.0", released: "2026-06-07", file: "/static/downloads/voltmint.apk" },
      seen: "0.1.0",
    });
    const link = await screen.findByRole("link", { name: /download android app/i });
    fireEvent.click(link);
    expect(localStorage.getItem(SEEN_KEY)).toBe("0.2.0");
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("renders the plain button (no version, no badge) when the manifest fetch fails", async () => {
    await renderWith("android", { manifest: null });
    const link = screen.getByRole("link", { name: /download android app/i });
    expect(link).toHaveAttribute("href", "/static/downloads/voltmint.apk");
    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });
});
