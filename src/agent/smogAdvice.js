export function exposureAdvice(aqi, { routine, vulnerable }) {
  let advice = 'Follow local guidance and avoid visible smoke and idling traffic.';
  if (aqi == null) advice = 'Check a fresh AQI reading before strenuous outdoor activity.';
  else if (aqi >= 301) advice = 'Stay in a cleaner indoor space if possible, postpone non-essential trips, and follow local emergency guidance.';
  else if (aqi >= 201) advice = 'Avoid outdoor exertion and reschedule optional outdoor work. Use a cleaner indoor space when possible.';
  else if (aqi >= 151) advice = 'Move strenuous exercise indoors and shorten non-essential outdoor tasks.';
  else if (aqi >= 101) advice = 'Shorten prolonged outdoor exertion, especially near traffic.';
  if (aqi >= 151) advice += ' For adults who can wear one safely, a well-fitting N95/FFP2 can reduce particle exposure on unavoidable trips.';

  if (vulnerable.length && (aqi == null || aqi >= 51)) {
    advice += ' For household members you flagged as sensitive, plan shorter outdoor activity and have a cleaner indoor alternative ready.';
  }
  if (routine === 'outdoor work' && (aqi == null || aqi >= 101)) advice += ' If you work outside, take breaks in a cleaner indoor space when possible.';
  if (routine === 'office/school' && aqi >= 101) advice += ' For unavoidable office or school trips, recheck AQI before both legs and choose indoor exercise or play.';
  return advice;
}

export function commuteAdvice(commute, aqi) {
  switch (commute) {
    case 'car': return 'Bundle errands, carpool when practical, and turn off the engine when parked.';
    case 'two-wheeler': {
      const travel = aqi >= 151 ? 'Use metro/train/bus for the longest leg today if practical. ' : '';
      return travel + 'Group stops to avoid repeat trips, switch off the engine when parked, and avoid waiting behind buses and trucks.';
    }
    case 'walk/cycle': return aqi >= 151
      ? 'Avoid strenuous roadside exercise today; use transit for the polluted segment if practical.'
      : 'Use quieter internal streets, and check current AQI before longer or strenuous trips.';
    case 'work from home': return 'Keep the avoided commute benefit by grouping necessary errands.';
    case 'public transport': return 'Keep the long leg on transit and reach it through quieter internal streets.';
    default: return 'Choose transit or carpool where practical, and avoid idling; no commute mode was assumed.';
  }
}

const INDOOR_SETUP = {
  'HEPA purifier': 'Run HEPA in one cleaner-air room, keep airflow clear, damp-clean, and avoid ozone/ionizer modes.',
  'DIY filtered-air setup': 'Keep your existing filtered-air setup unobstructed and follow its safe operating instructions. Damp-clean surfaces to reduce dust.',
};

export function indoorAirAdvice(filtration, aqi) {
  const setup = INDOOR_SETUP[filtration] ?? 'Create one cleaner-air room, damp-clean instead of dry sweeping, and avoid burning incense or candles during smog.';
  const ventilation = aqi >= 151
    ? 'If safe, keep windows closed while outdoor air is poor. Air out when it improves; never block exhaust vents.'
    : 'Check outdoor air before opening windows and ventilate when it is cleaner.';
  return `${setup} ${ventilation}`;
}

export function cookingAdvice(fuel, noVentedHood = false) {
  if (noVentedHood) return [
    'Cover pots with a lid when practical and prefer lower-smoke cooking such as simmering. Ventilate when outdoor air improves. Keep combustion vents clear.',
    'Less frying creates fewer cooking particles. Covering a pot can shorten cooking time and energy use.',
  ];
  if (fuel === 'gas stove') return [
    'If available, use an exhaust hood that vents outdoors while the gas stove runs. Cover the pot when boiling water to shorten burner time.',
    'Venting carries cooking pollutants outside. A shorter burner time uses less gas and reduces combustion emissions.',
  ];
  if (fuel === 'induction/electric') return [
    'If available, use a vented hood when frying or cooking at high heat, even on an electric hob.',
    'Induction avoids gas combustion at the stove. A vented hood removes particles produced by cooking the food.',
  ];
  return [
    'Use lids when practical and run a hood that vents outdoors if one is available.',
    'A lid can shorten cooking time. Removing cooking fumes lowers exposure in the kitchen.',
  ];
}

export function communityAdvice(setting, aqi) {
  if (setting === 'school') return [
    aqi >= 151 ? 'Move outdoor assembly and strenuous sports indoors while readings remain unhealthy. Ask drivers to switch off engines at the school gate.'
      : 'Check a fresh AQI reading before school assembly or sports. Ask drivers to switch off engines at the school gate.',
    'Moving activities indoors can reduce exposure. Switching off waiting vehicles cuts emissions near pupils.',
  ];
  if (setting === 'neighbourhood') return [
    'Coordinate shared trips with neighbours, ask drivers to avoid idling at the gate, and arrange collection or composting for garden waste.',
    'Sharing a trip can remove one vehicle journey. Keeping leaves out of open fires prevents smoke at its source.',
  ];
  return [
    'Avoid burning leaves or waste, discourage idling, and report recurring smoke or dust with a location and observation.',
    'Avoiding burning and idling cuts emissions at the source.',
  ];
}
