import { useEffect, useRef, useState } from 'react';
import { REPORT_CATEGORIES } from '../../firebase/collections.js';

export function ReportEditor({ report, onSave, onCancel }) {
  const title = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => { title.current?.focus(); }, []);

  function apply(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const fields = Object.fromEntries(['title', 'description', 'category', 'location'].map(key => [key, String(values.get(key) || '').trim()]));
    if (Object.values(fields).some(value => !value)) {
      setError('Enter a title, description, category and location.');
      return;
    }
    const moved = fields.location !== report.location;
    onSave({ ...report, ...fields, lat: moved ? null : report.lat, lng: moved ? null : report.lng });
  }

  return (
    <form className="inline-card" aria-label="Edit report preview" onSubmit={apply}>
      <label className="modal-label">Title<input ref={title} className="modal-input" name="title" defaultValue={report.title} maxLength={120} required /></label>
      <label className="modal-label">Description<textarea className="modal-input" name="description" defaultValue={report.description} required /></label>
      <label className="modal-label">Location<input className="modal-input" name="location" defaultValue={report.location} required /></label>
      <label className="modal-label">Category<select className="modal-input" name="category" defaultValue={report.category} required>
        {REPORT_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="btn-primary">Apply changes</button>
      <button type="button" className="btn-secondary" onClick={onCancel}>Cancel editing</button>
    </form>
  );
}
