CREATE TABLE batch_updates (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building','published')),
  item_count integer NOT NULL CHECK (item_count > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE batch_update_items (
  batch_id uuid NOT NULL REFERENCES batch_updates(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  version_id uuid UNIQUE REFERENCES experiment_versions(id) ON DELETE SET NULL,
  previous_active_version_id uuid,
  source_filename text NOT NULL,
  source_sha256 text NOT NULL,
  PRIMARY KEY (batch_id, experiment_id)
);

CREATE INDEX batch_updates_created_idx ON batch_updates(created_at DESC);
CREATE INDEX batch_update_items_experiment_idx ON batch_update_items(experiment_id);
