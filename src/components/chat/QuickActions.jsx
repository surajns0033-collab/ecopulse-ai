// Persistent shortcuts for the assistant's core daily-help flows.
import { Wind, CloudSun, Siren, Image, Heart, Navigation, Users, Recycle } from 'lucide-react';

const ACTIONS = [
  { label: 'Air Quality', icon: Wind, command: 'QUICK_AQI' },
  { label: 'Weather Safety', icon: CloudSun, command: 'QUICK_WEATHER_PRECAUTIONS' },
  { label: 'Make Complaint', icon: Siren, command: 'START_COMPLAINT' },
  { label: 'Analyze Photo', icon: Image, command: 'OPEN_IMAGE_PICKER' },
  { label: 'Health Tips', icon: Heart, message: 'Give me health tips for today\'s air quality' },
  { label: 'Low-traffic Routes', icon: Navigation, message: 'Suggest low-pollution routes for commuting' },
  { label: 'Nearby Meetups', icon: Users, message: 'Find eco-meetups and events near me' },
  { label: 'Waste Reduction', icon: Recycle, message: 'Tips for waste reduction and recycling' },
];

export default function QuickActions({ onMessage, onCommand }) {
  return (
    <div className="quick-actions-bar" role="toolbar" aria-label="Quick actions">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          className="quick-action-btn"
          onClick={() => action.command ? onCommand?.(action.command) : onMessage?.(action.message)}
          aria-label={action.label}
        >
          <action.icon size={13} />
          {action.label}
        </button>
      ))}
    </div>
  );
}
