const seed = process.argv[2] || '2';
(async () => {
  // route fetches for relative paths to the running local server
  if (!globalThis.__patchedFetch) {
    const orig = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = typeof input === 'string' && input.startsWith('/') ? `http://localhost:3000${input}` : input;
      return orig(url, init);
    };
    globalThis.__patchedFetch = true;
  }

  const { loadMovieData } = await import('../src/services/dataService.js');
  const { recommendCollaborative } = await import('../src/services/recommender.js');

  const data = await loadMovieData();
  const stats = data.stats;
  console.log('Movies:', stats.movies.length);
  const results = recommendCollaborative([seed], stats, 50);
  console.log(`Top collaborative recommendations for seed ${seed}:`);
  for (const r of results) {
    console.log(`${r.id} | ${r.title} | score=${(r.recommendationScore ?? 0).toFixed(4)} | sim=${(r.simScore ?? 0).toFixed(4)} | pop=${(r.popularityScore ?? 0).toFixed(4)} | rawColl=${(r.rawColl ?? 0).toFixed(2)}`);
  }
})();
