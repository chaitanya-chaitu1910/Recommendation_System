import { loadMovieData } from "./services/dataService.js";
import { groupByGenre, recommendCollaborative, recommendForMovie, topPopular } from "./services/recommender.js";
import { backdropFor, posterFor } from "./services/posterService.js";
import { getWatched, getWatchlist, inWatchlist, isWatched, markWatched, setStorageScope, toggleWatchlist } from "./services/storage.js";
import { formatDate, formatMoney, formatRuntime, formatWhole, movieSummary } from "./utils/movieUtils.js";

const app = document.querySelector("#app");
let state = {
  loading: true,
  error: "",
  movies: [],
  stats: null,
  dataset: null,
  query: "",
  selectedGenre: ""
};

loadMovieData()
  .then((data) => {
    state = { ...state, ...data, loading: false };
    setStorageScope(state.dataset?.movieCsv || "detected-dataset");
    render();
  })
  .catch((error) => {
    state.loading = false;
    state.error = error.message;
    render();
  });

window.addEventListener("hashchange", render);

function render() {
  if (state.loading) {
    app.innerHTML = shell(`<main class="loading-screen"><div class="loader"></div><h1>Loading your cinema</h1></main>`);
    return;
  }
  if (state.error) {
    app.innerHTML = shell(emptyData(state.error));
    return;
  }

  const route = location.hash || "#/";
  if (route.startsWith("#/movie/")) {
    renderDetails(decodeURIComponent(route.replace("#/movie/", "")));
  } else if (route === "#/movies") {
    renderCatalog("Movies", state.movies);
  } else if (route === "#/watchlist") {
    const movies = getWatchlist().map((id) => byId(id)).filter(Boolean);
    renderCatalog("Watchlist", movies, "Movies you saved for later.");
  } else if (route === "#/continue") {
    renderCatalog("Continue Watching", watchedMovies(), "Most recently watched movies appear first.");
  } else {
    renderHome();
  }
}

function shell(content) {
  return `
    <header class="topbar">
      <a class="brand" href="#/">PrimeFlix</a>
      <nav>
        <a href="#/">Home</a>
        <a href="#/movies">Movies</a>
        <a href="#/watchlist">Watchlist</a>
        <a href="#/continue">Continue Watching</a>
      </nav>
    </header>
    ${content}
  `;
}

function renderHome() {
  const genres = uniqueGenres(state.movies);
  const popular = topPopular(state.movies, 18);
  const selectedGenre = state.selectedGenre;
  const genreMovies = selectedGenre ? state.movies.filter((movie) => movie.genres.includes(selectedGenre)) : [];
  const genreSeed = genreMovies[0] || state.movies[0];
  const genreRecommendations = selectedGenre && genreMovies.length ? recommendForMovie(genreSeed.id, state.stats, 10) : [];
  const watched = watchedMovies();
  const seed = watched[0] || popular[0] || state.movies[0];
  const syntheticWatched = {};
  for (const w of watched) syntheticWatched[String(w.id)] = 1;
  const collaborativeRecommendations = recommendCollaborative(watched.map((movie) => movie.id), state.stats, 20, syntheticWatched);
  // expose for debugging
  try { window.__lastCollab = collaborativeRecommendations; } catch (e) {}
  const recommendations = selectedGenre && genreMovies.length
    ? collaborativeRecommendations.filter((movie) => movie.genres.includes(selectedGenre)).slice(0, 10).length
      ? collaborativeRecommendations.filter((movie) => movie.genres.includes(selectedGenre)).slice(0, 10)
      : genreRecommendations
    : collaborativeRecommendations.length
      ? collaborativeRecommendations
      : seed ? recommendForMovie(seed.id, state.stats, 10) : [];
  const featured = seed || popular[0];
  const genreRows = groupByGenre(state.movies, 18);

  app.innerHTML = shell(`
    ${hero(featured, recommendations[0])}
    <main class="page">
      ${homeIntro(genres, selectedGenre)}
      ${searchBlock()}
      ${selectedGenre ? movieRow(`Trending in ${escapeHtml(selectedGenre)}`, genreMovies) : ""}
      ${movieRow("Popular Movies", popular)}
      ${watchedRecommendationPanels(watched)}
      ${movieRow("Recommended For You", recommendations)}
      ${movieRow("Continue Watching", watched)}
      ${genreRows.map((group) => movieRow(group.genre, group.movies)).join("")}
    </main>
  `);

  bindGenreSelector(genres);
  bindSearch();
}

