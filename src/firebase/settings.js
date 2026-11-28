/** @param {Record<string, unknown>} env */
export function firebaseSettings(env) {
  const fields = {
    apiKey: 'VITE_FIREBASE_API_KEY', authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID', storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID', appId: 'VITE_FIREBASE_APP_ID',
  };
  /** @param {string} name */
  function setting(name) {
    const value = env[name];
    return typeof value === 'string' ? value.trim() : '';
  }
  const config = Object.fromEntries(Object.entries(fields).map(([key, name]) => [key, setting(name)]));
  if (Object.values(config).some(value => !value || /^(?:your_|demo-)|replace_with/i.test(value))) return null;
  if (!/^\d+$/.test(config.messagingSenderId) || !config.appId.startsWith('1:' + config.messagingSenderId + ':web:')) return null;
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(config.authDomain)) return null;
  if (config.authDomain.endsWith('.firebaseapp.com') && config.authDomain !== config.projectId + '.firebaseapp.com') return null;
  return config;
}
