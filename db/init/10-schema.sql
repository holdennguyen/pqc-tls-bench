-- Medical-records schema. ALL data in this testbed is FULLY SYNTHETIC (invented
-- Vietnamese names/diagnoses) — never real patient data.
CREATE TABLE records (
    id          serial PRIMARY KEY,
    patient_name text NOT NULL,
    dob          date NOT NULL,
    diagnosis    text NOT NULL,
    notes        text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now()
);