function renderCatalog(title, movies, subtitle = "Explore the complete collection.") {
  app.innerHTML = shell(`
    <main class="catalog-page">
      <section class="catalog-head">
        <div>
          <p class="eyebrow">${escapeHtml(state.dataset?.movieCsv || "Dataset")}</p>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        ${searchBlock()}
      </section>
      <section id="catalogResults" class="poster-grid">
        ${movies.length ? movies.map(card).join("") : `<p class="empty-copy">Nothing here yet.</p>`}
      </section>
    </main>
  `);
  bindSearch(movies);
}

function renderDetails(movieId) {
  const movie = byId(movieId);
  if (!movie) {
    app.innerHTML = shell(emptyData("Movie not found in the detected dataset."));
    return;
  }
  const recs = recommendForMovie(movie.id, state.stats, 10);
  const watched = isWatched(movie.id);
  const listed = inWatchlist(movie.id);
  const rating = movie.certificate || "Unrated";
  const description = movieSummary(movie) || "Movie details are unavailable.";

  app.innerHTML = shell(`
    <main class="details">
      <section class="details-hero" style="background-image: linear-gradient(90deg, #05070a 0%, rgba(5,7,10,.84) 38%, rgba(5,7,10,.38) 100%), url('${cssUrl(backdropFor(movie))}')">
        <img class="details-poster" src="${escapeHtml(posterFor(movie))}" alt="${escapeHtml(movie.title)} poster" />
        <div class="details-copy">
          <p class="eyebrow">${escapeHtml(movie.genres.join(" / ") || "Movie")}</p>
          <h1>${escapeHtml(movie.title)}</h1>
          <div class="details-meta">
            <span>${escapeHtml(movie.year || movie.releaseDate || "Year unavailable")}</span>
            <span>${escapeHtml(movie.genres.join(", ") || "Genre unavailable")}</span>
            <span>Rating: ${escapeHtml(rating)}</span>
          </div>
          <p class="overview">${escapeHtml(description)}</p>
          <div class="fact-grid">
            ${fact("Director", movie.director)}
            ${fact("Country", movie.country)}
            ${fact("Runtime", formatRuntime(movie.runtime))}
            ${fact("Budget", formatMoney(movie.budget))}
            ${fact("Box Office", formatMoney(movie.boxOffice))}
            ${fact("Awards", [movie.oscarWins ? `${movie.oscarWins} Oscar wins` : "", movie.nominations ? `${movie.nominations} nominations` : ""].filter(Boolean).join(", ") || "None")}
          </div>
          <div class="actions">
            <button class="primary" id="watchBtn">${watched ? "Watch Again" : "Watch Now"}</button>
            <button class="secondary" id="watchlistBtn">${listed ? "In Watchlist" : "Add to Watchlist"}</button>
          </div>
        </div>
      </section>
      <section class="page details-row">
        ${movieRow("Because you watched this", recs)}
      </section>
    </main>
  `);

  document.querySelector("#watchBtn").addEventListener("click", () => {
    markWatched(movie.id);
    renderDetails(movie.id);
  });
  document.querySelector("#watchlistBtn").addEventListener("click", () => {
    toggleWatchlist(movie.id);
    renderDetails(movie.id);
  });
}

function watchedRecommendationPanels(watched) {
  if (!watched.length) return "";
  const panels = watched.slice(0, 3);
  return `
    <section class="row-section watch-columns">
      <h2>Recommended because you watched</h2>
      <div class="watch-columns-grid">
        ${panels.map((movie) => watchedPanel(movie)).join("")}
      </div>
    </section>
  `;
}

function watchedPanel(movie) {
  const recommendations = recommendForMovie(movie.id, state.stats, 6);
  return `
    <div class="watch-column">
      <div class="watch-column-header">
        <strong>You watched ${escapeHtml(movie.title)}</strong>
        <span>Recommended because you watched this</span>
      </div>
      <div class="watch-column-row">
        ${recommendations.map((rec) => smallCard(rec)).join("")}
      </div>
    </div>
  `;
}

function smallCard(movie) {
  return `
    <a class="movie-card small-card" href="#/movie/${encodeURIComponent(movie.id)}" title="${escapeHtml(movie.title)}">
      <img src="${escapeHtml(posterFor(movie))}" alt="${escapeHtml(movie.title)} poster" loading="lazy" />
      <div class="card-copy">
        <strong>${escapeHtml(movie.title)}</strong>
        <span>${escapeHtml(movie.genres[0] || movie.director || "Movie")}</span>
      </div>
    </a>
  `;
}

function hero(featured, next) {
  if (!featured) return "";
  return `
    <section class="hero" style="background-image: linear-gradient(90deg, #05070a 0%, rgba(5,7,10,.78) 44%, rgba(5,7,10,.18) 100%), url('${cssUrl(backdropFor(featured))}')">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(featured.genres[0] || "Featured Movie")}</p>
        <h1>${escapeHtml(featured.title)}</h1>
        <p>${escapeHtml(movieSummary(featured))}</p>
        <div class="hero-actions">
          <a class="primary link-button" href="#/movie/${encodeURIComponent(featured.id)}">Watch Now</a>
          ${next ? `<a class="secondary link-button" href="#/movie/${encodeURIComponent(next.id)}">See Recommendation</a>` : ""}
        </div>
      </div>
    </section>
  `;
}

