const LABELS = [
  {
    prompt: 'outdoor garbage dump',
    aliases: ['garbage pile', 'rubbish heap', 'illegal dumping', 'household trash outdoors'],
    category: 'garbage',
    issue: 'Likely garbage dumping',
    description: 'The attached photograph appears to show mixed garbage or household waste dumped outdoors.',
    actions: ['Record the exact location and time.', 'Keep the original photo as evidence.', 'Report it to the local solid-waste department.'],
  },
  {
    prompt: 'open waste burning',
    aliases: ['burning garbage', 'outdoor flames and smoke', 'trash fire', 'leaves burning'],
    category: 'burning',
    issue: 'Likely open waste burning',
    description: 'The attached photograph appears to show waste or vegetation being burned in the open.',
    actions: ['Move away from the smoke and avoid breathing it.', 'Call the local helpline if burning is happening now.', 'Record the location without confronting anyone.'],
  },
  {
    prompt: 'sewage overflow on a street',
    aliases: ['dirty wastewater', 'blocked drain overflow', 'raw sewage', 'flooded dirty street', 'sewage flowing from an open drain'],
    category: 'sewage',
    issue: 'Likely sewage or drain overflow',
    description: 'The attached photograph appears to show sewage or dirty wastewater overflowing in a public area.',
    actions: ['Avoid contact with the water.', 'Record the exact drain, road, or landmark.', 'Report it to the municipal drainage department.'],
  },
  {
    prompt: 'tree cutting',
    aliases: ['felled tree', 'chainsaw cutting a tree', 'freshly cut tree trunk', 'damaged tree'],
    category: 'trees',
    issue: 'Possible tree cutting or damage',
    description: 'The attached photograph appears to show a tree being cut or damaged.',
    actions: ['Record the exact location and time.', 'Photograph any vehicle or permit board from a safe place.', 'Report active cutting immediately to the tree or forest authority.'],
  },
  {
    prompt: 'dusty construction site',
    aliases: ['uncovered sand and cement', 'building rubble on a road', 'construction debris', 'demolition dust', 'excavated soil dumped beside a road'],
    category: 'construction',
    issue: 'Possible construction material, dust, or debris',
    description: 'The attached photograph appears to show uncovered construction material, dust, or debris affecting a public area.',
    actions: ['Note the site address and contractor board.', 'Keep the photo showing uncovered material or dust.', 'Report it to the municipal ward and pollution-control authority.'],
  },
  {
    prompt: 'illegal land filling with dumped soil and rubble',
    aliases: ['excavation material dumping', 'earth and stones dumped on open land', 'debris filling a wetland', 'soil dumping in a mangrove', 'land reclamation with construction rubble'],
    category: 'greenspace',
    issue: 'Possible land filling or excavation-material dumping',
    description: 'The attached photograph appears to show soil, rubble, or excavation material dumped on or used to fill open land.',
    actions: ['Record the exact location and nearby water, wetland, or mangrove boundary.', 'Safely photograph vehicle numbers or contractor boards if visible.', 'Report it to the local planning authority and, near wetlands or mangroves, the forest/environment department.'],
  },
  {
    prompt: 'polluted river or lake',
    aliases: ['foam on dirty water', 'trash floating in water', 'contaminated river', 'polluted open drain or naala', 'black water in a drainage canal', 'garbage-filled stormwater drain'],
    category: 'water',
    issue: 'Possible water pollution',
    description: 'The attached photograph appears to show visible pollution or waste in a water body.',
    actions: ['Do not touch or enter the water.', 'Record the exact bank, bridge, or outlet location.', 'Report it to the local authority and state pollution board.'],
  },
  {
    prompt: 'plastic litter',
    aliases: ['plastic bottles on the ground', 'plastic bags and wrappers', 'plastic waste dump', 'littered plastic'],
    category: 'plastic',
    issue: 'Likely plastic litter or dumping',
    description: 'The attached photograph appears to show plastic litter or dumped plastic waste outdoors.',
    actions: ['Record the exact location.', 'Keep the original photo as evidence.', 'Report it to the local solid-waste department.'],
  },
  {
    prompt: 'scrap yard with discarded machinery',
    aliases: ['junkyard', 'scrap metal pile', 'discarded appliances', 'industrial waste dump'],
    category: 'industrial',
    issue: 'Possible scrap or industrial-waste dumping',
    description: 'The attached photograph appears to show a large outdoor pile of scrap, machinery, appliances, or other industrial waste.',
    actions: ['Record the exact location and visible facility name.', 'Keep the original photograph as evidence.', 'Report it to the local authority and state pollution-control board.'],
  },
  {
    prompt: 'factory chimney smoke',
    aliases: ['black smoke from a smokestack', 'industrial air pollution', 'factory emissions in the sky', 'smoky chimney'],
    category: 'air',
    issue: 'Possible industrial air emission',
    description: 'The attached photograph appears to show visible smoke or emissions from an industrial source.',
    actions: ['Avoid the plume and stay upwind.', 'Record the facility name and time if safely visible.', 'Report it to the state pollution-control board.'],
  },
  {
    prompt: 'a vehicle parked across and blocking a public road',
    aliases: ['illegal parking blocking traffic', 'a car parked on and blocking a footpath', 'double parked vehicle obstructing a street', 'truck blocking a road', 'vehicle blocking an entrance'],
    category: 'road_obstruction',
    issue: 'Possible road or footpath obstruction by a parked vehicle',
    description: 'The attached photograph appears to show a parked vehicle obstructing a public road, entrance, cycle lane, or footpath.',
    actions: ['Record the exact location, date, and time.', 'Safely retain a clear photo of the obstruction and vehicle number.', 'Report it to the local traffic police; call emergency services only if it creates immediate danger.'],
  },
  {
    prompt: 'clean normal outdoor scene',
    aliases: ['clean street', 'clean park', 'normal building or monument', 'outdoor scene with no pollution'],
    category: 'none',
    issue: 'No clear environmental issue detected',
    description: 'No specific environmental violation can be identified confidently from this photograph.',
    actions: [],
  },
];

export const photoPrompts = LABELS.flatMap(entry => [entry.prompt, ...entry.aliases]);

// Each category gets its strongest matching phrase. Extra aliases must not
// multiply a category's weight, and a note is only a tie-breaker.
export function rankPhotoCategories(results, hintedCategory) {
  const scores = new Map();
  for (const { label, score } of results) {
    if (Number.isFinite(score) && score > (scores.get(label) ?? 0)) scores.set(label, score);
  }
  const ranked = LABELS.map(entry => {
    let matchedPrompt = entry.prompt;
    for (const alias of entry.aliases) {
      if ((scores.get(alias) ?? 0) > (scores.get(matchedPrompt) ?? 0)) matchedPrompt = alias;
    }
    return { entry, matchedPrompt, score: scores.get(matchedPrompt) ?? 0 };
  });
  const total = ranked.reduce((sum, item) => sum + item.score, 0) || 1;
  return ranked.map(item => {
    const score = item.score / total;
    return { ...item, score, adjustedScore: score + (item.entry.category === hintedCategory ? 0.04 : 0) };
  }).sort((a, b) => b.adjustedScore - a.adjustedScore || b.score - a.score);
}
