import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { loadReport } from '../services/reportRecords.js';
import { db } from '../firebase/firestoreClient';
import { REPORT_CATEGORIES } from '../firebase/collections';
import { MapPin, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import Header from '../components/chat/Header';
import { StatusBadge } from './ReportStatus.jsx';

export default function ReportDetailPage() {
  const { id } = useParams();
  const { user, firebaseReady } = useAuth();
  const userId = user.uid;
  const [result, setResult] = useState(null);
  const current = result?.id === id && result.userId === userId ? result : null;
  const report = current?.report;
  const error = current?.error;
  const loading = !current;

  useEffect(() => {
    let active = true;
    loadReport(firebaseReady ? db : null, userId, id).then(report => {
      if (active) setResult({ userId, id, report, error: report ? '' : 'Report not found for this account.' });
    }).catch(() => {
      if (active) setResult({ userId, id, error: 'Could not load this report. Check your connection and try again.' });
    });
    return () => { active = false; };
  }, [firebaseReady, id, userId]);

  function formatDate(d) {
    if (!d) return 'Unknown';
    try {
      if (d?.toDate) return format(d.toDate(), 'EEEE, d MMMM yyyy h:mm a');
      return format(new Date(d), 'EEEE, d MMMM yyyy h:mm a');
    } catch { return String(d); }
  }

  const catObj = report ? REPORT_CATEGORIES.find((c) => c.id === report.category) : null;

  return (
    <div className="app-shell">
      <Header />
      <main className="page-content" aria-label="Report details">
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div className="spinner" role="status" aria-label="Loading report" />
          </div>
        )}

        {error && (
          <div role="alert" style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 10, padding: 14, fontSize: 14 }}>
            {error}
          </div>
        )}

        {report && (
          <>
            <div className="report-detail-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div className="report-detail-label">Report ID</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#166534' }}>
                    {report.reportId || report.id}
                  </div>
                </div>
                <StatusBadge status={report.status} />
              </div>

              <div className="report-detail-label">Category</div>
              <div className="report-detail-value" style={{ marginBottom: 10 }}>
                {catObj?.icon} {catObj?.label || report.category}
              </div>

              <div className="report-detail-label">Title</div>
              <div className="report-detail-value" style={{ marginBottom: 10 }}>{report.title}</div>

              <div className="report-detail-label">Description</div>
              <div className="report-detail-value" style={{ marginBottom: 10, color: '#475569' }}>{report.description}</div>

              {report.location && (
                <>
                  <div className="report-detail-label">Location</div>
                  <div className="report-detail-value" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                    <MapPin size={13} color="#22c55e" /> {report.location}
                  </div>
                </>
              )}

              <div className="report-detail-label">Submitted</div>
              <div className="report-detail-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={13} color="#22c55e" /> {formatDate(report.createdAt)}
              </div>
            </div>

            {report.photoUrl && (
              <div className="report-detail-section">
                <div className="report-detail-label" style={{ marginBottom: 8 }}>Attached Photo</div>
                <img
                  src={report.photoUrl}
                  alt="Report evidence"
                  style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8 }}
                />
              </div>
            )}

            {/* Timeline */}
            <div className="report-detail-section">
              <div className="report-detail-label" style={{ marginBottom: 10 }}>Timeline</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#1e293b' }}>Report submitted — {formatDate(report.createdAt)}</span>
                </div>
                {report.status !== 'draft' && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#1e293b' }}>{report.localOnly ? 'Report saved on this device' : 'Report received by EcoPulse'}</span>
                  </div>
                )}
                {report.status === 'resolved' && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#1e293b' }}>Issue resolved ✅</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
