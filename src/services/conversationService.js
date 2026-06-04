// In-memory session store with 30-minute TTL per user
const sessions = new Map();
const activeConversations = new Map();
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

const getActiveConversation = (userId) => {
  const conversation = activeConversations.get(userId);
  if (!conversation) return null;
  if (Date.now() - conversation.updatedAt > SESSION_TTL_MS) {
    activeConversations.delete(userId);
    return null;
  }
  return conversation;
};

const markConversationActive = (userId, metadata = {}) => {
  const existing = activeConversations.get(userId) || {};
  activeConversations.set(userId, {
    ...existing,
    ...metadata,
    startedAt: existing.startedAt || Date.now(),
    updatedAt: Date.now(),
  });
};

const clearActiveConversation = (userId) => {
  activeConversations.delete(userId);
};

module.exports = {
  getSession,
  setSession,
  clearSession,
  getActiveConversation,
  markConversationActive,
  clearActiveConversation,
};
