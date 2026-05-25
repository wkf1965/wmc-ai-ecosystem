-- ============================================================
-- WMC AI — Stage 4 PostgreSQL Schema
-- Database: wmc_ai
-- Version : 1.0.0 (May 2026)
-- Usage   : psql -U postgres -d wmc_ai -f database/schema.sql
-- ============================================================

-- ── 0. Extensions ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ── 1. patients ───────────────────────────────────────────────
-- Core patient register shared by nursing, rehab, side-turning.
CREATE TABLE IF NOT EXISTS patients (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(120) NOT NULL,
  room           VARCHAR(20)  NOT NULL,
  diagnosis      TEXT,
  status         VARCHAR(30)  NOT NULL DEFAULT 'active',
                   -- active | discharged | deceased | on-leave
  admission_date DATE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_room   ON patients (room);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients (status);

-- ── 2. nursing_records ────────────────────────────────────────
-- Nursing notes, vitals, observations.
CREATE TABLE IF NOT EXISTS nursing_records (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID        REFERENCES patients (id) ON DELETE SET NULL,
  record_type  VARCHAR(60)  NOT NULL,
                 -- vital_signs | observation | medication | wound_care | other
  notes        TEXT,
  nurse_name   VARCHAR(120),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nursing_patient    ON nursing_records (patient_id);
CREATE INDEX IF NOT EXISTS idx_nursing_created    ON nursing_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nursing_created_dt ON nursing_records (DATE(created_at));

-- ── 3. side_turning_records ───────────────────────────────────
-- Two-hourly repositioning log to prevent pressure injuries.
CREATE TABLE IF NOT EXISTS side_turning_records (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID        REFERENCES patients (id) ON DELETE SET NULL,
  room       VARCHAR(20),
  position   VARCHAR(30)  NOT NULL,
               -- left | right | supine | prone | fowler
  photo_url  TEXT,
  score      SMALLINT,    -- optional pressure-injury risk score
  nurse_name VARCHAR(120),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_turning_patient ON side_turning_records (patient_id);
CREATE INDEX IF NOT EXISTS idx_turning_created ON side_turning_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_turning_date    ON side_turning_records (DATE(created_at));

-- ── 4. ot_records ─────────────────────────────────────────────
-- Overtime punch records and calculated OT pay per shift.
CREATE TABLE IF NOT EXISTS ot_records (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name     VARCHAR(120)   NOT NULL,
  shift_end_time TIME,          -- scheduled shift end (e.g. 17:00)
  ot_start_time  TIMESTAMPTZ,   -- actual OT start punch
  ot_end_time    TIMESTAMPTZ,   -- actual OT end punch
  total_ot_hours NUMERIC(5, 2)  DEFAULT 0,
  ot_allowance   NUMERIC(10, 2) DEFAULT 0,
  status         VARCHAR(30)    NOT NULL DEFAULT 'pending',
                   -- pending | approved | rejected | incomplete
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ot_staff   ON ot_records (staff_name);
CREATE INDEX IF NOT EXISTS idx_ot_status  ON ot_records (status);
CREATE INDEX IF NOT EXISTS idx_ot_created ON ot_records (created_at DESC);

-- ── 5. rehab_progress ─────────────────────────────────────────
-- Physiotherapy / occupational therapy session records.
CREATE TABLE IF NOT EXISTS rehab_progress (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID        REFERENCES patients (id) ON DELETE SET NULL,
  therapist_name  VARCHAR(120),
  treatment_type  VARCHAR(80),
                    -- physiotherapy | occupational | speech | respiratory
  progress_notes  TEXT,
  pain_score      SMALLINT,    -- 0-10 NRS pain scale
  mobility_score  SMALLINT,    -- 0-10 custom mobility scale
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rehab_patient ON rehab_progress (patient_id);
CREATE INDEX IF NOT EXISTS idx_rehab_created ON rehab_progress (created_at DESC);

-- ── 6. crm_leads ─────────────────────────────────────────────
-- Prospective family enquiries and follow-up pipeline.
CREATE TABLE IF NOT EXISTS crm_leads (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name    VARCHAR(120)  NOT NULL,
  phone            VARCHAR(30),
  service_interest VARCHAR(120), -- nursing_home | day_care | rehab | home_care
  lead_status      VARCHAR(30)   NOT NULL DEFAULT 'new',
                     -- new | contacted | visit_scheduled | admitted | closed
  next_follow_up   DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_status  ON crm_leads (lead_status);
CREATE INDEX IF NOT EXISTS idx_crm_created ON crm_leads (created_at DESC);

-- ── 7. ai_memory ─────────────────────────────────────────────
-- AI-generated summaries and risk flags, linked to any module.
CREATE TABLE IF NOT EXISTS ai_memory (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module      VARCHAR(60)  NOT NULL,
                -- nursing | rehab | crm | side_turning | ot | general
  related_id  UUID,        -- FK to the source record (optional)
  summary     TEXT         NOT NULL,
  risk_level  VARCHAR(20)  NOT NULL DEFAULT 'low',
                -- low | medium | high | critical
  next_action TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_module  ON ai_memory (module);
CREATE INDEX IF NOT EXISTS idx_ai_risk    ON ai_memory (risk_level);
CREATE INDEX IF NOT EXISTS idx_ai_created ON ai_memory (created_at DESC);

-- ============================================================
-- End of schema.sql
-- ============================================================
