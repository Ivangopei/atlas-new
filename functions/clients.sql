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


-- Deletes a client.
-- Their contacts, projects, tasks and documents are deleted too,
-- because those tables use ON DELETE CASCADE.
-- Returns true if a client was deleted, false if that id didn't exist.
DROP FUNCTION IF EXISTS clients_delete(INTEGER);  -- in case an older version exists
CREATE OR REPLACE FUNCTION clients_delete(p_client_id INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM clients WHERE id = p_client_id;
  RETURN FOUND;
END;
$$;


-- Edits an existing client.
-- 1. updates the client's details in the clients table
-- 2. updates their main contact (or adds one if they don't have one)
-- 3. makes their programs match p_programs:
--    unchecked programs are removed, newly checked ones are added
--    (removing a program deletes that project; its tasks stay with the client)
-- Returns true if the client was updated, false if that id didn't exist.
DROP FUNCTION IF EXISTS clients_update(INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT);  -- older version, if any
DROP FUNCTION IF EXISTS clients_update(INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);
CREATE OR REPLACE FUNCTION clients_update(
  p_client_id      INTEGER,
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
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. the client
  UPDATE clients
     SET name     = p_name,
         type     = p_type,
         industry = p_industry,
         location = p_location,
         status   = p_status
   WHERE id = p_client_id;

  IF NOT FOUND THEN
    RETURN false;  -- no client with that id
  END IF;

  -- 2. the main contact
  --    individual: the form's email/phone replaces the saved one
  --    business: the form only has a name, so the saved email/phone are kept
  UPDATE contacts
     SET name  = p_contact_name,
         email = CASE WHEN p_type = 'individual' THEN p_contact_email
                      ELSE COALESCE(p_contact_email, email) END,
         phone = CASE WHEN p_type = 'individual' THEN p_contact_phone
                      ELSE COALESCE(p_contact_phone, phone) END
   WHERE client_id = p_client_id AND is_primary;

  IF NOT FOUND THEN
    INSERT INTO contacts (client_id, name, email, phone, is_primary)
    VALUES (p_client_id, p_contact_name, p_contact_email, p_contact_phone, true);
  END IF;

  -- 3a. remove programs that were unchecked
  DELETE FROM projects
   WHERE client_id = p_client_id
     AND NOT (program = ANY (COALESCE(p_programs, ARRAY[]::TEXT[])));

  -- 3b. add programs that were newly checked
  INSERT INTO projects (client_id, name, program)
  SELECT p_client_id, p_name || ' ' || UPPER(new_program), new_program
    FROM unnest(COALESCE(p_programs, ARRAY[]::TEXT[])) AS new_program
   WHERE NOT EXISTS (
     SELECT 1 FROM projects
      WHERE client_id = p_client_id AND program = new_program
   );

  RETURN true;
END;
$$;