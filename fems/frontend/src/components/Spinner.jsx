export default function Spinner({ className = 'h-8 w-8' }) {
  return (
    <div className={`${className} border-4 border-crimson-200 border-t-crimson-700 rounded-full animate-spin`} />
  );
}

export function PageSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center py-20">
      <Spinner />
    </div>
  );
}
