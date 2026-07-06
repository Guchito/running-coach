// Route-transition skeleton: every page here is force-dynamic (DB reads), so
// navigation otherwise freezes on the old page until the server answers.
// Shapes roughly match the common page anatomy (title, stat strip, cards).
export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-8 pt-20 md:pt-8 pb-24 md:pb-8">
      <div className="animate-pulse">
        <div className="h-7 w-44 rounded-lg bg-black/6" />
        <div className="h-4 w-64 rounded-lg bg-black/4 mt-3" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="py-4 flex flex-col items-center gap-2">
              <div className="h-3 w-20 rounded bg-black/4" />
              <div className="h-8 w-24 rounded-lg bg-black/6" />
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <div className="h-48 rounded-2xl bg-black/4" />
          <div className="h-48 rounded-2xl bg-black/4" />
        </div>
        <div className="h-64 rounded-2xl bg-black/4 mt-6" />
      </div>
    </div>
  );
}
