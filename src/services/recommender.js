import { canonical } from "../utils/movieUtils.js";

export function buildStats(movies, actions = []) {
  const ranges = buildRanges(movies);
  const byMovie = new Map();
  const scored = movies.map((movie) => {
    const featureVector = buildFeatureVector(movie, ranges);
    const popularityScore = popularityFor(movie, ranges);
    const enriched = { ...movie, featureVector, popularityScore };
    byMovie.set(movie.id, enriched);
    return enriched;
  });

  const interactionData = buildInteractionData(actions, scored);

  return {
    movies: scored,
    byMovie,
    interactionData,
    ranges,
    strategy: "Hybrid content similarity using Genre, Director, Country, Certificate, release decade, runtime, budget, box office, nominations, and Oscar wins. Popularity is derived from box office and awards because no ratings or user interaction CSV exists."
  };
}

export function topPopular(movies, limit = 18) {
  return [...movies]
    .sort((a, b) => b.popularityScore - a.popularityScore || Number(b.year || 0) - Number(a.year || 0) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export function recommendForMovie(movieId, stats, limit = 10) {
  const base = stats.byMovie.get(String(movieId));
  if (!base) return topPopular(stats.movies, limit);

  // Recommendation strategy: this dataset has movie metadata and poster URLs, but no explicit user ratings.
  // Item similarity is combined with popularity to suggest movies that feel both relevant and discoverable.
  return stats.movies
    .filter((movie) => movie.id !== base.id)
    .map((movie) => {
      const similarity = cosine(base.featureVector, movie.featureVector);
      const recommendationScore = similarity * 0.86 + movie.popularityScore * 0.14;
      return { ...movie, recommendationScore, similarityScore: similarity };
    })
    .sort((a, b) => b.recommendationScore - a.recommendationScore || b.popularityScore - a.popularityScore)
    .slice(0, limit);
}

export function recommendCollaborative(movieIds, stats, limit = 10, syntheticUser = null) {
  const seeds = movieIds.map((id) => String(id)).filter(Boolean);
  // If running in browser and no syntheticUser supplied, try to read local watched items
  if (!syntheticUser && typeof window !== 'undefined') {
    try {
      const key = Object.keys(localStorage).find((k) => k.startsWith('primeflix:watched'));
      if (key) {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        const map = {};
        for (const item of arr) map[String(item.movieId)] = 1;
        syntheticUser = map;
      }
    } catch (e) {
      syntheticUser = null;
    }
  }
  if (!seeds.length) return topPopular(stats.movies, limit);

  // Gather collaborative co-occurrence scores from interaction data
  const usersMap = stats?.interactionData?.users;
  const collRaw = new Map();
  if (usersMap && usersMap.size) {
    for (const [userId, userRatings] of usersMap.entries()) {
      let seedStrength = 0;
      for (const seedId of seeds) seedStrength += userRatings.get(seedId) || 0;
      if (seedStrength <= 0) continue;
      for (const [movieId, rating] of userRatings.entries()) {
        if (seeds.includes(movieId)) continue;
        collRaw.set(movieId, (collRaw.get(movieId) || 0) + seedStrength * rating);
      }
    }
  }

  const maxColl = Math.max(0, ...Array.from(collRaw.values()));

  // If a syntheticUser (client local watched) is provided, inject a pseudo-collaborative signal
  if (syntheticUser) {
    let seedStrength = 0;
    for (const seedId of seeds) seedStrength += syntheticUser[seedId] || 0;
    if (seedStrength > 0) {
      // compute average seed vector
      const seedVectors = seeds.map((id) => stats.byMovie.get(String(id))?.featureVector).filter(Boolean);
      let avgSeed = null;
      if (seedVectors.length) {
        avgSeed = new Map(seedVectors[0].entries());
        for (let i = 1; i < seedVectors.length; i++) {
          const v = seedVectors[i];
          for (const [key, value] of v.entries()) {
            avgSeed.set(key, (avgSeed.get(key) || 0) + value);
          }
        }
        for (const [key, value] of avgSeed.entries()) {
          avgSeed.set(key, value / seedVectors.length);
        }
      }

      for (const candidate of stats.movies) {
        const cid = String(candidate.id);
        if (seeds.includes(cid)) continue;
        const candSim = avgSeed ? cosine(avgSeed, candidate.featureVector) : 0;
        const userRating = syntheticUser[cid] || candSim;
        // multiplier to ensure local user has strong influence
        collRaw.set(cid, (collRaw.get(cid) || 0) + seedStrength * userRating * 5);
      }
    }
  }

  // For each candidate compute a combined score: collaborative (normalized) + content similarity + small popularity prior
  const collWeight = 0.8;
  const simWeight = 0.18;
  const popWeight = 0.02;

  const seedVectors = seeds.map((id) => stats.byMovie.get(String(id))?.featureVector).filter(Boolean);

  const candidates = stats.movies.filter((m) => !seeds.includes(String(m.id)));
  const scored = candidates.map((candidate) => {
    const collScoreRaw = collRaw.get(String(candidate.id)) || 0;
    const collScore = maxColl > 0 ? collScoreRaw / maxColl : 0;

    // average cosine similarity to seeds
    let simScore = 0;
    if (seedVectors.length) {
      let total = 0;
      for (const vec of seedVectors) total += cosine(vec, candidate.featureVector);
      simScore = total / seedVectors.length;
    }

    const popScore = candidate.popularityScore || 0;

    const finalScore = collWeight * collScore + simWeight * simScore + popWeight * popScore;
    return { ...candidate, recommendationScore: finalScore, rawColl: collScoreRaw, simScore };
  });

  const results = scored.sort((a, b) => b.recommendationScore - a.recommendationScore || b.popularityScore - a.popularityScore).slice(0, limit);
  return results.length ? results : topPopular(stats.movies, limit);
}

export function recommendForHistory(movieIds, stats, limit = 10) {
  const validSeeds = movieIds
    .map((id) => stats.byMovie.get(String(id)))
    .filter(Boolean);
  if (!validSeeds.length) return topPopular(stats.movies, limit);

  const candidateScores = new Map();
  for (const candidate of stats.movies) {
    if (validSeeds.some((seed) => seed.id === candidate.id)) continue;
    let totalSimilarity = 0;
    for (const seed of validSeeds) {
      totalSimilarity += cosine(seed.featureVector, candidate.featureVector);
    }
    const averageSimilarity = totalSimilarity / validSeeds.length;
    const recommendationScore = averageSimilarity * 0.78 + candidate.popularityScore * 0.22;
    candidateScores.set(candidate.id, { movie: candidate, recommendationScore });
  }

  return [...candidateScores.values()]
    .map(({ movie, recommendationScore }) => ({ ...movie, recommendationScore }))
    .sort((a, b) => b.recommendationScore - a.recommendationScore || b.popularityScore - a.popularityScore)
    .slice(0, limit);
}

export function groupByGenre(movies, limitPerGenre = 18) {
  const groups = new Map();
  for (const movie of movies) {
    const genre = movie.genres[0] || "Movies";
    if (!groups.has(genre)) groups.set(genre, []);
    groups.get(genre).push(movie);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([genre, items]) => ({ genre, movies: topPopular(items, limitPerGenre) }));
}

function buildFeatureVector(movie, ranges) {
  const vector = new Map();
  for (const genre of movie.genres) set(vector, `genre:${canonical(genre)}`, 5);
  if (movie.director) set(vector, `director:${canonical(movie.director)}`, 3.2);
  if (movie.country) set(vector, `country:${canonical(movie.country)}`, 1.6);
  if (movie.certificate) set(vector, `certificate:${canonical(movie.certificate)}`, 1.2);
  if (movie.year) set(vector, `decade:${Math.floor(Number(movie.year) / 10) * 10}`, 1.4);
  if (movie.runtime) set(vector, `runtime:${Math.round(movie.runtime / 20) * 20}`, 1);

  set(vector, "numeric:year", normalize(Number(movie.year || 0), ranges.minYear, ranges.maxYear) * 0.9);
  set(vector, "numeric:runtime", normalize(movie.runtime, ranges.minRuntime, ranges.maxRuntime) * 0.8);
  set(vector, "numeric:budget", logNormalize(movie.budget, ranges.maxBudget) * 0.7);
  set(vector, "numeric:boxOffice", logNormalize(movie.boxOffice, ranges.maxBoxOffice) * 0.7);
  set(vector, "numeric:awards", normalize(movie.nominations + movie.oscarWins * 4, 0, ranges.maxAwards) * 1.1);
  return vector;
}

function popularityFor(movie, ranges) {
  const boxOffice = logNormalize(movie.boxOffice, ranges.maxBoxOffice);
  const awards = normalize(movie.nominations + movie.oscarWins * 4, 0, ranges.maxAwards);
  const roi = movie.budget > 0 ? normalize(movie.boxOffice / movie.budget, 0, ranges.maxRoi) : 0;
  const recency = normalize(Number(movie.year || 0), ranges.minYear, ranges.maxYear);
  return boxOffice * 0.62 + awards * 0.22 + roi * 0.1 + recency * 0.06;
}

function buildInteractionData(actions, movies) {
  const movieIds = new Set(movies.map((movie) => movie.id));
  const users = new Map();

  for (const action of actions) {
    if (!movieIds.has(action.movieId)) continue;
    const rating = Math.max(0, Math.min(5, action.rating || (action.action === "liked" ? 4 : action.action === "watched" ? 3 : 2)));
    if (!rating) continue;

    if (!users.has(action.userId)) {
      users.set(action.userId, new Map());
    }
    const userRatings = users.get(action.userId);
    const existing = userRatings.get(action.movieId) || 0;
    userRatings.set(action.movieId, Math.max(existing, rating));
  }

  return { users };
}

function buildRanges(movies) {
  const years = movies.map((movie) => Number(movie.year)).filter(Boolean);
  const runtimes = movies.map((movie) => movie.runtime).filter(Boolean);
  const maxBudget = Math.max(1, ...movies.map((movie) => movie.budget));
  const maxBoxOffice = Math.max(1, ...movies.map((movie) => movie.boxOffice));
  const maxAwards = Math.max(1, ...movies.map((movie) => movie.nominations + movie.oscarWins * 4));
  const maxRoi = Math.max(1, ...movies.map((movie) => movie.budget > 0 ? movie.boxOffice / movie.budget : 0));
  return {
    minYear: Math.min(...years),
    maxYear: Math.max(...years),
    minRuntime: Math.min(...runtimes),
    maxRuntime: Math.max(...runtimes),
    maxBudget,
    maxBoxOffice,
    maxAwards,
    maxRoi
  };
}

function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const value of a.values()) normA += value * value;
  for (const value of b.values()) normB += value * value;
  for (const [key, value] of a.entries()) {
    if (b.has(key)) dot += value * b.get(key);
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function set(vector, key, value) {
  if (!key || !Number.isFinite(value) || value <= 0) return;
  vector.set(key, (vector.get(key) || 0) + value);
}

function normalize(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function logNormalize(value, max) {
  if (!value || !max) return 0;
  return Math.log1p(value) / Math.log1p(max);
}
