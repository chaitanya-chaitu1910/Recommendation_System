const IMAGE_COLUMN = "Poster_URL";

export function normalizeMovie(row, imageAssets = [], index = 0, sourcePath = "") {
  const title = text(row.Title);
  const releaseDate = text(row["Release Date"]);
  const year = releaseDate.slice(0, 4);
  const id = text(row.ID) || `${title}-${index + 1}`;
  const genres = splitList(row.Genre);
  const posterUrl = text(row[IMAGE_COLUMN]) || findLocalImage(row, imageAssets);

  return {
    id,
    title,
    releaseDate,
    year,
    runtime: number(row["Run Time"]),
    genres,
    director: text(row.Director),
    country: text(row.Country),
    certificate: text(row.Certificate),
    budget: number(row.Budget),
    boxOffice: number(row["Box Office"]),
    nominations: number(row.Nominations),
    oscarWins: number(row["Oscar Wins"]),
    posterUrl,
    backdropUrl: posterUrl,
    sourcePath,
    raw: row
  };
}

export function datasetProfile(tables, movieTable, imageAssets) {
  return {
    csvFiles: tables.map((table) => ({
      path: table.path,
      rows: table.rows.length,
      columns: table.columns
    })),
    imageFolders: folderSummary(imageAssets),
    movieCsv: movieTable?.path || "",
    relationships: tables.length === 1
      ? "Single movie table; rows are independent movie records keyed by ID."
      : "Multiple CSV files detected; the selected movie table is the file with the strongest match to the observed movie schema."
  };
}

export function posterFor(movie) {
  return movie?.posterUrl || "";
}

export function backdropFor(movie) {
  return movie?.backdropUrl || movie?.posterUrl || "";
}

export function movieSummary(movie) {
  const parts = [
    movie.director ? `Directed by ${movie.director}` : "",
    movie.country ? `from ${movie.country}` : "",
    movie.year ? `released in ${movie.year}` : ""
  ].filter(Boolean);
  const awards = [
    movie.oscarWins ? `${formatWhole(movie.oscarWins)} Oscar wins` : "",
    movie.nominations ? `${formatWhole(movie.nominations)} nominations` : ""
  ].filter(Boolean);
  const money = movie.boxOffice ? `It earned ${formatMoney(movie.boxOffice)} at the box office.` : "";
  return `${parts.join(" ")}${parts.length ? "." : ""} ${awards.length ? `Awards profile: ${awards.join(", ")}.` : ""} ${money}`.trim();
}

export function formatRuntime(minutes) {
  if (!minutes) return "Runtime unavailable";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

export function formatMoney(value) {
  if (!value) return "Unavailable";
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
    currency: "USD"
  }).format(value);
}

export function formatWhole(value) {
  if (value == null || Number.isNaN(Number(value))) return "0";
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(Number(value));
}

export function formatDate(value) {
  if (!value) return "Release date unavailable";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}

export function canonical(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findLocalImage(row, imageAssets) {
  if (!imageAssets.length) return "";
  const keys = [row.ID, row.Title].map(canonical).filter(Boolean);
  const match = imageAssets.find((asset) => {
    const name = canonical(asset.name.replace(/\.[^.]+$/, ""));
    return keys.some((key) => name === key || name.includes(key));
  });
  return match?.path || "";
}

function splitList(value) {
  return text(value).split(/[|;,]/).map((item) => item.trim()).filter(Boolean);
}

function number(value) {
  const parsed = Number(text(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
  return `${value ?? ""}`.trim();
}

function folderSummary(imageAssets) {
  const folders = new Map();
  for (const asset of imageAssets) {
    const folder = asset.path.split("/").slice(0, -1).join("/") || "/data";
    folders.set(folder, (folders.get(folder) || 0) + 1);
  }
  return [...folders.entries()].map(([path, count]) => ({ path, count }));
}
