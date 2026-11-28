import { ExternalLink } from 'lucide-react';

export function EmailRecipients({ data, toEmail }) {
  return <>
    <div className="email-field">
      <div className="email-field-label">To</div>
      <div className="email-field-value">{toEmail ? `${data.recipientName} — ${toEmail}` : 'No verified email address'}</div>
    </div>
    {data.cc && (
      <div className="email-field">
        <div className="email-field-label">CC</div>
        <div className="email-field-value" style={{ color: '#15803d', fontWeight: 500 }}>
          {data.ccLabel ? `${data.ccLabel} — ` : ''}{data.cc}
        </div>
      </div>
    )}
    <div className="email-field">
      <div className="email-field-label">Organization</div>
      <div className="email-field-value">{data.organization}</div>
    </div>
    {data.portalUrl && (
      <div className="email-field">
        <div className="email-field-label">Complaint Portal</div>
        <a
          href={data.portalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="email-field-value"
          style={{ color: '#166534', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
        >
          {data.portalUrl} <ExternalLink size={11} />
        </a>
      </div>
    )}
    {data.sourceUrl && (
      <div className="email-field">
        <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">Official contact listing <ExternalLink size={11} /></a>
      </div>
    )}
    {data.helpline && (
      <div className="email-field">
        <div className="email-field-label">Helpline</div>
        <div className="email-field-value">📞 {data.helpline}</div>
      </div>
    )}
  </>;
}

export function GmailConsent({ onConfirm, onCancel }) {
  return (
    <div role="group" aria-label="Confirm opening Gmail" onKeyDown={event => { if (event.key === 'Escape') onCancel(); }} style={{
      marginTop: 8, padding: '10px 12px', borderRadius: 10,
      background: '#f0fdf4', border: '1px solid #bbf7d0',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>
        Allow EcoPulse AI to open Gmail with this draft pre-filled in Compose?
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} autoFocus onClick={onConfirm}>
          ✅ Yes, Open Gmail
        </button>
        <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
