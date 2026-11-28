import { recognitionText } from './chatLanguage.js';

const NAMED_SMOG_PLAN = /\b(?:smog (?:action )?plan|(?:clean[ -]air|cleaner[ -]air|indoor[ -]air|personali[sz]ed air) (?:action )?plan|low[ -]emission (?:daily )?routine)\b|(?:स्मॉग|धुंध).{0,20}(?:योजना|प्लान)/iu;

const PLAN_FOR_SMOG = /\b(?:plan|routine)\s+(?:for|during|around)\s+(?:(?:the|a|severe|heavy|winter|urban|local)\s+)*(?:smog|air pollution)\b/i;
const AIR_TOPIC = /\b(?:smog|air pollution|polluted air|indoor air quality|pradushan)\b|स्मॉग|प्रदूषण/i;
const DAILY_SETTING = /\b(?:home|household|family|families|kids|children|grandparents?|school|commut(?:e|er)|community|neighbou?rhood|housing society|kitchen|cooking|cycl(?:e|ing|ist)|scooter|deliver(?:y|ies)?|outdoor(?:s| shift| work)?|delivery|street vendor|ghar)\b|घर/iu;
const PRACTICAL_ADVICE = /\b(?:reduce|lower|limit|cut|improve)\b[^.!?;\n]{0,45}\b(?:exposure|emissions|indoor air|kitchen air)\b|\bkeep\b[^.!?;\n]{0,35}\b(?:air|kitchen)\b[^.!?;\n]{0,15}\bclean(?:er)?\b|\bclean[ -]air routine\b/i;
const INDOOR_ADVICE_HI = /\bghar (?:ki|ki andar ki|mein) hawa\b.{0,25}\b(?:saaf|behtar)\b|घर की हवा.{0,25}(?:साफ़?|बेहतर)/iu;

const REDUCE_EXPOSURE_HI = /\b(?:exposure|emissions?)\b.{0,24}\b(?:kam|ghata)\b|(?:संपर्क|उत्सर्जन).{0,25}कम/iu;

const PUBLIC_PLAN = /\b(?:official|government(?:['’]s)?|municipal|sarkaa?ri|sarkaa?r (?:ka|ki|ke))\s+(?:(?:official|winter|severe|smog|clean[ -]air|air pollution|action)\s+)*(?:plans?|polic(?:y|ies)|rules?)\b|(?:सरकारी|सरकार (?:का|की|के)|नगर निगम (?:का|की|के))\s+(?:(?:स्मॉग|धुंध|प्रदूषण|कार्य)\s+)*(?:प्लान|योजना|नीति|नियम)/iu;
const ISSUED_PLAN = /\b(?:smog|air pollution|clean[ -]air)\s+(?:action )?plan\s+(?:(?:announced|issued|published|adopted) by|from|of)\s+(?:the )?(?:government|city council|municipality)\b/i;

/** Classify spelling-normalized text before broad air-quality keywords can claim the request.
 * @param {string} text
 * @returns {'policy' | 'household' | null}
 */
export function smogRequestKind(text) {
  const namedPlan = NAMED_SMOG_PLAN.test(text);
  const airTopic = AIR_TOPIC.test(text);
  if ((namedPlan || airTopic) && (PUBLIC_PLAN.test(text) || ISSUED_PLAN.test(text))) return 'policy';
  if (namedPlan) return 'household';
  if (/\b(?:government|official|policy|news)\b/i.test(text)) return null;
  if (PLAN_FOR_SMOG.test(text)) return 'household';
  const practical = PRACTICAL_ADVICE.test(text) || INDOOR_ADVICE_HI.test(text) || REDUCE_EXPOSURE_HI.test(text);
  return airTopic && DAILY_SETTING.test(text) && practical ? 'household' : null;
}

/** @param {string} input */
export function asksForSmogPlan(input) {
  return smogRequestKind(recognitionText(input)) === 'household';
}
