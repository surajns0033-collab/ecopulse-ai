import { X } from 'lucide-react';
import { MEETUP_CATEGORIES } from '../firebase/collections';

function keepTabInDialog(event) {
  if (event.key !== 'Tab') return;
  const controls = event.currentTarget.querySelectorAll('button:enabled, input:enabled, select:enabled, textarea:enabled');
  const first = controls[0];
  const last = controls[controls.length - 1];
  const edge = event.shiftKey ? first : last;
  if (event.target === edge) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

export function MeetupDialog({ dialog, form, setForm, venue, handleCreateSubmit, formError, submitting }) {
  return (
  <dialog ref={dialog} className="meetup-dialog" aria-labelledby="create-meetup-heading" onKeyDown={keepTabInDialog}
    onClick={e => { if (e.target === e.currentTarget) dialog.current.close(); }}>
      <form className="create-modal" onSubmit={handleCreateSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 id="create-meetup-heading" style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>🌱 Create Eco Meetup</h2>
          <button type="button" aria-label="Close meetup form" onClick={() => dialog.current.close()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X size={18} />
          </button>
        </div>

        <label className="modal-label" htmlFor="meetup-title">Event Title *</label>
        <input id="meetup-title"
          className="modal-input"
          placeholder="e.g. Cubbon Park Morning Clean-Up"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />

        <label className="modal-label" htmlFor="meetup-category">Category</label>
        <select id="meetup-category"
          className="modal-input"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          {MEETUP_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
          ))}
        </select>

        <label className="modal-label" htmlFor="meetup-location">Location / City *</label>
        <input id="meetup-location"
          className="modal-input"
          placeholder="e.g. Cubbon Park, Bengaluru"
          value={venue}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          required
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="modal-label" htmlFor="meetup-date">Date</label>
            <input id="meetup-date"
              type="date"
              className="modal-input"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <label className="modal-label" htmlFor="meetup-time">Time</label>
            <input id="meetup-time"
              className="modal-input"
              placeholder="7:00 AM"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </div>
        </div>

        <label className="modal-label" htmlFor="meetup-capacity">Places available</label>
        <input id="meetup-capacity" className="modal-input" type="number" min="1" step="1" required
          value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} />

        <label className="modal-label" htmlFor="meetup-description">Description</label>
        <textarea id="meetup-description"
          className="modal-input"
          rows={3}
          placeholder="What will participants do? Gloves/bags provided?"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        {formError && <p role="alert">{formError}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
            {submitting ? 'Publishing...' : '✅ Publish Meetup'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => dialog.current.close()}>
            Cancel
          </button>
        </div>
      </form>
  </dialog>
  );
}
