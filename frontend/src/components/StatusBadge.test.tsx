import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it.each(["queued", "running", "succeeded", "failed", "skipped"] as const)(
    "renders the %s execution status",
    (status) => {
      render(<StatusBadge status={status} />);
      expect(screen.getByText(status)).toBeVisible();
    },
  );
});
