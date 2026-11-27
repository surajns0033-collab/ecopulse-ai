import { Users, CheckCircle, AlertCircle, Zap, Droplets } from 'lucide-react';
import { REPORT_CATEGORIES } from '../../firebase/collections';
import { format } from 'date-fns';

export function ConfirmationCard({ data }) {
  return (
    <div className="inline-card">
      <div className="confirmation-card">
        <div className="confirmation-icon">
          <CheckCircle size={28} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{data.title || 'Success!'}</div>
        <div style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>{data.message}</div>
        {data.id && <div className="confirmation-id">{data.id}</div>}
      </div>
    </div>
  );
}

// ===== IMAGE ANALYSIS CARD =====
export function ImageAnalysisCard({ data }) {
  const severityClass = `severity-${data.severity || 'moderate'}`;
  const confidencePct = Math.round((data.confidence || 0) * 100);
  const catObj = REPORT_CATEGORIES.find((c) => c.id === data.category);

  return (
    <div className="inline-card">
      <div className="card-header">
        <AlertCircle size={15} color="#f59e0b" />
        <span className="card-title">Environmental Analysis</span>
      </div>
      {data.preview && (
        <img
          src={data.preview}
          alt="Analyzed"
          style={{ width: '100%', maxHeight: 180, objectFit: 'cover' }}
        />
      )}
      <div className="analysis-result">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className={`analysis-badge ${severityClass}`}>
            {data.severity?.toUpperCase()} SEVERITY
          </span>
          {catObj && (
            <span style={{ fontSize: 11, background: '#f3f4f6', padding: '3px 10px', borderRadius: 20, color: '#4b5563' }}>
              {catObj.icon} {catObj.label}
            </span>
          )}
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{data.issue}</div>
        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{data.description}</div>

        <div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>AI Confidence: {confidencePct}%</div>
          <div className="confidence-bar">
            <div className="confidence-fill" style={{ width: `${confidencePct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== COMMUNITY FEED =====

export function CommunityFeedCard({ data }) {
  const { posts } = data;

  function getInitials(name) {
    return (name || 'U').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  return (
    <div className="inline-card">
      <div className="card-header">
        <Users size={15} color="#22c55e" />
        <span className="card-title">Community Feed</span>
      </div>
      {posts.map((post, i) => (
        <div key={post.id || i} className="community-post-item">
          <div className="community-post-meta">
            <div className="community-avatar">{getInitials(post.author || post.userId)}</div>
            <span className="community-post-author">{post.author || 'Community Member'}</span>
            <span className="community-post-time">
              {post.createdAt?.toDate
                ? (() => { try { return format(post.createdAt.toDate(), 'd MMM'); } catch { return ''; } })()
                : ''}
            </span>
          </div>
          <div className="community-post-text">{post.text || post.description || 'No description'}</div>
        </div>
      ))}
    </div>
  );
}

// ===== DAILY PLAN CARD =====
export function DailyPlanCard({ data }) {
  const { actions } = data;

  return (
    <div className="inline-card">
      <div className="card-header">
        <Zap size={15} color="#22c55e" />
        <span className="card-title">Today's Eco-Action Plan</span>
      </div>
      {actions.map((item, i) => (
        <div key={i} className="daily-plan-item">
          <div className="daily-plan-num">{i + 1}</div>
          <div className="daily-plan-text">{item.icon} {item.action}</div>
        </div>
      ))}
    </div>
  );
}

// ===== WATER QUALITY CARD =====
export function WaterQualityCard({ data }) {
  const items = [
    { icon: '👃', text: 'Unusual smell or colour? Report it immediately — it may indicate contamination.' },
    { icon: '🧪', text: 'Ask your local water utility where to get drinking water tested.' },
    { icon: '💧', text: 'If contamination is suspected, use a known safe supply and follow local advisories. Boiling does not remove chemicals.' },
    { icon: '🚫', text: 'Never dump chemicals, oil, or paints into storm drains or water bodies.' },
  ];

  return (
    <div className="inline-card">
      <div className="card-header">
        <Droplets size={15} color="#3b82f6" />
        <span className="card-title">Water Quality Info</span>
      </div>
      <div className="water-info-card">
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          Real-time water quality data is not available via free APIs for {data?.city || 'this location'}. Here's what to look out for:
        </div>
        {items.map((item, i) => (
          <div key={i} className="water-info-item">
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== MEETUP PREVIEW CARD (Bot-assisted creation) =====
