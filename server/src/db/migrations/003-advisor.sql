-- Conselheiro de IA (v0.4.000): histórico de pareceres/consultas por carreira.
-- A RESPOSTA da IA é persistida (é dado do usuário); a chave do provedor NUNCA toca
-- o servidor (segue BYOK stateless, como /api/analyze).
CREATE TABLE advisor_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id INTEGER NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,               -- 'parecer' (análise completa) | 'consulta' (pergunta dirigida)
  question TEXT,                    -- null no parecer; o texto da pergunta na consulta
  response_json TEXT NOT NULL,      -- resposta estruturada { resumo, orientacoes[] }
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_advisor_career ON advisor_reports (career_id, id DESC);
