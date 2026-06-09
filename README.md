# PrimeFlix Movie Recommendation System

A lightweight Amazon Prime Video inspired movie recommendation web app rebuilt around the detected dataset in `data/`.

## Dataset

The server automatically scans `data/` for CSV files and image assets. The current dataset is:

- `data/movies_with_images_cleaned.csv`

Detected movie columns:

- `Title`
- `ID`
- `Release Date`
- `Run Time`
- `Genre`
- `Director`
- `Country`
- `Certificate`
- `Budget`
- `Box Office`
- `Nominations`
- `Oscar Wins`
- `Poster_URL`

No separate image folders are currently present. Movie images come from the dataset's `Poster_URL` column.

## Recommendations

The dataset does not include ratings, user interactions, tags, or precomputed similarity files. Recommendations therefore use a hybrid metadata strategy:

- content similarity from genre, director, country, certificate, release decade, runtime, budget, box office, nominations, and Oscar wins
- a popularity prior from box office, Oscar wins, nominations, return on budget, and release year

The strategy is documented in `src/services/recommender.js`.

## Run

```powershell
npm start
```

Open `http://localhost:5173`.

## Features

- Prime Video inspired dark streaming UI
- Dataset poster images in the hero, movie cards, search suggestions, and detail pages
- Automatic CSV and image asset discovery
- Instant search across titles, genres, directors, countries, certificates, and release dates
- Popular, recommended, continue watching, watchlist, box office, awards, and genre rows
- Dedicated movie details pages using the new dataset metadata
- Dataset-scoped continue watching and local watchlist
