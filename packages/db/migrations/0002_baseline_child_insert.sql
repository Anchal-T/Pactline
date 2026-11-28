-- Invariant 7: a BASELINE revision's activities and dependencies cannot gain rows
-- after the transaction that created the revision. Creation still inserts children
-- in that same transaction; xmin identifies it.

CREATE OR REPLACE FUNCTION enforce_baseline_schedule_child_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rev_id text;
BEGIN
  rev_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.schedule_revision_id
    ELSE NEW.schedule_revision_id
  END;

  IF EXISTS (
    SELECT 1
    FROM schedule_revisions
    WHERE id = rev_id
      AND kind = 'BASELINE'
      AND xmin::text::bigint <> txid_current()
  ) THEN
    RAISE EXCEPTION 'Cannot modify % belonging to BASELINE schedule revision %',
      TG_TABLE_NAME, rev_id
      USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_activities_baseline_immutable ON activities;
CREATE TRIGGER trg_activities_baseline_immutable
BEFORE INSERT OR UPDATE OR DELETE ON activities
FOR EACH ROW
EXECUTE FUNCTION enforce_baseline_schedule_child_immutability();

DROP TRIGGER IF EXISTS trg_dependencies_baseline_immutable ON dependencies;
CREATE TRIGGER trg_dependencies_baseline_immutable
BEFORE INSERT OR UPDATE OR DELETE ON dependencies
FOR EACH ROW
EXECUTE FUNCTION enforce_baseline_schedule_child_immutability();
