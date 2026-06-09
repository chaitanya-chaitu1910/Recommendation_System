import { loadCsv } from "./csv.js";
import { buildStats } from "./recommender.js";
import { datasetProfile, normalizeMovie } from "../utils/movieUtils.js";

const MOVIE_SCHEMA_COLUMNS = [
  "Title",
  "ID",
  "Release Date",
  "Run Time",
  "Genre",
  "Director",
  "Country",
  "Certificate",
  "Budget",
  "Box Office",
  "Nominations",
  "Oscar Wins",
  "Poster_URL"
];

export async function loadMovieData() {
  const manifest = await loadDatasetManifest();
  if (!manifest.csvFiles.length) {
    throw new Error("No CSV files were found in the data folder.");
  }

  const tables = await Promise.all(manifest.csvFiles.map(async (file) => {
    const rows = await loadCsv(file.path);
    return {
      ...file,
      rows,
      columns: rows[0] ? Object.keys(rows[0]) : []
    };
  }));

  const movieTable = selectMovieTable(tables);
  if (!movieTable) {
    throw new Error(`No movie CSV matched the new dataset schema. Expected columns include: ${MOVIE_SCHEMA_COLUMNS.join(", ")}.`);
  }

  const movies = movieTable.rows
    .map((row, index) => normalizeMovie(row, manifest.imageAssets, index, movieTable.path))
    .filter((movie) => movie.title);
    const actionTables = tables.filter((table) => isActionTable(table.columns));
    const actions = actionTables.flatMap((table) => normalizeActions(table.rows));
  const stats = buildStats(movies);

  return {
    movies: stats.movies,
    stats,
    dataset: datasetProfile(tables, movieTable, manifest.imageAssets)
  };
}

  function isActionTable(columns) {
    const keys = new Set(columns.map((column) => `${column}`.trim()));
    return keys.has("UserID") && keys.has("MovieID") && keys.has("Action");
  }

  function normalizeActions(rows) {
    return rows
      .map((row) => {
        const userId = text(row.UserID || row.userId || row.userID);
        const movieId = text(row.MovieID || row.movieId || row.movieID);
        const action = text(row.Action || row.action).toLowerCase();
        const rating = number(row.Rating || row.rating);
        const timestamp = text(row.Timestamp || row.timestamp);
        return { userId, movieId, action, rating, timestamp };
      })
      .filter((entry) => entry.userId && entry.movieId && entry.action);
  }

  function number(value) {
    const parsed = Number(`${value ?? ""}`.trim().replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function text(value) {
    return `${value ?? ""}`.trim();
  }

async function loadDatasetManifest() {
  const response = await fetch("/api/dataset", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not inspect the data folder.");
  return response.json();
}

function selectMovieTable(tables) {
  return tables
    .map((table) => ({ table, score: movieSchemaScore(table.columns) }))
    .filter((entry) => entry.score >= 8)
    .sort((a, b) => b.score - a.score || b.table.rows.length - a.table.rows.length)[0]?.table;
}

function movieSchemaScore(columns) {
  const available = new Set(columns);
  return MOVIE_SCHEMA_COLUMNS.reduce((score, column) => score + (available.has(column) ? 1 : 0), 0);
}
