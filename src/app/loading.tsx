export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-2 h-3 w-24 rounded bg-line" />
      <div className="mb-8 h-8 w-72 rounded bg-line" />
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[124px] rounded-card border border-line bg-surface" />
        ))}
      </div>
      <div className="mt-6 h-80 rounded-card border border-line bg-surface" />
    </div>
  );
}
