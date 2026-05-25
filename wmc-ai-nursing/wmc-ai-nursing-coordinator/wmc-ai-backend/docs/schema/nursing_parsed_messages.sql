-- WMC AI — natural language nursing parse store (PostgreSQL)
-- Run when DATABASE_URL is configured for production NLP ingress.

CREATE TABLE IF NOT EXISTS nursing_parsed_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL DEFAULT 'api',
  raw_text TEXT NOT NULL,
  room TEXT,
  patient_name TEXT,
  patient_id UUID,
  nurse_name TEXT,
  chat_id TEXT,
  appetite TEXT,
  mobility TEXT,
  turning_position TEXT,
  blood_pressure TEXT,
  pulse INT,
  temperature REAL,
  oxygen INT,
  pain_score INT,
  symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
  vitals JSONB NOT NULL DEFAULT '{}'::jsonb,
  parsed_json JSONB NOT NULL,
  alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nursing_parsed_messages_created_at
  ON nursing_parsed_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nursing_parsed_messages_patient_name
  ON nursing_parsed_messages (patient_name);
