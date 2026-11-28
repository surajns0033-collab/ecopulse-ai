import { format } from 'date-fns';
import { MapPin, Trash2 } from 'lucide-react';

function identityColors(identity = 'community') {
  let hash = 0;
  for (let index = 0; index < identity.length; index += 1) {
    hash = ((hash << 5) - hash + identity.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    accent: `hsl(${hue} 68% 43%)`,
    foreground: `hsl(${hue} 62% 27%)`,
    background: `hsl(${hue} 80% 92%)`,
  };
}

export function PostCard({ post, canDelete, onDelete }) {
  const identity = identityColors(post.userId || post.author || 'community');
  function getInitials(name) {
    return (name || 'U').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }
  function formatDate(d) {
    if (!d) return '';
    try {
      if (d?.toDate) return format(d.toDate(), 'd MMM, h:mm a');
      return format(new Date(d), 'd MMM, h:mm a');
    } catch { return ''; }
  }

  return (
    <div className="report-detail-section" style={{ marginBottom: 10, borderLeft: `4px solid ${identity.accent}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="community-avatar" style={{ width: 32, height: 32, fontSize: 12, background: identity.background, color: identity.foreground }}>
            {getInitials(post.author || post.userId)}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: identity.foreground }}>{post.author || 'Community Member'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(post.createdAt)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {post.location && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: '#dcfce7', color: '#15803d', fontSize: 11,
            fontWeight: 600, padding: '2px 8px', borderRadius: 12,
          }}>
            <MapPin size={10} /> {post.location}
          </span>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(post)}
            aria-label="Delete your message"
            title="Delete your message"
            style={{ border: 0, background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: 5, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          >
            <Trash2 size={12} />
          </button>
        )}
        </div>
      </div>
      <div style={{ fontSize: 13.5, color: '#1e293b', lineHeight: 1.5 }}>{post.text || post.description}</div>
    </div>
  );
}
