-- ============================================================
-- CLIENTS
-- ============================================================

-- Adds a new client.
-- 1. saves the client in the clients table
-- 2. saves their main contact in the contacts table
-- 3. saves one project per program (H-2A, H-2B, EB-3) in the projects table
-- If any step fails, nothing is saved. Returns the new client's id.

CREATE OR REPLACE FUNCTION clients_create(
  p_name           TEXT,
  p_type           TEXT,
  p_industry       TEXT,
  p_location       TEXT,
  p_status         TEXT,
  p_contact_name   TEXT,
  p_contact_email  TEXT,
  p_contact_phone  TEXT,
  p_programs       TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_id INTEGER;
  v_program   TEXT;
BEGIN
  -- 1. the client
  INSERT INTO clients (name, type, industry, location, status)
  VALUES (p_name, p_type, p_industry, p_location, p_status)
  RETURNING id INTO v_client_id;

  -- 2. the main contact
  INSERT INTO contacts (client_id, name, email, phone, is_primary)
  VALUES (v_client_id, p_contact_name, p_contact_email, p_contact_phone, true);

  -- 3. one project per program
  FOREACH v_program IN ARRAY COALESCE(p_programs, ARRAY[]::TEXT[]) LOOP
    INSERT INTO projects (client_id, name, program)
    VALUES (v_client_id, p_name || ' ' || UPPER(v_program), v_program);
  END LOOP;

  RETURN v_client_id;
END;
$$;