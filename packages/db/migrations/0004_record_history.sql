CREATE TABLE entity_record_history (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  table_name text NOT NULL,
  record_key jsonb NOT NULL,
  version integer NOT NULL,
  operation text NOT NULL CHECK (operation IN ('UPDATE', 'DELETE')),
  old_record jsonb,
  new_record jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  transaction_id text NOT NULL,
  CONSTRAINT entity_record_history_version_chk CHECK (version > 0)
);

CREATE INDEX entity_record_history_lookup_idx
  ON entity_record_history (table_name, recorded_at DESC);

CREATE UNIQUE INDEX entity_record_history_version_uidx
  ON entity_record_history (table_name, record_key, version);

CREATE FUNCTION prevent_entity_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'entity_record_history is append-only'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER entity_record_history_append_only
BEFORE UPDATE OR DELETE ON entity_record_history
FOR EACH ROW EXECUTE FUNCTION prevent_entity_history_mutation();

CREATE FUNCTION record_entity_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_record jsonb;
  new_record jsonb;
  v_record_key jsonb;
  next_version integer;
  key_name text;
BEGIN
  old_record := to_jsonb(OLD);
  IF TG_OP = 'UPDATE' THEN
    new_record := to_jsonb(NEW);
  END IF;

  v_record_key := '{}'::jsonb;
  FOREACH key_name IN ARRAY TG_ARGV LOOP
    v_record_key := v_record_key || jsonb_build_object(key_name, old_record -> key_name);
  END LOOP;

  SELECT COALESCE(MAX(version), 0) + 1
  INTO next_version
  FROM entity_record_history
  WHERE table_name = TG_TABLE_NAME
    AND entity_record_history.record_key = v_record_key;

  INSERT INTO entity_record_history (
    table_name, record_key, version, operation, old_record, new_record,
    transaction_id
  )
  VALUES (
    TG_TABLE_NAME, v_record_key, next_version, TG_OP, old_record, new_record,
    pg_current_xact_id()::text
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER projects_record_history
AFTER UPDATE OR DELETE ON projects
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER vendors_record_history
AFTER UPDATE OR DELETE ON vendors
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER equipment_packages_record_history
AFTER UPDATE OR DELETE ON equipment_packages
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER material_needs_record_history
AFTER UPDATE OR DELETE ON material_needs
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER purchase_orders_record_history
AFTER UPDATE OR DELETE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER po_lines_record_history
AFTER UPDATE OR DELETE ON po_lines
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER fulfillment_allocations_record_history
AFTER UPDATE OR DELETE ON fulfillment_allocations
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER milestones_record_history
AFTER UPDATE OR DELETE ON milestones
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER receipts_record_history
AFTER UPDATE OR DELETE ON receipts
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER inspections_record_history
AFTER UPDATE OR DELETE ON inspections
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER acceptances_record_history
AFTER UPDATE OR DELETE ON acceptances
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER evidence_sources_record_history
AFTER UPDATE OR DELETE ON evidence_sources
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER requirement_sets_record_history
AFTER UPDATE OR DELETE ON requirement_sets
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER requirements_record_history
AFTER UPDATE OR DELETE ON requirements
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER product_configurations_record_history
AFTER UPDATE OR DELETE ON product_configurations
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER supplier_offers_record_history
AFTER UPDATE OR DELETE ON supplier_offers
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER compliance_findings_record_history
AFTER UPDATE OR DELETE ON compliance_findings
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER incidents_record_history
AFTER UPDATE OR DELETE ON incidents
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER recovery_plans_record_history
AFTER UPDATE OR DELETE ON recovery_plans
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER recovery_actions_record_history
AFTER UPDATE OR DELETE ON recovery_actions
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER approvals_record_history
AFTER UPDATE OR DELETE ON approvals
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER action_receipts_record_history
AFTER UPDATE OR DELETE ON action_receipts
FOR EACH ROW EXECUTE FUNCTION record_entity_history('receipt_id');

CREATE TRIGGER subject_revisions_record_history
AFTER UPDATE OR DELETE ON subject_revisions
FOR EACH ROW EXECUTE FUNCTION record_entity_history('subject_id');

CREATE TRIGGER schedule_revisions_record_history
AFTER UPDATE OR DELETE ON schedule_revisions
FOR EACH ROW EXECUTE FUNCTION record_entity_history('id');

CREATE TRIGGER activities_record_history
AFTER UPDATE OR DELETE ON activities
FOR EACH ROW EXECUTE FUNCTION record_entity_history('schedule_revision_id', 'activity_id');

CREATE TRIGGER dependencies_record_history
AFTER UPDATE OR DELETE ON dependencies
FOR EACH ROW EXECUTE FUNCTION record_entity_history(
  'schedule_revision_id', 'predecessor_id', 'successor_id'
);
