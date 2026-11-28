// src/firebase/collections.js
// Firestore collection names and schema helpers

export const COLLECTIONS = {
  USERS: 'users',
  REPORTS: 'environmentalReports',
  MEETUPS: 'meetups',
  RSVPS: 'meetupRSVPs',
  COMMUNITY_POSTS: 'communityPosts',
  COMMUNITY_ACTIONS: 'communityActions',
  EMAIL_DRAFTS: 'emailDrafts',
  USER_ACTIONS: 'userActions',
  AI_CONVERSATIONS: 'aiConversations',
  AI_ACTION_LOGS: 'aiActionLogs',
};

// Report categories
export const REPORT_CATEGORIES = [
  { id: 'garbage', label: 'Garbage / Illegal Dumping', icon: '🗑️' },
  { id: 'plastic', label: 'Plastic Waste', icon: '♻️' },
  { id: 'burning', label: 'Open Burning', icon: '🔥' },
  { id: 'air', label: 'Air Pollution', icon: '💨' },
  { id: 'construction', label: 'Construction Dust / Debris', icon: '🏗️' },
  { id: 'water', label: 'Water Pollution', icon: '💧' },
  { id: 'sewage', label: 'Sewage', icon: '🚿' },
  { id: 'trees', label: 'Tree Cutting', icon: '🌳' },
  { id: 'greenspace', label: 'Land Filling / Green-Space Damage', icon: '🌿' },
  { id: 'industrial', label: 'Industrial Concern', icon: '🏭' },
  { id: 'road_obstruction', label: 'Road / Footpath Obstruction', icon: '🚗' },
  { id: 'other', label: 'Other', icon: '📋' },
];

// Meetup categories
export const MEETUP_CATEGORIES = [
  { id: 'cleanup', label: 'Cleanup', icon: '🧹' },
  { id: 'plantation', label: 'Tree Plantation', icon: '🌱' },
  { id: 'biodiversity', label: 'Biodiversity', icon: '🦋' },
  { id: 'waste_reduction', label: 'Waste Reduction', icon: '♻️' },
  { id: 'awareness', label: 'Awareness', icon: '📢' },
  { id: 'community', label: 'Community Action', icon: '👥' },
];

// Report status
export const REPORT_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
};

// Meetup status
export const MEETUP_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

const CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function publicCode(prefix) {
  let code = prefix + '-';
  for (let i = 0; i < 6; i++) code += CODE_CHARACTERS[Math.floor(Math.random() * CODE_CHARACTERS.length)];
  return code;
}

export const generateReportId = () => publicCode('EP');
export const generateEventId = () => publicCode('EV');
