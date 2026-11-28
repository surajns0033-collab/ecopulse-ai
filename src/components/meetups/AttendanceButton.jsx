export function AttendanceButton({ event, joined, pending, unavailable = false, compact = false, onChange }) {
  const full = event.capacity > 0 && event.participantCount >= event.capacity;
  let label = 'Join event';
  if (pending) label = 'Saving…';
  else if (joined) label = 'Cancel my place';
  else if (full) label = 'Event full';
  const className = compact ? 'join-btn' : (joined ? 'btn-danger' : 'btn-primary');
  return <button className={className} style={compact ? undefined : { width: '100%', marginTop: 8 }}
    disabled={unavailable || pending || (!joined && full)} onClick={() => onChange(event, joined)}>
    {label}
  </button>;
}
