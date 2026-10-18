const USERS_KEY = 'deshiRailUsers';
const CURRENT_KEY = 'deshiRailCurrentUser';
const PROGRESS_PREFIX = 'deshiRailProgress';

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (e) {
    /* ignore */
  }
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setCurrentUser(user) {
  try {
    if (user) localStorage.setItem(CURRENT_KEY, JSON.stringify(user));
    else localStorage.removeItem(CURRENT_KEY);
  } catch (e) {
    /* ignore */
  }
}

export function login(username) {
  if (!username || !username.trim()) throw new Error('Username required');
  const name = username.trim();
  const users = loadUsers();
  if (!users[name]) {
    users[name] = { username: name, createdAt: Date.now() };
    saveUsers(users);
  }
  const user = { username: name };
  setCurrentUser(user);
  return user;
}

export function logout() {
  setCurrentUser(null);
}

export function progressKey(username) {
  return `${PROGRESS_PREFIX}:${username}`;
}

export function saveProgress(username, data) {
  try {
    localStorage.setItem(progressKey(username), JSON.stringify({
      savedAt: Date.now(),
      data,
    }));
  } catch (e) {
    /* ignore */
  }
}

export function loadProgress(username) {
  try {
    const raw = localStorage.getItem(progressKey(username));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.data || null;
  } catch (e) {
    return null;
  }
}

export function clearProgress(username) {
  try {
    localStorage.removeItem(progressKey(username));
  } catch (e) {
    /* ignore */
  }
}