function searchBlock() {
  return `
    <div class="search-wrap">
      <input id="searchInput" type="search" placeholder="Search titles, genres, directors, countries" autocomplete="off" value="${escapeHtml(state.query)}" />
      <div id="suggestions" class="suggestions"></div>
    </div>
  `;
}

function bindSearch(scope = state.movies) {
  const input = document.querySelector("#searchInput");
  const suggestions = document.querySelector("#suggestions");
  const catalog = document.querySelector("#catalogResults");
  if (!input) return;
  input.addEventListener("input", () => {
    state.query = input.value;
    const results = searchMovies(scope, input.value);
    suggestions.innerHTML = input.value.trim() ? results.slice(0, 6).map((movie) => `
      <a class="suggestion-item" href="#/movie/${encodeURIComponent(movie.id)}">
        <span class="suggestion-title">${escapeHtml(movie.title)}</span>
        <span class="suggestion-genre">${escapeHtml(movie.genres[0] || "Unknown")}</span>
      </a>
    `).join("") : "";
    if (catalog) {
      catalog.innerHTML = results.length ? results.map(card).join("") : `<p class="empty-copy">No movies matched your search.</p>`;
    }
  });
}

function movieRow(title, movies) {
  if (!movies.length) return "";
  return `
    <section class="row-section">
      <h2>${escapeHtml(title)}</h2>
      <div class="movie-row">
        ${movies.map(card).join("")}
      </div>
    </section>
  `;
}

function card(movie) {
  const subtitle = [movie.year, movie.genres[0], movie.boxOffice ? formatMoney(movie.boxOffice) : ""].filter(Boolean).join(" | ");
  return `
    <a class="movie-card" href="#/movie/${encodeURIComponent(movie.id)}" title="${escapeHtml(movie.title)}">
      <img src="${escapeHtml(posterFor(movie))}" alt="${escapeHtml(movie.title)} poster" loading="lazy" />
      <div class="card-copy">
        <strong>${escapeHtml(movie.title)}</strong>
        <span>${escapeHtml(subtitle || movie.director || "Movie")}</span>
      </div>
    </a>
  `;
}

function fact(label, value) {
  return `
    <div class="fact">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Unavailable")}</strong>
    </div>
  `;
}

function watchedMovies() {
  return getWatched().map((item) => byId(item.movieId)).filter(Boolean);
}

function byId(id) {
  return state.movies.find((movie) => movie.id === String(id));
}

function searchMovies(movies, query) {
  const q = query.trim().toLowerCase();
  if (!q) return movies;
  return movies
    .filter((movie) => [
      movie.title,
      movie.year,
      movie.genres.join(" "),
      movie.director,
      movie.country,
      movie.certificate,
      movie.releaseDate
    ].join(" ").toLowerCase().includes(q))
    .slice(0, 60);
}

function uniqueGenres(movies) {
  return [...new Set(movies.flatMap((movie) => movie.genres))].sort((a, b) => a.localeCompare(b));
}

function homeIntro(genres, selectedGenre) {
  return `
    <section class="genre-panel">
      <div class="genre-copy">
        <p class="eyebrow">What would you like to watch today?</p>
        <h2>Browse by genre and discover new favorites.</h2>
      </div>
      <div class="genre-controls">
        <label for="genreSelect" class="sr-only">Select genre</label>
        <select id="genreSelect">
          <option value="">All genres</option>
          ${genres.map((genre) => `<option value="${escapeHtml(genre)}"${genre === selectedGenre ? " selected" : ""}>${escapeHtml(genre)}</option>`).join("")}
        </select>
      </div>
    </section>
  `;
}

function bindGenreSelector(genres) {
  const selector = document.querySelector("#genreSelect");
  if (!selector) return;
  selector.addEventListener("change", () => {
    state.selectedGenre = selector.value;
    render();
  });
}

function emptyData(message) {
  return `
    <main class="empty-state">
      <div>
        <p class="eyebrow">Dataset required</p>
        <h1>No usable movie data</h1>
        <p>${escapeHtml(message)}</p>
        <p>Add the new dataset CSV and its image assets under <strong>data/</strong>, then restart the server.</p>
      </div>
    </main>
  `;
}

function cssUrl(value) {
  return `${value || ""}`.replace(/['\\]/g, "\\$&");
}

function escapeHtml(value) {
  return `${value ?? ""}`.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
