-- Additive M11 change: M10 reads/writes remain compatible. Never down-migrate privacy fencing.
CREATE TABLE release_control (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  draining BOOLEAN NOT NULL DEFAULT false,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO release_control(singleton) VALUES(true);
CREATE FUNCTION guard_release_admission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE blocked BOOLEAN;
BEGIN
  -- Drain UPDATE waits for starts already admitted in this transaction.
  SELECT draining INTO blocked FROM release_control WHERE singleton FOR SHARE;
  IF blocked IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'RELEASE_DRAINING' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER release_admission BEFORE INSERT ON practice_sessions
FOR EACH ROW EXECUTE FUNCTION guard_release_admission();
-- Conservative admission budget persists through API restarts and concurrent publishers.
CREATE TABLE qstash_publication_budgets (
  day DATE PRIMARY KEY,
  publications INTEGER NOT NULL CHECK (publications BETWEEN 0 AND 100),
  blocked BOOLEAN NOT NULL DEFAULT false
);
