CREATE FUNCTION enforce_po_line_quantity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_qty numeric;
BEGIN
  -- The UPDATE already holds the same parent row lock as allocation writes.
  SELECT COALESCE(SUM(quantity), 0)
  INTO active_qty
  FROM fulfillment_allocations
  WHERE po_line_id = OLD.id AND status = 'ACTIVE';

  IF active_qty > NEW.quantity THEN
    RAISE EXCEPTION 'Active fulfillment allocations (%) exceed PO line % quantity (%)',
      active_qty, OLD.id, NEW.quantity
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_po_lines_quantity
BEFORE UPDATE OF quantity ON po_lines
FOR EACH ROW
WHEN (NEW.quantity < OLD.quantity)
EXECUTE FUNCTION enforce_po_line_quantity();

CREATE OR REPLACE FUNCTION enforce_baseline_schedule_child_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  revision_ids text[];
  baseline_id text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    revision_ids := ARRAY[NEW.schedule_revision_id];
  ELSIF TG_OP = 'DELETE' THEN
    revision_ids := ARRAY[OLD.schedule_revision_id];
  ELSE
    revision_ids := ARRAY[OLD.schedule_revision_id, NEW.schedule_revision_id];
  END IF;

  SELECT id INTO baseline_id
  FROM schedule_revisions
  WHERE id = ANY(revision_ids)
    AND kind = 'BASELINE'
    AND xmin <> pg_current_xact_id()::xid
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Cannot modify % belonging to BASELINE schedule revision %',
      TG_TABLE_NAME, baseline_id
      USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE FUNCTION refresh_product_configuration_pins(
  config_id text, config_revision integer, invalidate_all boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  affected_ids text[];
BEGIN
  INSERT INTO subject_revisions (subject_id, subject_type, config_rev)
  VALUES (config_id, 'ProductConfiguration', config_revision::text)
  ON CONFLICT (subject_id) DO NOTHING;

  -- A qualified pin can identify a proposed configuration independently of the PO or offer.
  WITH affected AS (
    UPDATE subject_revisions sr
    SET config_rev = CASE
          WHEN left(sr.config_rev, length(config_id) + 1) = config_id || '@'
            THEN config_id || '@' || config_revision::text
          ELSE config_revision::text
        END,
        updated_at = statement_timestamp()
    WHERE sr.subject_id = config_id
      OR left(sr.config_rev, length(config_id) + 1) = config_id || '@'
      OR (
        (sr.config_rev IS NULL OR sr.config_rev ~ '^[0-9]+$')
        AND (
          EXISTS (SELECT 1 FROM po_lines WHERE id = sr.subject_id AND product_config_id = config_id)
          OR EXISTS (SELECT 1 FROM supplier_offers WHERE id = sr.subject_id AND product_config_id = config_id)
        )
      )
    RETURNING sr.subject_id
  )
  SELECT array_agg(subject_id) INTO affected_ids FROM affected;

  -- Acquire the revision locks before taking approval locks, as the gateway does.
  UPDATE approvals a
  SET invalidated_at = statement_timestamp(), invalidation_reason = 'Product configuration revised'
  FROM subject_revisions sr
  WHERE a.subject_id = sr.subject_id
    AND sr.subject_id = ANY(affected_ids)
    AND a.outcome = 'GRANTED'
    AND a.invalidated_at IS NULL
    AND (invalidate_all OR a.config_rev IS DISTINCT FROM sr.config_rev);
END;
$$;

CREATE FUNCTION sync_product_configuration_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS NOT DISTINCT FROM OLD THEN
      RETURN NEW;
    END IF;
    IF NEW.revision <= OLD.revision THEN
      RAISE EXCEPTION 'Product configuration % requires a revision above %',
        OLD.id, OLD.revision
        USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM refresh_product_configuration_pins(NEW.id, NEW.revision, TG_OP = 'UPDATE');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_configuration_revision
AFTER INSERT OR UPDATE ON product_configurations
FOR EACH ROW
EXECUTE FUNCTION sync_product_configuration_revision();

DO $$
DECLARE
  config record;
BEGIN
  FOR config IN SELECT id, revision FROM product_configurations LOOP
    PERFORM refresh_product_configuration_pins(config.id, config.revision, false);
  END LOOP;
END;
$$;
