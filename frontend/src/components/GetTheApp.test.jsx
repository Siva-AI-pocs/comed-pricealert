import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

async function renderWith(platform, appStoreUrl = "", nativeApp = false) {
  vi.resetModules();
  vi.doMock("../platform.js", () => ({
    detectPlatform: () => platform,
    isNativeApp: () => nativeApp,
  }));
  vi.doMock("../config/appLinks.js", () => ({
    ANDROID_APK_URL: "/static/downloads/voltmint.apk",
    APP_STORE_URL: appStoreUrl,
  }));
  const { default: GetTheApp } = await import("./GetTheApp.jsx");
  return render(<GetTheApp />);
}

beforeEach(() => vi.resetModules());

describe("GetTheApp", () => {
  it("shows the Android download on Android", async () => {
    await renderWith("android");
    const link = screen.getByRole("link", { name: /download android app/i });
    expect(link).toHaveAttribute("href", "/static/downloads/voltmint.apk");
    expect(link).toHaveAttribute("download");
  });

  it("shows a 'coming soon' state on iOS when no App Store URL is set", async () => {
    await renderWith("ios", "");
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to the App Store on iOS when a URL is configured", async () => {
    await renderWith("ios", "https://apps.apple.com/app/id000");
    const link = screen.getByRole("link", { name: /app store/i });
    expect(link).toHaveAttribute("href", "https://apps.apple.com/app/id000");
  });

  it("shows both options on desktop", async () => {
    await renderWith("other", "");
    expect(screen.getByRole("link", { name: /download android app/i })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("renders nothing inside the native app", async () => {
    const { container } = await renderWith("android", "", true);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/download android app/i)).not.toBeInTheDocument();
  });
});
