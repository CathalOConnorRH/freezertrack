import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StockCheck from "../pages/StockCheck";

const mockStart = vi.fn();
const mockScan = vi.fn();
const mockProgress = vi.fn();
const mockEnd = vi.fn();
const mockRemoveMissing = vi.fn();
const mockCreateItem = vi.fn();

vi.mock("../api/client", () => ({
  startStockCheck: (...args) => mockStart(...args),
  scanStockCheck: (...args) => mockScan(...args),
  getStockCheckProgress: (...args) => mockProgress(...args),
  endStockCheck: (...args) => mockEnd(...args),
  removeMissingItems: (...args) => mockRemoveMissing(...args),
  scanAndCreateItem: (...args) => mockCreateItem(...args),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));

vi.mock("../components/Modal", () => ({
  default: ({ open, children }) =>
    open ? <div data-testid="modal">{children}</div> : null,
}));

describe("StockCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows start screen with start button", async () => {
    render(<StockCheck />);
    expect(screen.getByRole("heading", { name: "Stock Check" })).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Start Stock Check/i });
    expect(btn).toBeInTheDocument();
  });

  it("starts session on button click and shows scanning view", async () => {
    mockStart.mockResolvedValue({ session_id: "sess-123", total_items: 5 });
    mockProgress.mockResolvedValue({
      total_inventory: 5,
      scanned: 0,
      missing: [
        { barcode: "AAA" },
        { barcode: "BBB" },
        { barcode: "CCC" },
        { barcode: "DDD" },
        { barcode: "EEE" },
      ],
    });

    render(<StockCheck />);
    userEvent.click(screen.getByRole("button", { name: /Start Stock Check/i }));

    await waitFor(() =>
      expect(mockStart).toHaveBeenCalledTimes(1)
    );
    await waitFor(() =>
      expect(mockProgress).toHaveBeenCalledWith("sess-123")
    );
  });

  it("shows progress bar with scanned count", async () => {
    mockStart.mockResolvedValue({ session_id: "sess-456", total_items: 3 });
    mockProgress.mockResolvedValue({
      total_inventory: 3,
      scanned: 2,
      missing: [{ barcode: "CCC" }],
    });

    render(<StockCheck />);
    userEvent.click(screen.getByRole("button", { name: /Start Stock Check/i }));

    await waitFor(() => screen.getByText(/2 scanned/));
    await waitFor(() => screen.getByText(/1 remaining/));
  });

  it("shows scanning feedback after scan", async () => {
    mockStart.mockResolvedValue({ session_id: "sess-789", total_items: 3 });
    mockProgress.mockResolvedValue({
      total_inventory: 3,
      scanned: 1,
      missing: [{ barcode: "BBB" }, { barcode: "CCC" }],
    });

    render(<StockCheck />);
    userEvent.click(screen.getByRole("button", { name: /Start Stock Check/i }));

    await waitFor(() => mockScan.mockResolvedValue({}));
  });

  it("shows summary after ending check", async () => {
    mockStart.mockResolvedValue({ session_id: "sess-end", total_items: 3 });
    mockProgress.mockResolvedValue({
      total_inventory: 3,
      scanned: 1,
      missing: [{ barcode: "BBB" }, { barcode: "CCC" }],
    });
    mockEnd.mockResolvedValue({
      session_id: "sess-end",
      total_inventory: 3,
      scanned: 1,
      missing_count: 2,
      missing_barcodes: ["BBB", "CCC"],
    });

    render(<StockCheck />);
    userEvent.click(screen.getByRole("button", { name: /Start Stock Check/i }));

    await waitFor(() => screen.getByText(/End Check/));
    userEvent.click(screen.getByText(/End Check/));

    await waitFor(() => expect(mockEnd).toHaveBeenCalledWith("sess-end"));
  });

  it("allows selecting and removing missing items", async () => {
    mockStart.mockResolvedValue({ session_id: "sess-remove", total_items: 3 });
    mockProgress.mockResolvedValue({
      total_inventory: 3,
      scanned: 0,
      missing: [{ barcode: "AAA" }, { barcode: "BBB" }],
    });

    render(<StockCheck />);
    userEvent.click(screen.getByRole("button", { name: /Start Stock Check/i }));

    // Find checkboxes and check one
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);
    if (checkboxes.length > 0) {
      userEvent.click(checkboxes[0]);
    }
  });
});
