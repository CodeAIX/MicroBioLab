CREATE TABLE experiment_knowledge_reviews (
  experiment_id uuid PRIMARY KEY REFERENCES experiments(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(content) > 0),
  source_filename text NOT NULL,
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
