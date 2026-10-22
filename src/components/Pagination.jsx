import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Presentational previous/next pagination control with a "Showing x-y of n" summary.
 * Pair it with `usePagination` (src/hooks/usePagination.js):
 *
 *   const p = usePagination(rows, 10);
 *   <Pagination page={p.page} totalPages={p.totalPages} onPageChange={p.setPage}
 *     showingFrom={p.showingFrom} showingTo={p.showingTo} totalItems={p.totalItems} />
 *
 * Renders nothing when `totalItems` is 0 (show your own empty state instead).
 * Focus rings are left to the browser default so keyboard focus stays visible.
 *
 * @param {object} props
 * @param {number} props.page Current 1-based page.
 * @param {number} props.totalPages Total number of pages (at least 1).
 * @param {(page: number) => void} props.onPageChange Called with the requested page number.
 * @param {number} props.showingFrom 1-based index of the first visible item.
 * @param {number} props.showingTo 1-based index of the last visible item.
 * @param {number} props.totalItems Total number of items across all pages.
 */
export default function Pagination({ page, totalPages, onPageChange, showingFrom, showingTo, totalItems }) {
  if (!totalItems) return null;

  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  const navStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px",
    padding: "12px 0",
    color: "#e2e8f0",
    fontSize: "13px",
    fontFamily: "'Space Grotesk', sans-serif",
  };

  const controlsStyle = { display: "flex", alignItems: "center", gap: "8px" };

  const buttonStyle = (enabled) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: "transparent",
    border: "1px solid #334155",
    borderRadius: "6px",
    color: "#e2e8f0",
    padding: "6px 12px",
    fontSize: "13px",
    fontFamily: "inherit",
    fontWeight: 500,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.45,
    transition: "border-color 0.2s, background 0.2s",
  });

  const highlight = (enabled) => ({
    onMouseEnter: (e) => {
      if (enabled) {
        e.currentTarget.style.borderColor = "#3b82f6";
        e.currentTarget.style.background = "rgba(59,130,246,0.1)";
      }
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.borderColor = "#334155";
      e.currentTarget.style.background = "transparent";
    },
  });

  return (
    <nav aria-label="Pagination" style={navStyle}>
      <p aria-live="polite" aria-atomic="true" style={{ margin: 0 }}>
        Showing{" "}
        <strong>
          {showingFrom}&ndash;{showingTo}
        </strong>{" "}
        of <strong>{totalItems}</strong>
      </p>
      <div style={controlsStyle}>
        <button
          type="button"
          aria-label="Previous page"
          disabled={!canGoPrevious}
          onClick={() => onPageChange(page - 1)}
          style={buttonStyle(canGoPrevious)}
          {...highlight(canGoPrevious)}
        >
          <ChevronLeft size={16} aria-hidden="true" /> Previous
        </button>
        <span style={{ color: "#60a5fa", fontWeight: 600, minWidth: "88px", textAlign: "center" }}>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={!canGoNext}
          onClick={() => onPageChange(page + 1)}
          style={buttonStyle(canGoNext)}
          {...highlight(canGoNext)}
        >
          Next <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
