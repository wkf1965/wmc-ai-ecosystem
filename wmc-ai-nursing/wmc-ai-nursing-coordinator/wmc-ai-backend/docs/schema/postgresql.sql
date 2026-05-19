-- WMC AI Backend — PostgreSQL target schema (migration reference)
-- Replace Google Sheets / JSON file tabs with these tables when moving to Postgres.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('admin', 'doctor', 'nurse', 'receptionist', 'therapist');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mrn TEXT UNIQUE,
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT,
  phone TEXT,
  medical_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE lead_source AS ENUM ('whatsapp', 'google_form', 'walk_in', 'referral', 'other');
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'converted', 'lost');
CREATE TYPE pipeline_stage AS ENUM ('inquiry', 'consultation_booked', 'deposit', 'closed_won', 'closed_lost');

CREATE TABLE crm_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source lead_source NOT NULL,
  status lead_status NOT NULL,
  pipeline_stage pipeline_stage NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  follow_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nursing_daily_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  nurse_user_id UUID NOT NULL REFERENCES users(id),
  shift_date DATE NOT NULL,
  narrative TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vital_signs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  recorded_by_user_id UUID NOT NULL REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  temperature REAL,
  blood_pressure_sys INT,
  blood_pressure_dia INT,
  heart_rate INT,
  spo2 INT,
  notes TEXT
);

CREATE TABLE medications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dose TEXT,
  route TEXT,
  scheduled_at TIMESTAMPTZ,
  administered_at TIMESTAMPTZ,
  administered_by_user_id UUID REFERENCES users(id),
  notes TEXT
);

CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE nursing_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  severity alert_severity NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  photo_url_placeholder TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by_user_id UUID REFERENCES users(id)
);

CREATE TYPE review_priority AS ENUM ('routine', 'urgent');
CREATE TYPE review_status AS ENUM ('pending', 'reviewed', 'escalated');

CREATE TABLE doctor_review_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  source_alert_id UUID REFERENCES nursing_alerts(id),
  priority review_priority NOT NULL,
  summary TEXT NOT NULL,
  status review_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rehab_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  therapist_user_id UUID NOT NULL REFERENCES users(id),
  session_at TIMESTAMPTZ NOT NULL,
  pain_score INT CHECK (pain_score BETWEEN 0 AND 10),
  mobility_notes TEXT,
  therapist_notes TEXT,
  ai_progress_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE ai_job_kind AS ENUM (
  'patient_summary',
  'clinical_notes_summary',
  'lead_classify',
  'follow_up_message',
  'nursing_alert_summary',
  'rehab_progress_report'
);

CREATE TABLE ai_results (
  request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind ai_job_kind NOT NULL,
  output_text TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patients_mrn ON patients(mrn);
CREATE INDEX idx_crm_leads_status ON crm_leads(status);
CREATE INDEX idx_nursing_reports_patient ON nursing_daily_reports(patient_id);
CREATE INDEX idx_vitals_patient ON vital_signs(patient_id);
CREATE INDEX idx_rehab_patient ON rehab_sessions(patient_id);
