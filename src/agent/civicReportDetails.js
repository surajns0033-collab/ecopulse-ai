// Keep the original observation when the model omits a field or returns an invalid value.
function modelText(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function observedLocality(message, city, candidate) {
  const locality = modelText(candidate, 120);
  if (!locality || /unknown|not specified/i.test(locality)) return city;
  if (!message.toLowerCase().includes(locality.toLowerCase())) return city;
  const cityName = city.split(',')[0].trim().toLowerCase();
  return locality.toLowerCase().includes(cityName) ? locality : `${locality}, ${city}`;
}

export function reportFields(message, city, title, structured) {
  return {
    title: modelText(structured?.title, 120) || title,
    description: modelText(structured?.description, 600) || message.trim(),
    location: observedLocality(message, city, structured?.locality),
  };
}

function forestContact(recipient, preview) {
  const { forestEmail, forestHelpline } = recipient;
  if (forestEmail) {
    const label = preview ? 'Forest / Tree Protection Cell CC' : 'Forest / Tree Protection Cell';
    return `🌿 **${label}:** ${forestEmail}${forestHelpline ? ` (Helpline: ${forestHelpline})` : ''}`;
  }
  if (preview && forestHelpline) return `🌿 **State Forest Helpline (24/7):** ${forestHelpline}`;
  return null;
}

export function reportContacts(recipient, forest, preview) {
  const heading = preview ? `🏛️ **Where to complain:** ${recipient.organization}` : `🏛️ **${recipient.organization}**`;
  return [
    heading,
    recipient.email?.includes('@') && `📧 Email: ${recipient.email}`,
    recipient.helpline && `📞 Helpline: ${recipient.helpline}`,
    recipient.whatsapp && `💬 WhatsApp: ${recipient.whatsapp}`,
    recipient.portalUrl && `🌐 Portal: ${recipient.portalUrl}`,
    recipient.sourceUrl && `[Official contact listing](${recipient.sourceUrl})`,
    forest && forestContact(recipient, preview),
  ].filter(Boolean).join('\n');
}

export function reportUrgency(recipient, forest, preview) {
  const phone = /emergency only/i.test(recipient.helpline) ? null : (recipient.helpline || (forest && recipient.forestHelpline));
  if (phone) return preview
    ? `🚨 **Happening right now?** Call **${phone}** so the responsible local team can inspect it.`
    : `If it's happening right now, call **${phone}** first so the responsible team can inspect.`;
  if (recipient.jurisdiction !== 'india') return preview
    ? '🚨 Verify the correct emergency number on the local government or police website; none is guessed here.'
    : 'Verify the emergency number for this location with local authorities.';
  return preview
    ? '🚨 If there is fire, a hazardous leak, or immediate danger to life, call **112**; otherwise review the written complaint below.'
    : 'If there is fire or immediate danger to life, call **112**; otherwise use the official portal for a tracked complaint.';
}

export function emailPreviewData(recipient, location, { subject, body }, { cc = null, ccLabel = null, disclaimer = recipient.disclaimer } = {}) {
  return {
    to: recipient.email, recipientName: recipient.name, organization: recipient.organization,
    location, cc, ccLabel, portalUrl: recipient.portalUrl, sourceUrl: recipient.sourceUrl,
    helpline: recipient.helpline, subject, body, disclaimer,
  };
}
