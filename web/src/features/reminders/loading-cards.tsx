export function LoadingCards({ label }: { label: string }) {
  return (
    <div className="loading-state" role="status" aria-label={label}>
      <p className="muted">{label}…</p>
      <div className="reminder-list" aria-hidden="true">
        {[0, 1].map((item) => (
          <div className="loading-card" key={item}>
            <span className="loading-line short" />
            <span className="loading-line" />
            <span className="loading-line medium" />
          </div>
        ))}
      </div>
    </div>
  );
}
