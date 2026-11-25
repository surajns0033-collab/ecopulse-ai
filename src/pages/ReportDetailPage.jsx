// ReportDetailPage — full report details view
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS, REPORT_CATEGORIES, REPORT_STATUS } from '../firebase/collections';
import { ArrowLeft, MapPin, Calendar, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import Header from '../components/chat/Header';

function StatusBadge({ status }) {
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

export default function ReportDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchReport() {
      try {
        // Try fetching by Firestore doc ID first
        const docRef = doc(db, COLLECTIONS.REPORTS, id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setReport({ id: snap.id, ...snap.data() });
          return;
        }
        // Try by reportId field
        const q = query(collection(db, COLLECTIONS.REPORTS), where('reportId', '==', id));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          const d = qSnap.docs[0];
          setReport({ id: d.id, ...d.data() });
        } else {
          setError('Report not found.');
        }
      } catch (err) {
        setError('Could not load report: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [id]);

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
      <div className="page-content">
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div className="spinner" />
          </div>
        )}

        {error && (
          <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 10, padding: 14, fontSize: 14 }}>
            {error}
          </div>
        )}

        {report && (
          <>
            <div className="report-detail-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div className="report-detail-label">Report ID</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#22c55e' }}>
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
                    <span style={{ fontSize: 13, color: '#1e293b' }}>Report received by EcoPulse</span>
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
      </div>
    </div>
  );
}
