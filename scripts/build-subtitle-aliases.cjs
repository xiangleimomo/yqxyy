// SPDX-License-Identifier: AGPL-3.0-only
// Refresh only the standalone subtitle title aliases; never edit movie sources.
const fs = require("node:fs"),
  path = require("node:path");
const root = path.join(__dirname, "..");
const series = JSON.parse(
  fs.readFileSync(path.join(root, "data/movie-series.json"), "utf8"),
);
const seen = new Set(),
  movies = [];
for (const s of series) {
  const j = JSON.parse(
    fs.readFileSync(
      path.join(root, "data/movies", s.id, "movies.json"),
      "utf8",
    ),
  );
  for (const m of j.sources || []) {
    if (!m.title || seen.has(m.id)) continue;
    seen.add(m.id);
    movies.push({ id: m.id, title: m.title, titleZh: m.titleZh, year: m.year });
  }
}
fs.writeFileSync(
  path.join(root, "source-lab/subtitle-films.json"),
  JSON.stringify(movies, null, 2) + "\n",
);
console.log("Refreshed " + movies.length + " subtitle title aliases");
