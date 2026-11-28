import { useRef, useState } from 'react';
import { EmailRecipients, GmailConsent } from './EmailRecipients.jsx';
import { Zap } from 'lucide-react';

export function EmailPreviewCard({ data, onSave, onCancel }) {
  const [askGmailPerm, setAskGmailPerm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({ subject: data.subject || '', body: data.body || '' }));
  const complete = Boolean(draft.subject.trim() && draft.body.trim());

  const toEmail = data.to && data.to.includes('@') ? data.to : '';
  const ccParam = data.cc && data.cc.includes('@') ? `&cc=${encodeURIComponent(data.cc)}` : '';
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toEmail)}${ccParam}&su=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;

  const gmailButton = useRef(null);
  function closeGmailConsent() {
    setAskGmailPerm(false);
    gmailButton.current?.focus();
  }

  function handleConfirmOpenGmail() {
    setAskGmailPerm(false);
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  }

  function handleCopyDraft() {
    const ccLine = data.cc ? `CC: ${data.cc}\n` : '';
    const text = `${toEmail ? `To: ${toEmail}\n` : ''}${ccLine}Subject: ${draft.subject}\n\n${draft.body}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="inline-card">
      <div className="card-header">
        <Zap size={15} color="#3b82f6" />
        <span className="card-title">Email Draft</span>
      </div>
      <div className="email-preview-body">
        <EmailRecipients data={data} toEmail={toEmail} />
        <div className="email-field">
          <div className="email-field-label">Subject</div>
          {editing ? <input className="email-draft-edit" aria-label="Draft subject" value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
            : <div className="email-field-value">{draft.subject}</div>}
        </div>
        <div className="email-field">
          <div className="email-field-label">Body Preview</div>
          {editing ? <textarea className="email-draft-edit" aria-label="Draft body" rows={8} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
            : <div className="email-body-preview" role="region" aria-label="Draft body preview" tabIndex={0}>{draft.body}</div>}
        </div>
        {data.disclaimer && (
          <div style={{ fontSize: 12, color: '#475569', marginTop: 6, fontStyle: 'italic' }}>
            ⚠️ {data.disclaimer}
          </div>
        )}
      </div>
      {askGmailPerm && <GmailConsent onConfirm={handleConfirmOpenGmail} onCancel={closeGmailConsent} />}

      <div className="report-actions">
        <button className="btn-primary" disabled={!complete || editing} onClick={() => onSave?.({ ...data, ...draft })}>📧 Save Draft</button>
        {toEmail && <button ref={gmailButton} className="btn-secondary" disabled={!complete || editing} onClick={() => setAskGmailPerm(true)}>✉️ Open in Gmail</button>}
        <button className="btn-secondary" disabled={!complete || editing} onClick={handleCopyDraft}>
          {copied ? '✅ Copied' : '📋 Copy'}
        </button>
        <button className="btn-secondary" onClick={() => { setAskGmailPerm(false); setEditing(!editing); }}>{editing ? 'Done editing' : '✏️ Edit'}</button>
        <button className="btn-danger" onClick={() => onCancel && onCancel()}>✕ Cancel</button>
      </div>
    </div>
  );
}
