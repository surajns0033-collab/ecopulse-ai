import { useId } from 'react';
import { getAQICategory } from '../../services/environmentalData';
import { format } from 'date-fns';

// ===== AQI GAUGE — multi-color gradient arc matching reference screenshot =====
function AQIGauge({ aqi, scale, categoryLabel, categoryColor, categoryBg }) {
  const gradientId = useId();
  const radius = 52;
  const circumference = Math.PI * radius;
  const pct = Math.min(1, Math.max(0.05, (aqi || 0) / 300));
  const dash = pct * circumference;

  return (
    <div className="aqi-gauge-side">
      <svg width="136" height="84" viewBox="0 0 136 84" className="aqi-gauge-svg"
        role="img" aria-label={`${scale || 'AQI'} ${aqi ?? 'unavailable'}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="35%" stopColor="#eab308" />
            <stop offset="65%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        {/* Background track */}
        <path
          d={`M 16 74 A ${radius} ${radius} 0 0 1 120 74`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Gradient active arc */}
        <path
          d={`M 16 74 A ${radius} ${radius} 0 0 1 120 74`}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        <text x="68" y="48" textAnchor="middle" style={{ fontSize: 11, fontWeight: 600, fill: '#6b7280' }}>
          {scale || 'AQI'}
        </text>
        <text x="68" y="72" textAnchor="middle" style={{ fontSize: 28, fontWeight: 800, fill: '#1a1a2e' }}>
          {aqi ?? '--'}
        </text>
      </svg>
      <span
        className="aqi-category-badge"
        style={{ background: categoryBg, color: categoryColor, marginTop: -2 }}
      >
        {categoryLabel}
      </span>
    </div>
  );
}

export function AQICard({ data }) {
  const { aqi, scale, pm25, pm10, no2, o3, city, timestamp, source, sourceUrl, station, insight } = data;
  const cat = getAQICategory(aqi);

  const pollutants = [
    { label: 'PM2.5', value: pm25, unit: 'µg/m³', dot: '#ec4899' },
    { label: 'PM10', value: pm10, unit: 'µg/m³', dot: '#f59e0b' },
    { label: 'NO₂', value: no2, unit: 'µg/m³', dot: '#22c55e' },
    { label: 'O₃', value: o3, unit: 'µg/m³', dot: '#10b981' },
  ].filter((p) => p.value != null);

  const timeStr = timestamp
    ? (() => { try { return format(new Date(timestamp), 'h:mm a'); } catch { return ''; } })()
    : '';

  return (
    <div className="inline-card">
      <div className="aqi-card-layout">
        <AQIGauge
          aqi={aqi}
          scale={scale}
          categoryLabel={cat.label}
          categoryColor={cat.color}
          categoryBg={cat.bg}
        />

        {pollutants.length > 0 && (
          <div className="aqi-pollutant-list">
            {pollutants.map((p) => (
              <div key={p.label} className="aqi-pollutant-row">
                <span className="aqi-pollutant-dot" style={{ background: p.dot }} />
                <span className="aqi-pollutant-name">{p.label}</span>
                <span className="aqi-pollutant-val" style={{ marginLeft: 'auto' }}>
                  {typeof p.value === 'number' ? Math.round(p.value) : p.value}
                  <span className="aqi-pollutant-unit"> {p.unit}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {insight && (
        <div className="ai-insight-box">
          <div className="insight-label">
            <span className="insight-icon">💡</span>
            <span>AI Insight</span>
          </div>
          <p>{insight}</p>
        </div>
      )}

      <div className="aqi-source-row">
        <span>{city ? `📍 ${city} • ` : ''}Source: {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{source}</a> : source || 'Unavailable'}{station && station !== city ? ` (${station})` : ''}</span>
        {timeStr && <span>{timeStr} (your time)</span>}
      </div>
    </div>
  );
}

// ===== GOOGLE MAP LOCATION CARD =====
