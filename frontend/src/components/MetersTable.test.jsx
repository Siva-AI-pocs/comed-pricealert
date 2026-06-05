import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetersTable from "./MetersTable.jsx";

const meters = [
  {
    id: 1,
    espi_usage_point_id: "UP-1",
    service_kind: "electricity",
    label: null,
    created_at: "2026-06-01T00:00:00",
    interval_count: 96,
  },
];

describe("MetersTable", () => {
  it("lists each meter with its interval count", () => {
    render(<MetersTable meters={meters} onDelete={() => {}} />);
    expect(screen.getByText("UP-1")).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
  });

  it("calls onDelete with the meter id", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<MetersTable meters={meters} onDelete={onDelete} />);
    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("shows an empty state when there are no meters", () => {
    render(<MetersTable meters={[]} onDelete={() => {}} />);
    expect(screen.getByText(/no meters/i)).toBeInTheDocument();
  });
});
