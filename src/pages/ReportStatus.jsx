import { CheckCircle, Clock, AlertCircle } from 'lucide-react';

export function StatusBadge({ status }) {
  const map = {
    submitted: { cls: 'status-submitted', icon: <Clock size={12} />, label: 'Submitted' },
    draft: { cls: 'status-draft', icon: <Clock size={12} />, label: 'Draft' },
    under_review: { cls: 'status-submitted', icon: <AlertCircle size={12} />, label: 'Under Review' },
    resolved: { cls: 'status-resolved', icon: <CheckCircle size={12} />, label: 'Resolved' },
    closed: { cls: 'status-draft', icon: <CheckCircle size={12} />, label: 'Closed' },
  };
  const s = map[status] || map.draft;
  return (
    <span className={`status-badge ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}
