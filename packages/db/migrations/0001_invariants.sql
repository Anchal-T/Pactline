-- Invariants that a column constraint cannot carry (AGENTS.md §5). Enforced in the database, never in a prompt.

-- Invariant 7: BASELINE schedule revisions are immutable.
CREATE OR REPLACE FUNCTION pl_baseline_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.kind = 'BASELINE' THEN
    RAISE EXCEPTION 'schedule revision % is BASELINE and immutable', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER schedule_revisions_baseline_immutable
  BEFORE UPDATE OR DELETE ON "schedule_revisions"
  FOR EACH ROW EXECUTE FUNCTION pl_baseline_immutable();
--> statement-breakpoint

-- Invariant 1: active allocations against a PO line never exceed its quantity. The PO line row is
-- locked first, so two concurrent allocations serialise on it instead of both passing the sum check.
CREATE OR REPLACE FUNCTION pl_allocation_within_line() RETURNS trigger AS $$
DECLARE
  line_qty integer;
  allocated integer;
BEGIN
  SELECT quantity INTO line_qty FROM "po_lines" WHERE id = NEW.po_line_id FOR UPDATE;
  SELECT COALESCE(SUM(quantity), 0) INTO allocated FROM "fulfillment_allocations"
    WHERE po_line_id = NEW.po_line_id AND active AND id <> NEW.id;
  IF NEW.active AND allocated + NEW.quantity > line_qty THEN
    RAISE EXCEPTION 'allocation of % exceeds PO line % quantity % (already %)', NEW.quantity, NEW.po_line_id, line_qty, allocated
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER fulfillment_allocations_within_line
  BEFORE INSERT OR UPDATE ON "fulfillment_allocations"
  FOR EACH ROW EXECUTE FUNCTION pl_allocation_within_line();
--> statement-breakpoint
ALTER TABLE "fulfillment_allocations"
  ADD CONSTRAINT fulfillment_allocations_quantity_pos CHECK (quantity > 0);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION pl_po_line_quantity_covers_allocations() RETURNS trigger AS $$
DECLARE
  allocated integer;
BEGIN
  IF NEW.quantity < OLD.quantity THEN
    SELECT COALESCE(SUM(quantity), 0) INTO allocated FROM "fulfillment_allocations"
      WHERE po_line_id = NEW.id AND active;
    IF allocated > NEW.quantity THEN
      RAISE EXCEPTION 'PO line % quantity % is below active allocations %', NEW.id, NEW.quantity, allocated
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER po_lines_quantity_covers_allocations
  BEFORE UPDATE OF quantity ON "po_lines"
  FOR EACH ROW EXECUTE FUNCTION pl_po_line_quantity_covers_allocations();
--> statement-breakpoint

-- Vendor commitment history is append-only: a row may only be closed (valid_to set once), never edited or deleted.
CREATE OR REPLACE FUNCTION pl_commitments_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'vendor commitment % is history and cannot be deleted', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.valid_to IS NOT NULL
     OR NEW.valid_to IS NULL
     OR (to_jsonb(NEW) - 'valid_to') <> (to_jsonb(OLD) - 'valid_to') THEN
    RAISE EXCEPTION 'vendor commitment % is append-only: only closing valid_to once is allowed', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER vendor_commitments_append_only
  BEFORE UPDATE OR DELETE ON "vendor_commitments"
  FOR EACH ROW EXECUTE FUNCTION pl_commitments_append_only();
