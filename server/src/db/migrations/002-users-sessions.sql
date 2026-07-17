-- Contas reais: usuários + sessões, e as tabelas de dados do usuário ganham dono.
-- As tabelas de carreira do baseline nunca foram usadas pelas rotas ativas (dados
-- viviam no localStorage) e estão vazias em produção — por isso o DROP é seguro.
-- PROIBIDO tocar em sofifa_players/sofifa_teams (dados reais importados).

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Guarda só o SHA-256 do token (o token em si vive apenas no cookie do usuário).
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- Recriação das tabelas de dados do usuário com user_id (filhas primeiro, por FK).
DROP TABLE IF EXISTS captures;
DROP TABLE IF EXISTS prospects;
DROP TABLE IF EXISTS player_snapshots;
DROP TABLE IF EXISTS career_players;
DROP TABLE IF EXISTS careers;
DROP TABLE IF EXISTS settings;

CREATE TABLE careers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
CREATE INDEX idx_careers_user ON careers (user_id);

CREATE TABLE career_players (
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
CREATE INDEX idx_cp_career ON career_players (career_id);

CREATE TABLE player_snapshots (
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
CREATE INDEX idx_ps_player ON player_snapshots (career_player_id, season);

CREATE TABLE prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id INTEGER NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  sofifa_player_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'observando', -- observando | negociando | contratado | descartado
  priority INTEGER NOT NULL DEFAULT 2,       -- 1 alta, 2 média, 3 baixa
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (career_id, sofifa_player_id)
);

CREATE TABLE captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id INTEGER REFERENCES careers(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  screen_type TEXT,                        -- detectado pela IA
  extracted_json TEXT,                     -- resultado bruto da IA
  applied INTEGER NOT NULL DEFAULT 0,      -- já convertido em registros?
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
