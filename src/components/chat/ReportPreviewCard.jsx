import { useRef, useState } from 'react';
import { ReportEditor } from './ReportEditor.jsx';
import { MapPin, AlertCircle, ExternalLink } from 'lucide-react';
import { getGoogleMapsUrl } from '../../services/environmentalData';
import { REPORT_CATEGORIES } from '../../firebase/collections';

export function ReportPreviewCard({ data: initial, onSubmit, onCancel }) {
  const [data, setData] = useState(initial);
  const [editing, setEditing] = useState(false);
  const editButton = useRef(null);
  function closeEditor() {
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  }
  if (editing) return <ReportEditor report={data} onCancel={closeEditor} onSave={updated => { setData(updated); closeEditor(); }} />;
  const catObj = REPORT_CATEGORIES.find((c) => c.id === data.category);
  const mapsUrl = getGoogleMapsUrl(data.lat, data.lng, data.location);

  return (
    <div className="inline-card">
      <div className="card-header">
        <AlertCircle size={15} color="#f59e0b" />
        <span className="card-title">Report Preview</span>
      </div>
      <div className="report-preview-fields">
        <div className="report-field">
          <span className="report-field-label">Category</span>
          <span className="report-field-value">{catObj?.icon} {catObj?.label || data.category}</span>
        </div>
        <div className="report-field">
          <span className="report-field-label">Title</span>
          <span className="report-field-value">{data.title}</span>
        </div>
        <div className="report-field">
          <span className="report-field-label">Description</span>
          <span className="report-field-value" style={{ fontSize: 12, color: '#6b7280' }}>{data.description}</span>
        </div>
        <div className="report-field">
          <span className="report-field-label">Location</span>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="report-field-value"
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#166534', textDecoration: 'none' }}
          >
            <MapPin size={12} color="#22c55e" /> {data.location} <ExternalLink size={11} />
          </a>
        </div>
        {data.photoUrl && (
          <div className="report-field">
            <span className="report-field-label">Photo</span>
            <img src={data.photoUrl} alt="Report" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
          </div>
        )}
      </div>
      <div className="report-actions">
        <button className="btn-primary" onClick={() => onSubmit && onSubmit(data)}>✅ Submit Report</button>
        <button className="btn-secondary" ref={editButton} onClick={() => setEditing(true)}>✏️ Edit</button>
        <button className="btn-danger" onClick={() => onCancel && onCancel()}>✕ Cancel</button>
      </div>
    </div>
  );
}
