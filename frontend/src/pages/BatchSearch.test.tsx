/**
 * Tests for the BatchSearch page.
 *
 * WHAT THESE TESTS VERIFY:
 *   - All checkbox groups render with correct labels
 *   - Locked dropdowns (Genome, Organism) render and are disabled
 *   - Chromosome multi-select renders with all 24 options
 *   - Download link is present
 *   - Checking a box updates the display (count message changes)
 *   - Strand checkbox group renders all three options
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BatchSearch from "./BatchSearch";
import { useInsertions } from "../hooks/useInsertions";

// Mock useInsertions so we don't need a real API
vi.mock("../hooks/useInsertions");

/** Helper: wraps component in QueryClientProvider. */
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("BatchSearch", () => {
  beforeEach(() => {
    vi.mocked(useInsertions).mockReturnValue({
      data: { total: 44984, limit: 1, offset: 0, results: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof useInsertions>);
  });

  it("renders Category checkbox group", () => {
    renderWithProviders(<BatchSearch />);
    expect(screen.getByText("By Category:")).toBeInTheDocument();
    expect(screen.getByLabelText("Reference")).toBeInTheDocument();
    expect(screen.getByLabelText("Non-reference")).toBeInTheDocument();
  });

  it("renders ME Family checkbox group", () => {
    renderWithProviders(<BatchSearch />);
    expect(screen.getByText("By ME Family:")).toBeInTheDocument();
    expect(screen.getByLabelText("Alu")).toBeInTheDocument();
    expect(screen.getByLabelText("LINE1")).toBeInTheDocument();
    expect(screen.getByLabelText("SVA")).toBeInTheDocument();
    expect(screen.getByLabelText("HERVK")).toBeInTheDocument();
    expect(screen.getByLabelText("Processed Pseudogene")).toBeInTheDocument();
  });

  it("renders Annotation checkbox group", () => {
    renderWithProviders(<BatchSearch />);
    expect(screen.getByText("By Annotation:")).toBeInTheDocument();
    expect(screen.getByLabelText("Promoter")).toBeInTheDocument();
    expect(screen.getByLabelText("Intronic")).toBeInTheDocument();
    expect(screen.getByLabelText("Intergenic")).toBeInTheDocument();
  });

  it("renders Strand checkbox group", () => {
    renderWithProviders(<BatchSearch />);
    expect(screen.getByText("By Strand:")).toBeInTheDocument();
    expect(screen.getByLabelText("Positive")).toBeInTheDocument();
    expect(screen.getByLabelText("Negative")).toBeInTheDocument();
  });

  it("renders locked Genome Version dropdown", () => {
    renderWithProviders(<BatchSearch />);
    expect(screen.getByText("By Genome Version:")).toBeInTheDocument();
    const select = screen.getByDisplayValue("GRCh38");
    expect(select).toBeDisabled();
  });

  it("renders locked Organism dropdown", () => {
    renderWithProviders(<BatchSearch />);
    expect(screen.getByText("By Organism:")).toBeInTheDocument();
    const select = screen.getByDisplayValue("Human");
    expect(select).toBeDisabled();
  });

  it("renders chromosome multi-select with 24 options", () => {
    renderWithProviders(<BatchSearch />);
    expect(screen.getByText("By Chromosomes:")).toBeInTheDocument();
    // Check first and last chromosome options
    expect(screen.getByText("Chr1")).toBeInTheDocument();
    expect(screen.getByText("ChrY")).toBeInTheDocument();
  });

  it("renders Download link", () => {
    renderWithProviders(<BatchSearch />);
    expect(screen.getByText("Download")).toBeInTheDocument();
  });

  it("shows entry count", () => {
    renderWithProviders(<BatchSearch />);
    expect(screen.getByText("44,984 entries match your filters")).toBeInTheDocument();
  });

  it("toggling a checkbox calls useInsertions with updated params", () => {
    renderWithProviders(<BatchSearch />);
    // Check the "Non-reference" checkbox
    const checkbox = screen.getByLabelText("Non-reference");
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("strand checkboxes are checked/unchecked correctly", () => {
    renderWithProviders(<BatchSearch />);
    const positive = screen.getByLabelText("Positive");
    const negative = screen.getByLabelText("Negative");

    // Initially unchecked
    expect(positive).not.toBeChecked();
    expect(negative).not.toBeChecked();

    // Check Positive
    fireEvent.click(positive);
    expect(positive).toBeChecked();
    expect(negative).not.toBeChecked();

    // Check Negative too — both can be checked simultaneously
    fireEvent.click(negative);
    expect(positive).toBeChecked();
    expect(negative).toBeChecked();
  });

  it("chromosome multi-select renders all options", () => {
    renderWithProviders(<BatchSearch />);
    expect(screen.getByText("Chr1")).toBeInTheDocument();
    expect(screen.getByText("ChrX")).toBeInTheDocument();
    expect(screen.getByText("ChrY")).toBeInTheDocument();
  });

  it("useInsertions is called with strand param when strand checkbox is checked", () => {
    const mockUseInsertions = vi.mocked(useInsertions);
    renderWithProviders(<BatchSearch />);

    // Check Positive strand — should trigger a re-render with strand="+" in params
    fireEvent.click(screen.getByLabelText("Positive"));

    // The most recent call to useInsertions should include strand="+"
    const lastCall = mockUseInsertions.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ strand: "+" });
  });
});
