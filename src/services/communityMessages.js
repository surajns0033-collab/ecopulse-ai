function messageTime({ createdAt }) {
  if (Number.isFinite(createdAt?.seconds)) {
    return createdAt.seconds * 1000 + (createdAt.nanoseconds || 0) / 1e6;
  }
  const time = typeof createdAt === 'number' ? createdAt : createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  return Number.isFinite(time) ? time : 0;
}

export function communityMessageKey(post) {
  return post.id || `${post.userId || ''}:${messageTime(post)}:${post.text || post.description || ''}`;
}

// The shared feed fetches the newest window first. Display that same window
// oldest first here, including posts inserted before the live snapshot arrives.
export function orderCommunityMessages(posts) {
  const unique = new Map();
  for (const post of posts || []) {
    const key = communityMessageKey(post);
    if (!unique.has(key)) unique.set(key, post);
  }
  return [...unique.values()].sort((a, b) => messageTime(a) - messageTime(b) ||
    communityMessageKey(a).localeCompare(communityMessageKey(b)));
}
