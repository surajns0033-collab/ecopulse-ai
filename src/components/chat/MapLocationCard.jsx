import { MapPin, ExternalLink, Navigation } from 'lucide-react';
import { getGoogleMapsUrl } from '../../services/environmentalData';

export function MapLocationCard({ data }) {
  const { lat, lng, city, label } = data;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const mapsUrl = getGoogleMapsUrl(lat, lng);
  const embedQuery = encodeURIComponent(`${lat},${lng}`);

  return (
    <div className="inline-card">
      <div className="card-header">
        <MapPin size={15} color="#22c55e" />
        <span className="card-title">{label || city || 'Location on Google Maps'}</span>
      </div>
      <div className="card-body">
        <div className="location-map-inline">
          <iframe
            title="Google Map Location"
            loading="lazy"
            src={`https://maps.google.com/maps?q=${embedQuery}&z=14&output=embed`}
            allowFullScreen
          />
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
          Coordinates: {lat.toFixed(4)}, {lng.toFixed(4)}
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            textDecoration: 'none',
            fontSize: 12,
          }}
        >
          <Navigation size={13} /> Open in Google Maps <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}

// ===== MEETUP LIST =====
