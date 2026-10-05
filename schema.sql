CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 18),
  deck TEXT NOT NULL,
  moves INTEGER NOT NULL CHECK(moves BETWEEN 8 AND 9999),
  seconds INTEGER NOT NULL CHECK(seconds BETWEEN 0 AND 86400),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS scores_ranking
  ON scores (moves ASC, seconds ASC, created_at ASC);
