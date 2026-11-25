// Intent Detection Engine — keyword-based, supports English + Hindi + Hinglish

export const INTENTS = {
  ASK_QUESTION: 'ASK_QUESTION',
  GET_AIR_QUALITY: 'GET_AIR_QUALITY',
  GET_WATER_QUALITY: 'GET_WATER_QUALITY',
  GET_WEATHER: 'GET_WEATHER',
  CREATE_REPORT: 'CREATE_REPORT',
  UPLOAD_PHOTO_REPORT: 'UPLOAD_PHOTO_REPORT',
  FIND_EVENTS: 'FIND_EVENTS',
  JOIN_EVENT: 'JOIN_EVENT',
  CREATE_EVENT: 'CREATE_EVENT',
  CREATE_EMAIL: 'CREATE_EMAIL',
  GET_AUTHORITY_CONTACTS: 'GET_AUTHORITY_CONTACTS',
  GET_COMMUNITY: 'GET_COMMUNITY',
  GET_DAILY_PLAN: 'GET_DAILY_PLAN',
  GET_HEALTH_TIPS: 'GET_HEALTH_TIPS',
  GET_ROUTES: 'GET_ROUTES',
  GET_USER_IMPACT: 'GET_USER_IMPACT',
  GET_WASTE_TIPS: 'GET_WASTE_TIPS',
  GET_SMOG_PLAN: 'GET_SMOG_PLAN',
};

// Keyword patterns for each intent (ordered & weighted so specific intents aren't hijacked)
const INTENT_PATTERNS = [
  {
    intent: INTENTS.GET_SMOG_PLAN,
    keywords: ['smog plan', 'winter smog', 'personalized air plan', 'personalised air plan', 'indoor air plan', 'low-emission routine'],
    confidence: 0.99,
    tool: null,
  },
  {
    intent: INTENTS.GET_HEALTH_TIPS,
    keywords: ['aqi health', 'air quality health', 'pollution health', 'pollution mask', 'smog health', 'pm2.5 health'],
    confidence: 0.95,
    tool: null,
  },
  {
    intent: INTENTS.GET_ROUTES,
    keywords: ['low-traffic', 'low-pollution', 'low traffic', 'less pollution', 'green route', 'routes', 'route', 'commuting', 'commute', 'rasta', 'path', 'travel'],
    confidence: 0.94,
    tool: null,
  },
  {
    intent: INTENTS.GET_WASTE_TIPS,
    keywords: ['waste reduction', 'recycling', 'recycle waste', 'plastic free', 'compost', 'waste segregation', 'segregate waste', 'garbage tips'],
    confidence: 0.94,
    tool: null,
  },
  {
    intent: INTENTS.FIND_EVENTS,
    keywords: ['meetups', 'meetup', 'eco-meetups', 'events', 'event', 'cleanup', 'plantation', 'drive', 'events near', 'nearby events', 'community events', 'volunteer', 'upcoming'],
    confidence: 0.92,
    tool: 'getNearbyMeetups',
  },
  {
    intent: INTENTS.GET_AIR_QUALITY,
    keywords: ['aqi', 'air quality', 'air pollution', 'pollution', 'pradushan', 'pm2.5', 'pm10', 'air', 'hawa', 'smog', 'dust', 'breathe', 'saans', 'meter', 'gauge'],
    confidence: 0.88,
    tool: 'getEnvironmentalData',
  },
  {
    intent: INTENTS.GET_WATER_QUALITY,
    keywords: ['water quality', 'paani', 'pani', 'drinking water', 'water pollution', 'jal', 'river pollution', 'creek', 'nadi'],
    confidence: 0.9,
    tool: null,
  },
  {
    intent: INTENTS.GET_WEATHER,
    keywords: ['weather', 'mausam', 'rain', 'baarish', 'temperature', 'garmi', 'thand', 'humidity', 'forecast', 'wind'],
    confidence: 0.88,
    tool: 'getEnvironmentalData',
  },
  {
    intent: INTENTS.CREATE_REPORT,
    keywords: ['report', 'complaint', 'shikayat', 'file', 'complain', 'issue', 'problem', 'garbage', 'kachra', 'burning', 'jalana', 'sewage', 'nali', 'plastic', 'illegal', 'dumping', 'tree', 'trees', 'cutting', 'cut', 'mangrove', 'felling', 'felled', 'chopped', 'damage'],
    confidence: 0.86,
    tool: 'createEnvironmentalReport',
    requiresConfirmation: true,
  },
  {
    intent: INTENTS.UPLOAD_PHOTO_REPORT,
    keywords: ['photo', 'image', 'picture', 'tasveer', 'click', 'pic', 'capture', 'scan', 'analyze image', 'check image'],
    confidence: 0.82,
    tool: 'analyzeEnvironmentalImage',
  },
  {
    intent: INTENTS.JOIN_EVENT,
    keywords: ['join', 'rsvp', 'register', 'sign up', 'participate', 'book', 'attend', 'come', 'aaunga', 'jaaunga'],
    confidence: 0.85,
    tool: 'joinMeetup',
    requiresConfirmation: true,
  },
  {
    intent: INTENTS.CREATE_EVENT,
    keywords: ['create event', 'organise', 'organize', 'host', 'plan event', 'new event', 'start event', 'create meetup', 'plan meetup'],
    confidence: 0.9,
    tool: 'createMeetup',
    requiresConfirmation: true,
  },
  {
    intent: INTENTS.CREATE_EMAIL,
    keywords: ['email', 'mail', 'bhejo', 'send', 'authority', 'officer', 'official', 'complain to', 'write to', 'draft', 'letter', 'contact authority'],
    confidence: 0.86,
    tool: 'createEmailDraft',
    requiresConfirmation: true,
  },
  {
    intent: INTENTS.GET_COMMUNITY,
    keywords: ['community feed', 'eco community', 'nearby reports', 'local environmental posts'],
    confidence: 0.82,
    tool: 'getCommunityFeed',
  },
  {
    intent: INTENTS.GET_DAILY_PLAN,
    keywords: ['eco daily plan', 'environmental action plan', 'green checklist', 'sustainability routine'],
    confidence: 0.78,
    tool: 'getDailyActionPlan',
  },
  {
    intent: INTENTS.GET_USER_IMPACT,
    keywords: ['my impact', 'my reports', 'mera', 'my stats', 'contribution', 'how much', 'my activity', 'profile', 'my account'],
    confidence: 0.85,
    tool: 'getUserImpact',
  },
];

