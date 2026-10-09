interface SeatMeterProps {
  capacity: number;
  taken: number;
  closed?: boolean;
}

export function SeatMeter({ capacity, taken, closed = false }: SeatMeterProps) {
  const left = Math.max(capacity - taken, 0);
  const full = left === 0;
  const tight = !full && left <= Math.max(2, Math.ceil(capacity * 0.15));
  const tone = closed ? "closed" : full ? "full" : tight ? "tight" : "open";
  const label = full ? "Full" : `${left} ${left === 1 ? "seat" : "seats"} left`;

  return (
    <div className={`seats seats-${tone}`} role="img" aria-label={`${taken} of ${capacity} seats taken. ${label}`}>
      {capacity <= 30 ? (
        <div className="seat-row" aria-hidden="true">
          {Array.from({ length: capacity }, (_, index) => (
            <span key={index} className={index < taken ? "seat seat-taken" : "seat"} />
          ))}
        </div>
      ) : (
        <div className="seat-bar" aria-hidden="true">
          <span style={{ width: `${Math.min((taken / capacity) * 100, 100)}%` }} />
        </div>
      )}
      <span className="seat-label">
        {label}
        <span className="seat-count">
          {taken}/{capacity}
        </span>
      </span>
    </div>
  );
}
