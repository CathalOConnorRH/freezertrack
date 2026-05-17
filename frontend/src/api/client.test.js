import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import * as client from "./client";

vi.mock("axios", () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return {
    default: mockAxios,
  };
});

describe("confirmStockCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call the correct endpoint with the provided barcodes", async () => {
    const mockData = ["item1"];
    const mockPost = vi.fn().mockResolvedValue({ data: mockData });
    
    // Access the mocked axios instance
    const axiosInstance = axios.create();
    axiosInstance.post = mockPost;

    const barcodes = ["123", "456"];
    const result = await client.confirmStockCheck(barcodes);

    expect(mockPost).toHaveBeenCalledWith("/food/confirm_stock_check", {
      barcodes,
    });
    expect(result).toEqual(mockData);
  });
});
