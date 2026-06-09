const WATCHED_KEY = "primeflix:watched";
const WATCHLIST_KEY = "primeflix:watchlist";
let storageScope = "dataset";

export function setStorageScope(scope) {
  storageScope = `${scope || "dataset"}`.toLowerCase().replace(/[^a-z0-9]+/g, ":");
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(scopedKey(key)) || "[]");
  } catch {
    return [];
  }
}

function write(key, value) {
  localStorage.setItem(scopedKey(key), JSON.stringify(value));
}

function scopedKey(key) {
  return `${key}:${storageScope}`;
}

export function getWatched() {
  return read(WATCHED_KEY);
}

export function markWatched(movieId) {
  const now = Date.now();
  const watched = getWatched().filter((item) => item.movieId !== movieId);
  watched.unshift({ movieId, watchedAt: now });
  write(WATCHED_KEY, watched.slice(0, 40));
}

export function isWatched(movieId) {
  return getWatched().some((item) => item.movieId === movieId);
}

export function getWatchlist() {
  return read(WATCHLIST_KEY);
}

export function toggleWatchlist(movieId) {
  const current = getWatchlist();
  const exists = current.includes(movieId);
  const next = exists ? current.filter((id) => id !== movieId) : [movieId, ...current];
  write(WATCHLIST_KEY, next);
  return !exists;
}

export function inWatchlist(movieId) {
  return getWatchlist().includes(movieId);
}
