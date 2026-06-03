export default function Pagination({ pagination, onChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total, limit } = pagination;

  const pages = [];
  const delta = 2;
  for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
    pages.push(i);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-100">
      <p className="text-xs text-gray-500">
        Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total} records
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:border-crimson-300 hover:text-crimson-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Previous
        </button>

        {pages[0] > 1 && (
          <>
            <button onClick={() => onChange(1)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-crimson-300 hover:text-crimson-700 transition">1</button>
            {pages[0] > 2 && <span className="px-1 text-gray-400 text-xs">...</span>}
          </>
        )}

        {pages.map(p => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition font-medium
              ${p === page
                ? 'bg-crimson-700 border-crimson-700 text-white'
                : 'border-gray-200 text-gray-600 hover:border-crimson-300 hover:text-crimson-700'
              }`}
          >
            {p}
          </button>
        ))}

        {pages[pages.length - 1] < totalPages && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && <span className="px-1 text-gray-400 text-xs">...</span>}
            <button onClick={() => onChange(totalPages)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-crimson-300 hover:text-crimson-700 transition">{totalPages}</button>
          </>
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:border-crimson-300 hover:text-crimson-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Next
        </button>
      </div>
    </div>
  );
}
