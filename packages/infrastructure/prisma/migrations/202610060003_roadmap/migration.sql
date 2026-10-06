-- Additive roadmap metadata. Preserve legacy plan endpoints and completed activity history.
ALTER TABLE learning_plan_activities ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK(position>=0);
WITH ordered AS (
 SELECT id,row_number() OVER(PARTITION BY plan_id ORDER BY candidate_id)-1 AS position
 FROM learning_plan_activities
) UPDATE learning_plan_activities a SET position=o.position FROM ordered o WHERE a.id=o.id;
CREATE INDEX learning_plan_activities_order ON learning_plan_activities(plan_id,position);
ALTER TABLE learning_plan_activities ADD COLUMN started_from_version INTEGER;
ALTER TABLE learning_plans ADD COLUMN roadmap_signature TEXT;
ALTER TABLE learning_plans ADD COLUMN adapted_at TIMESTAMPTZ;

-- New generator/catalog versions are explicit; old persisted plans remain readable.
ALTER TABLE learning_plans DROP CONSTRAINT learning_plans_generator_version_check;
ALTER TABLE learning_plans ADD CHECK(generator_version IN ('plan-generator-v1','plan-generator-v2'));
ALTER TABLE learning_plans DROP CONSTRAINT learning_plans_catalog_version_check;
ALTER TABLE learning_plans ADD CHECK(catalog_version IN ('plan-catalog-v1','plan-catalog-v2'));
ALTER TABLE learning_plan_activities DROP CONSTRAINT learning_plan_activities_catalog_version_check;
ALTER TABLE learning_plan_activities ADD CHECK(catalog_version IN ('plan-catalog-v1','plan-catalog-v2'));
