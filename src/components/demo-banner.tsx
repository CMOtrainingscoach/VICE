export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_VICE_DEMO !== "true") {
    return null;
  }

  return (
    <div
      role="status"
      className="border-b border-amber-700/30 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
    >
      Demo-data — synthetische testomgeving, geen echte klantverwerking.
    </div>
  );
}
