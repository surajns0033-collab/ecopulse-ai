// A configured account save is acknowledged only after Firestore confirms it.
export async function saveEmailDraft(record, { persist, storage } = {}) {
  if (!record.userId || !record.subject?.trim() || !record.body?.trim()) {
    throw new Error('A user, subject and message are required to save a draft.');
  }
  const draft = { ...record, status: 'draft' };
  if (persist) return { draftId: await persist(draft), localOnly: false };
  const draftId = crypto.randomUUID();
  const key = 'ecopulse_private_draft:' + encodeURIComponent(record.userId) + ':' + draftId;
  (storage ?? localStorage).setItem(key, JSON.stringify({ ...draft, id: draftId, createdAt: new Date().toISOString() }));
  return { draftId, localOnly: true };
}
