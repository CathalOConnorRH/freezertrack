import { describe, it, expect, vi, beforeEach } from "vitest";
import { useNavigate } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BrowserRouter } from "react-router-dom";
import StockCheck from "../pages/StockCheck";
import * as client from "../api/client";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

vi.mock("../api/client", () => ({
  confirmStockCheck: vi.fn(),
}));

describe("StockCheck", () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  });

  it("renders the stock check heading", async () => {
    render(
      <BrowserRouter>
        <StockCheck />
      </BrowserRouter>
    );
    expect(screen.getByText(/Stock Check/i)).toBeInTheDocument();
  });

  it("shows success message after successful stock check", async () => {
    vi.mocked(client.confirmStockCheck).mockResolvedValue({
      success: true,
      items: [{ name: "Test Item", barcode: "123" }],
    });

    render(
      <BrowserRouter>
        <StockCheck />
      </BrowserRouter>
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "123" } });
    fireEvent.submit(screen.getByRole("button", { name: /check/i }));

    await waitFor(() => {
      expect(screen.getByText(/Successfully checked 1 item/i)).toBeInTheDocument();
    }, { timeout: 2000 });
    expect(client.confirmStockCheck).toHaveBeenCalledWith(["123"]);
  });

  it("shows error message on failed stock check", async () => {
    vi.mocked(client.confirmStockCheck).mockRejectedValue(new Error("Failed"));

    render(
      <BrowserRouter>
        <StockCheck />
      </BrowserRouter>
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "123" } });
    fireEvent.submit(screen.getByRole("button", { name: /check/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error checking stock/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });
});
