// In-memory session store with 30-minute TTL per user
const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

const getSession = (userId) => {
  const session = sessions.get(userId);
  if (!session) return null;
  if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
    sessions.delete(userId);
    return null;
  }
  return session;
};

const setSession = (userId, state) => {
  sessions.set(userId, { ...state, updatedAt: Date.now() });
};

const clearSession = (userId) => {
  sessions.delete(userId);
};

module.exports = { getSession, setSession, clearSession };
