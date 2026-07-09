-- Espelho local da database original do jogo (importada de dumps reais / API SoFIFA).
-- Somente leitura pela aplicação: nunca editada nem preenchida com dados inventados.

CREATE TABLE IF NOT EXISTS sofifa_players (
  fifa_version INTEGER NOT NULL,          -- 15..24
  player_id INTEGER NOT NULL,             -- sofifa_id (id oficial da database do jogo)
  short_name TEXT NOT NULL,
  long_name TEXT NOT NULL,
  positions TEXT NOT NULL,                -- ex.: "ST, LW"
  overall INTEGER NOT NULL,
  potential INTEGER NOT NULL,
  value_eur INTEGER,
  wage_eur INTEGER,
  age INTEGER NOT NULL,
  dob TEXT,
  height_cm INTEGER,
  weight_kg INTEGER,
  club_team_id INTEGER,
  club_name TEXT,
  league_name TEXT,
  league_level INTEGER,
  club_position TEXT,
  club_jersey_number INTEGER,
  club_loaned_from TEXT,
  club_joined TEXT,
  club_contract_valid_until INTEGER,
  nationality_name TEXT,
  preferred_foot TEXT,
  weak_foot INTEGER,
  skill_moves INTEGER,
  international_reputation INTEGER,
  work_rate TEXT,
  body_type TEXT,
  player_tags TEXT,
  player_traits TEXT,
  pace INTEGER, shooting INTEGER, passing INTEGER,
  dribbling INTEGER, defending INTEGER, physic INTEGER,
  attributes_json TEXT NOT NULL,          -- todos os demais atributos originais (30+), sem redução
  PRIMARY KEY (fifa_version, player_id)
);
CREATE INDEX IF NOT EXISTS idx_sp_search ON sofifa_players (fifa_version, overall DESC);
CREATE INDEX IF NOT EXISTS idx_sp_potential ON sofifa_players (fifa_version, potential DESC);
CREATE INDEX IF NOT EXISTS idx_sp_age ON sofifa_players (fifa_version, age);
CREATE INDEX IF NOT EXISTS idx_sp_club ON sofifa_players (fifa_version, club_team_id);
CREATE INDEX IF NOT EXISTS idx_sp_name ON sofifa_players (fifa_version, short_name);

CREATE TABLE IF NOT EXISTS sofifa_teams (
  fifa_version INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  team_name TEXT NOT NULL,
  league_id INTEGER,
  league_name TEXT,
  league_level INTEGER,
  nationality_name TEXT,
  overall INTEGER,
  attack INTEGER,
  midfield INTEGER,
  defence INTEGER,
  transfer_budget_eur INTEGER,
  club_worth_eur INTEGER,
  star_rating REAL,
  international_prestige INTEGER,
  domestic_prestige INTEGER,
  youth_development INTEGER,               -- nem toda versão do dump traz; NULL quando ausente
  rival_team INTEGER,
  extra_json TEXT,                         -- demais colunas originais do dump
  PRIMARY KEY (fifa_version, team_id)
);
CREATE INDEX IF NOT EXISTS idx_st_league ON sofifa_teams (fifa_version, league_name);
CREATE INDEX IF NOT EXISTS idx_st_name ON sofifa_teams (fifa_version, team_name);

CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fifa_version INTEGER NOT NULL,
  source TEXT NOT NULL,                    -- 'kaggle-csv' | 'sofifa-api'
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | error
  total INTEGER,
  done INTEGER DEFAULT 0,
  error TEXT,
  started_at TEXT,
  finished_at TEXT
);

-- Configurações do app (tokens ficam locais, neste SQLite)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id INTEGER,
  file_name TEXT NOT NULL,
  screen_type TEXT,
  extracted_json TEXT,
  applied INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS server_backups (
  code TEXT PRIMARY KEY,
  backup_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
