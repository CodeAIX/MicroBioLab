ALTER TABLE experiments ADD COLUMN display_order integer;

WITH ordered AS (
  SELECT id, (row_number() OVER (ORDER BY created_at, id) * 10)::integer AS position
  FROM experiments
)
UPDATE experiments
SET display_order = ordered.position
FROM ordered
WHERE experiments.id = ordered.id;

ALTER TABLE experiments ALTER COLUMN display_order SET DEFAULT 0;
ALTER TABLE experiments ALTER COLUMN display_order SET NOT NULL;
CREATE INDEX experiments_public_order_idx ON experiments(status, display_order, created_at);