/**
 * Detect user intent from a message
 * @param {string} message
 * @param {Array} conversationHistory
 * @returns {{ intent, confidence, entities, suggestedTool, requiresConfirmation }}
 */
export function detectIntent(message, conversationHistory = []) {
  const lower = message.toLowerCase().trim();

  if (/\b(smog plan|winter smog|personalized (?:air|clean-air) plan|personalised (?:air|clean-air) plan|indoor air plan|low-emission routine)\b/i.test(lower)) {
    return {
      intent: INTENTS.GET_SMOG_PLAN,
      confidence: 0.99,
      suggestedTool: null,
      requiresConfirmation: false,
      entities: extractEntities(lower),
      message: lower,
    };
  }

  // Explicit check: creating/organizing an event or meetup must take priority over FIND_EVENTS
  if (
    /\b(create|organi[sz]e|host|start|plan|make|setup|set up)\b/.test(lower) &&
    /\b(meetup|meet-up|event|drive|cleanup|clean-up|plantation)\b/.test(lower)
  ) {
    return {
      intent: INTENTS.CREATE_EVENT,
      confidence: 0.98,
      suggestedTool: 'createMeetup',
      requiresConfirmation: true,
      entities: extractEntities(lower),
      message: lower,
    };
  }

  // Explicit check: user wants the contact directory itself (national / state /
  // local authority emails, helplines, portals) rather than a report or a draft.
  const wantsAuthorityContacts =
    (/\b(national|central|state|local)\b/i.test(lower) &&
      /\b(contact|contacts|helpline|email|phone|portal|authorit)/i.test(lower)) ||
    /\b(contact details?|contact numbers?|helpline numbers?|list of (authorities|contacts)|authority contacts?|all contacts?)\b/i.test(lower);

  if (wantsAuthorityContacts) {
    return {
      intent: INTENTS.GET_AUTHORITY_CONTACTS,
      confidence: 0.97,
      suggestedTool: null,
      requiresConfirmation: false,
      entities: extractEntities(lower),
      message: lower,
    };
  }

  // Explicit live-web requests must not be confused with the app's local
  // community feed merely because they contain words such as "news/latest".
  const wantsWebSearch = /\b(search (?:the )?web|google (?:this|it|for)|look (?:this )?up|latest (?:news|update|information)|recent news|today'?s news|current (?:law|rules?|policy|deadline|official update))\b/i.test(lower);
  if (wantsWebSearch) {
    return {
      intent: INTENTS.ASK_QUESTION,
      confidence: 0.99,
      suggestedTool: null,
      requiresConfirmation: false,
      entities: extractEntities(lower),
      message: lower,
    };
  }

  // Explicit check: user wants to draft, prepare, provide, or CC an email
  const recentContext = (conversationHistory || []).slice(-5).map((item) => item.text || '').join(' ');
  const civicEmailContext = /\b(complaint|municipal|authority|pollution|garbage|dumping|burning|sewage|naala|nala|tree cutting|forest|traffic police|road obstruction|mpcb|nmmc|bmc|bbmp|mcd)\b/i.test(`${lower} ${recentContext}`);
  const wantsToDraftEmail = civicEmailContext && (
    (/\b(draft|write|compose|create|send|bhejo|provide|give|generate|prepare|make)\b/i.test(lower) && /\b(email|mail|complaint)\b/i.test(lower)) ||
    (/\b(cc|forest)\b/i.test(lower) && /\b(email|mail)\b/i.test(lower)) ||
    /^(email|mail|draft|draft email|provide email|give email|send email)$/i.test(lower) ||
    lower.startsWith('draft ')
  );

  if (wantsToDraftEmail) {
    return {
      intent: INTENTS.CREATE_EMAIL,
      confidence: 0.97,
      suggestedTool: 'createEmailDraft',
      requiresConfirmation: true,
      entities: extractEntities(lower),
      message: lower,
    };
  }

  // General daily-life requests must stay with the conversational model instead
  // of being hijacked by similarly named environmental shortcuts.
  const environmentalHealthContext = /\b(aqi|air quality|pollution|smog|pm2\.5|pm10|smoke exposure)\b/i.test(lower);
  const looksLikeGeneralHealth = /\b(health|sleep|diet|exercise|stress|sehat|healthy)\b/i.test(lower) && !environmentalHealthContext;
  const looksLikeGeneralPlan = /\b(plan my day|daily schedule|study plan|work plan|interview plan|trip plan|plan today)\b/i.test(lower);
  const looksLikeGeneralRoute = /\b(route|travel|trip)\b/i.test(lower) && !/\b(traffic|commute|pollution|green route|low-traffic|low pollution)\b/i.test(lower);
  const looksLikeGeneralEvent = /\b(event|events)\b/i.test(lower) && !/\b(eco|environment|cleanup|clean-up|plantation|community)\b/i.test(lower);
  const nonEnvironmentalAir = /\b(air india|air fryer|air conditioner|air conditioning)\b/i.test(lower);
  const looksLikeGeneralWriting = /\b(email|mail|letter|message|application|resume|cover letter)\b/i.test(lower) && !civicEmailContext;
  if (looksLikeGeneralHealth || looksLikeGeneralPlan || looksLikeGeneralRoute || looksLikeGeneralEvent || nonEnvironmentalAir || looksLikeGeneralWriting) {
    return {
      intent: INTENTS.ASK_QUESTION,
      confidence: 0.98,
      suggestedTool: null,
      requiresConfirmation: false,
      entities: extractEntities(lower),
      message: lower,
    };
  }

  // Someone describing a real-world situation (not a general question) should reach
  // the complaint flow even if they phrase it as "what should I do / where do I call".
  const issueWord = /\b(garbage|kachra|waste|dumping|dump|landfill|excavation|rubble|soil|debris|burning|buring|smoke|sewage|nali|naala|nala|drain|overflow|tree|cutting|felling|plastic|litter|dust|construction|pollution|parking|parked|vehicle|obstruction|blocked|footpath|leak|chemical|stink|smell)\b/i;
  const situationWord = /\b(my|our|near|nearby|outside|behind|in front|beside|society|building|street|road|area|locality|colony|vashi|kharghar|belapur|panvel|ulwe|airoli|nerul|saw|seen|noticed|happening|since|stink|smell|complain|complaint|report|shikayat|kisko|kahan|where|whom)\b/i;
  if (issueWord.test(lower) && situationWord.test(lower) && lower.trim().split(/\s+/).length >= 3) {
    return {
      intent: INTENTS.CREATE_REPORT,
      confidence: 0.95,
      suggestedTool: 'createEnvironmentalReport',
      requiresConfirmation: true,
      entities: extractEntities(lower),
      message: lower,
    };
  }

  // Questions or feedback about emails/procedures go to AI
  const isAskingOrFeedbackAboutEmail =
    /\b(not enough|not engough|insufficient|more|other|what|which|who|whom|tell|is there|any other)\b/i.test(lower) &&
    /\b(email|mail)\b/i.test(lower);
  const isQuestionOrHowTo =
    isAskingOrFeedbackAboutEmail ||
    /\b(how|where|steps|step|process|procedure|which|who|whom|what|why|kaise|kahan|kisko|kya)\b/.test(lower) ||
    /https?:\/\//.test(lower);

  if (isQuestionOrHowTo && !/\b(aqi|air quality|weather|temperature|meetup|meetups|event|events|route|routes|health tips|waste reduction)\b/.test(lower)) {
    return {
      intent: INTENTS.ASK_QUESTION,
      confidence: 0.96,
      suggestedTool: null,
      requiresConfirmation: false,
      entities: extractEntities(lower),
      message: lower,
    };
  }

  // Witnessed incident ("saw / seen / sighted / noticed ... dumping / smoke / cutting / sewage") -> CREATE_REPORT
  if (
    /\b(saw|seen|sighted|noticed|happening|going on|someone is)\b/.test(lower) &&
    /\b(garbage|waste|dumping|smoke|industrial|burning|buring|sewage|drain|tree|cutting|pollution|leak|chemical)\b/.test(lower)
  ) {
    return {
      intent: INTENTS.CREATE_REPORT,
      confidence: 0.96,
      suggestedTool: 'createEnvironmentalReport',
      requiresConfirmation: true,
      entities: extractEntities(lower),
      message: lower,
    };
  }

  let bestMatch = {
    intent: INTENTS.ASK_QUESTION,
    confidence: 0.5,
    suggestedTool: null,
    requiresConfirmation: false,
  };

  for (const pattern of INTENT_PATTERNS) {
    const matched = pattern.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      const confidence = pattern.confidence * Math.min(1, 0.6 + matched.length * 0.2);
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          intent: pattern.intent,
          confidence,
          suggestedTool: pattern.tool,
          requiresConfirmation: pattern.requiresConfirmation || false,
          matchedKeywords: matched,
        };
      }
    }
  }

  // Extract entities
  const entities = extractEntities(lower);

  return {
    ...bestMatch,
    entities,
    message: lower,
  };
}

/**
 * Extract simple entities from message
 */
function extractEntities(message) {
  const entities = {};

  // Category
  const categories = {
    cleanup: ['cleanup', 'clean up', 'cleaning'],
    plantation: ['plantation', 'tree', 'trees', 'plant'],
    waste_reduction: ['waste', 'plastic', 'reduce'],
    biodiversity: ['biodiversity', 'nature', 'mangrove', 'wildlife'],
    awareness: ['awareness', 'education', 'learn'],
  };
  for (const [cat, kws] of Object.entries(categories)) {
    if (kws.some((kw) => message.includes(kw))) {
      entities.category = cat;
      break;
    }
  }

  // Locations mentioned
  const locations = ['vashi', 'kharghar', 'belapur', 'panvel', 'ulwe', 'airoli', 'nerul', 'seawoods', 'navi mumbai', 'mumbai'];
  for (const loc of locations) {
    if (message.includes(loc)) {
      entities.location = loc;
      break;
    }
  }

  return entities;
}
