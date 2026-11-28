-- Custom PostgreSQL triggers for Invariant 1 (PO allocation cap with FOR UPDATE)
-- and Invariant 7 (BASELINE schedule immutability).

CREATE OR REPLACE FUNCTION enforce_po_line_allocation_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_line_qty numeric(12,3);
  v_active_qty numeric(12,3);
BEGIN
  IF NEW.status <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  -- Lock parent PO line row so concurrent allocations serialize.
  SELECT quantity
  INTO v_line_qty
  FROM po_lines
  WHERE id = NEW.po_line_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO line % does not exist', NEW.po_line_id
      USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(SUM(quantity), 0)
  INTO v_active_qty
  FROM fulfillment_allocations
  WHERE po_line_id = NEW.po_line_id
    AND status = 'ACTIVE'
    AND id <> NEW.id;

  IF v_active_qty + NEW.quantity > v_line_qty THEN
    RAISE EXCEPTION 'Active fulfillment allocations (% + %) exceed PO line % quantity (%)',
      v_active_qty, NEW.quantity, NEW.po_line_id, v_line_qty
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fulfillment_allocations_cap
BEFORE INSERT OR UPDATE ON fulfillment_allocations
FOR EACH ROW
EXECUTE FUNCTION enforce_po_line_allocation_cap();

-- Invariant 7: BASELINE schedule revisions and their activities/dependencies are immutable.
CREATE OR REPLACE FUNCTION enforce_baseline_schedule_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.kind = 'BASELINE' THEN
    RAISE EXCEPTION 'BASELINE schedule revision % is immutable', OLD.id
      USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_schedule_revisions_baseline_immutable
BEFORE UPDATE OR DELETE ON schedule_revisions
FOR EACH ROW
EXECUTE FUNCTION enforce_baseline_schedule_immutability();

CREATE OR REPLACE FUNCTION enforce_baseline_schedule_child_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM schedule_revisions
    WHERE id = OLD.schedule_revision_id
      AND kind = 'BASELINE'
  ) THEN
    RAISE EXCEPTION 'Cannot modify or delete % belonging to BASELINE schedule revision %',
      TG_TABLE_NAME, OLD.schedule_revision_id
      USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_activities_baseline_immutable
BEFORE UPDATE OR DELETE ON activities
FOR EACH ROW
EXECUTE FUNCTION enforce_baseline_schedule_child_immutability();

CREATE TRIGGER trg_dependencies_baseline_immutable
BEFORE UPDATE OR DELETE ON dependencies
FOR EACH ROW
EXECUTE FUNCTION enforce_baseline_schedule_child_immutability();
