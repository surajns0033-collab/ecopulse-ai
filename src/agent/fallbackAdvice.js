export function environmentalAdvice(lower) {
  // 6. Practical environmental knowledge that does not require live data or a
  // model. These are intentionally general, safe actions—not invented local facts.
  if (/\b(electricity|energy|power bill|bijli|geyser|air conditioner|\bac\b)\b/i.test(lower)) {
    return {
      text: `⚡ **Practical ways to cut home electricity use:**\n\n• Set the AC around **24–26°C**, clean its filter, and keep doors/windows shut while it runs.\n• Use a timer for the **geyser** and switch it off after heating.\n• Replace frequently used bulbs with **LEDs**.\n• Turn off lights, chargers, TVs and set-top boxes at the socket when not needed.\n• Run washing machines only with a useful load and use fans before AC when comfortable.\n\nStart by checking which appliance runs longest—that usually gives the easiest saving.`,
      cards: [], actions: [], status: 'success',
    };
  }

  if (/\b(save water|water saving|conserve water|paani bach|water waste|leaking tap)\b/i.test(lower)) {
    return {
      text: `💧 **Simple water-saving steps:**\n\n• Repair dripping taps and running toilet cisterns first.\n• Use a bucket or shut the tap while brushing/soaping instead of letting water run.\n• Run laundry only with a useful load.\n• Reuse safe grey water (for example, vegetable-rinse water) for plants or cleaning—never water containing harsh chemicals.\n• Water plants early morning/evening and mulch the soil to slow evaporation.`,
      cards: [], actions: [], status: 'success',
    };
  }

  if (/\b(compost|composting|kitchen scraps?|food scraps?)\b/i.test(lower)) {
    return {
      text: `🌱 **Easy home composting:**\n\n1. Add fruit/vegetable scraps, tea leaves and crushed eggshells.\n2. Cover each wet layer with dry leaves, shredded cardboard or cocopeat.\n3. Keep it damp like a squeezed sponge—not soggy—and mix it every few days.\n4. Avoid meat, dairy, oily food and pet waste in a basic home bin.\n5. A bad smell usually means too much moisture: add dry material and aerate.`,
      cards: [], actions: [], status: 'success',
    };
  }

  if (/\b(e-?waste|electronic waste|old phone|old laptop|battery disposal)\b/i.test(lower)) {
    return {
      text: `🔋 **Handle e-waste safely:**\n\n• Back up and erase personal data; remove SIM/memory cards.\n• Keep batteries separate—never burn them or put swollen batteries in household waste.\n• Use an **authorised producer take-back point, municipal e-waste centre, or registered recycler**.\n• Ask for a receipt for valuable devices or bulk disposal.\n\nTell me your city and I’ll look for a verified municipal route without guessing a recycler.`,
      cards: [], actions: [{ label: '📇 Authority Contacts', action: 'QUICK_ALL_CONTACTS', variant: 'secondary' }], status: 'success',
    };
  }

  if (/\b(climate change|global warming|carbon footprint|co2|greenhouse)\b/i.test(lower)) {
    return {
      text: `🌍 **For a lower everyday footprint, focus on the big repeat choices:**\n\n• Walk, cycle, use public transport or carpool when practical.\n• Reduce unnecessary AC use and choose efficient appliances.\n• Eat food you buy—preventing waste matters more than perfect packaging.\n• Repair/reuse items and avoid frequent low-quality replacements.\n• Support local tree and habitat protection, but don’t treat planting as a substitute for reducing emissions.`,
      cards: [], actions: [], status: 'success',
    };
  }

  if (/\b(indoor air|ventilation|mould|mold|cooking smoke|room pollution)\b/i.test(lower)) {
    return {
      text: `🏠 **For healthier indoor air:**\n\n• Vent cooking fumes outdoors with an exhaust fan/window.\n• Never burn waste, incense in excess, or charcoal in an unventilated room.\n• Fix dampness and visible mould at the moisture source; don’t just paint over it.\n• Vacuum/wet-dust regularly and keep smoking outdoors.\n• During a severe outdoor pollution episode, keep windows shut at peak hours and use a genuine HEPA purifier if available.`,
      cards: [], actions: [], status: 'success',
    };
  }

  return null;
}
