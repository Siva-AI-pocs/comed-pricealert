import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Select from "./Select.jsx";

const OPTS = [
  ["America/Chicago", "Central — Chicago"],
  ["America/New_York", "Eastern — New York"],
];

function Harness() {
  const [v, setV] = useState("America/Chicago");
  return <Select id="tz" ariaLabel="Timezone" value={v} onChange={setV} options={OPTS} />;
}

describe("Select", () => {
  it("shows the current label and toggles the option list", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: /timezone/i });
    expect(trigger).toHaveTextContent("Central — Chicago");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("option", { name: "Eastern — New York" })).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("selecting an option updates the value and closes the list", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: /timezone/i });
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Eastern — New York" }));
    expect(trigger).toHaveTextContent("Eastern — New York");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /timezone/i }));
    expect(screen.getByRole("option", { name: "Central — Chicago" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
