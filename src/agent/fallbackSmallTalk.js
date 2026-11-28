const GREETING = /^(hi+|hello+|hey+|yo|hola|namaste|namaskar|namaskaram|good\s+(morning|afternoon|evening)|salaam|salam|hii+|helo+)\b/i;
const THANKS = /\b(thanks?|thank you|thx|shukriya|dhanyawad|dhanyavad)\b/i;
const BYE = /^(bye+|goodbye|see you|good night|gn|ok bye)\b/i;
const WHO = /\b(who are you|what are you|what can you do|what do you do|your name|tum kaun|aap kaun|kaun ho|kya kar sakte)\b/i;

export function casualReply(text, lower, city) {
  // 1. Greeting / small talk
  if (GREETING.test(text) && text.split(/\s+/).length <= 5) {
    return {
      text: 'Hi! How’s your day going?',
      cards: [], actions: [],
      status: 'success',
    };
  }

  if (/\b(?:i\s*need|ineed|need|can you|could you|pls|please).{0,20}\bhelp\b/i.test(lower) || /^(?:help|help me)$/i.test(lower)) {
    return {
      text: `Of course—I'm here. Tell me what you need help with in your own words; it doesn't have to be perfectly typed.`,
      cards: [],
      actions: [],
      status: 'success',
    };
  }

  // 2. Who are you / capabilities
  if (WHO.test(lower)) {
    return {
      text: `I'm **EcoPulse AI**, your environmental assistant for **${city}**. 🌱\n\nI can:\n• Check live **air quality** and **weather** for any city\n• Tell you the **right authority, email, portal and helpline** for a complaint\n• **Draft a complaint email** from your own words\n• Analyse a **photo** of the problem and guide the report\n• Find eco-events and give AQI-based health tips\n\nWhat would you like to do?`,
      cards: [],
      actions: [
        { label: '🌬️ Check AQI', action: 'QUICK_AQI', variant: 'primary' },
        { label: '📧 Draft Complaint Email', action: 'QUICK_DRAFT_EMAIL', variant: 'secondary' },
      ],
      status: 'success',
    };
  }

  // 3. Thanks / bye
  if (THANKS.test(lower) && text.split(/\s+/).length <= 6) {
    return {
      text: 'Anytime! 🌿 If you spot a problem later, send me a photo or the location and I\'ll point you to the right authority.',
      cards: [], actions: [], status: 'success',
    };
  }
  if (BYE.test(lower)) {
    return { text: 'Take care! 🌱 Come back anytime you need help with your area.', cards: [], actions: [], status: 'success' };
  }

  return null;
}
