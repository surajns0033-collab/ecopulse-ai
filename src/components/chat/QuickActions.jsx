// Persistent shortcuts for the assistant's core daily-help flows.
import { useState } from 'react';
import { Wind, CloudSun, CloudFog, Siren, Image, Heart, Navigation, Users, Recycle } from 'lucide-react';

const ACTIONS = [
  { label: 'Air Quality', icon: Wind, command: 'QUICK_AQI' },
  { label: 'Weather Safety', icon: CloudSun, command: 'QUICK_WEATHER_PRECAUTIONS' },
  { label: 'Smog Plan', icon: CloudFog, command: 'QUICK_SMOG_PLAN' },
  { label: 'Make Complaint', icon: Siren, command: 'START_COMPLAINT' },
  { label: 'Analyze Photo', icon: Image, command: 'OPEN_IMAGE_PICKER' },
  { label: 'Health Tips', icon: Heart, message: 'Give me health tips for today\'s air quality' },
  { label: 'Low-traffic Routes', icon: Navigation, message: 'Suggest low-pollution routes for commuting' },
  { label: 'Nearby Meetups', icon: Users, message: 'Find eco-meetups and events near me' },
  { label: 'Waste Reduction', icon: Recycle, message: 'Tips for waste reduction and recycling' },
];

export default function QuickActions({ onMessage, onCommand }) {

  const [active, setActive] = useState(0);

  function moveFocus(event) {
    const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    const last = buttons.length - 1;
    let next;
    switch (event.key) {
      case 'ArrowRight': next = index === last ? 0 : index + 1; break;
      case 'ArrowLeft': next = index === 0 ? last : index - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      default: return;
    }
    event.preventDefault();
    buttons[next].focus();
  }

  return (
    <div className="quick-actions-bar" role="toolbar" aria-label="Quick actions" onKeyDown={moveFocus}>
      {ACTIONS.map((action, index) => (
        <button
          key={action.label}
          tabIndex={index === active ? 0 : -1}
          onFocus={() => setActive(index)}
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
