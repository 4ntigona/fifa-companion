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

-- Dados do usuário (carreiras)

CREATE TABLE IF NOT EXISTS careers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  fifa_version INTEGER NOT NULL,
  team_type TEXT NOT NULL CHECK (team_type IN ('existing','created')),
  sofifa_team_id INTEGER,                  -- para team_type = existing
  -- time criado (FIFA 22+)
  created_team_name TEXT,
  created_team_budget_eur INTEGER,
  created_team_league TEXT,
  replaced_team_id INTEGER,                -- time original substituído
  objectives TEXT,                         -- JSON: lista de objetivos
  squad_quality TEXT,                      -- ex.: "4.5 estrelas"
  -- linha do tempo do save
  current_season TEXT NOT NULL DEFAULT '2023/24',
  current_date_ingame TEXT,                -- data corrente dentro do jogo (ISO)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS career_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id INTEGER NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('sofifa','generated','youth','regen')),
  sofifa_player_id INTEGER,                -- obrigatório p/ origin=sofifa; opcional (regen_de) p/ regen
  name TEXT NOT NULL,
  positions TEXT NOT NULL,
  age INTEGER,
  overall_original INTEGER,                -- como revelado no jogo (origin != sofifa)
  potential_original INTEGER,
  strengths TEXT,                          -- pontos fortes
  notes TEXT,
  jersey_number INTEGER,
  status TEXT NOT NULL DEFAULT 'elenco',   -- elenco | titular | reserva | emprestado | vendido | base
  in_squad INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cp_career ON career_players (career_id);

CREATE TABLE IF NOT EXISTS player_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  career_player_id INTEGER NOT NULL REFERENCES career_players(id) ON DELETE CASCADE,
  season TEXT NOT NULL,                    -- temporada do jogo, ex.: "2024/25"
  date_ingame TEXT,                        -- data dentro do jogo (ISO)
  overall INTEGER,
  potential INTEGER,
  position TEXT,
  attributes_json TEXT,                    -- atributos-chave opcionais
  form_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ps_player ON player_snapshots (career_player_id, season);

CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id INTEGER NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  sofifa_player_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'observando', -- observando | negociando | contratado | descartado
  priority INTEGER NOT NULL DEFAULT 2,       -- 1 alta, 2 média, 3 baixa
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (career_id, sofifa_player_id)
);

CREATE TABLE IF NOT EXISTS captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id INTEGER REFERENCES careers(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  screen_type TEXT,                        -- detectado pela IA
  extracted_json TEXT,                     -- resultado bruto da IA
  applied INTEGER NOT NULL DEFAULT 0,      -- já convertido em registros?
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
