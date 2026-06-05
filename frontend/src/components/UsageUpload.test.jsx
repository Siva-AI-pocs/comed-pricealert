import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UsageUpload from "./UsageUpload.jsx";

function mkRes(json, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(""),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("UsageUpload", () => {
  it("uploads the chosen file and reports the imported count", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(mkRes({ intervals_inserted: 96, meter_ids: [1] })),
    );
    const onUploaded = vi.fn();
    const user = userEvent.setup();
    render(<UsageUpload onUploaded={onUploaded} />);
    const file = new File(["<xml/>"], "usage.xml", { type: "application/xml" });
    await user.upload(screen.getByLabelText(/green button file/i), file);
    await user.click(screen.getByRole("button", { name: /upload/i }));
    expect(await screen.findByText(/96 intervals/i)).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalled();
  });

  it("surfaces the backend error on a bad file", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        mkRes({ detail: "Could not parse ESPI XML" }, { ok: false, status: 400 }),
      ),
    );
    const user = userEvent.setup();
    render(<UsageUpload onUploaded={() => {}} />);
    const file = new File(["bad"], "bad.xml", { type: "application/xml" });
    await user.upload(screen.getByLabelText(/green button file/i), file);
    await user.click(screen.getByRole("button", { name: /upload/i }));
    expect(await screen.findByText(/could not parse espi/i)).toBeInTheDocument();
  });
});
