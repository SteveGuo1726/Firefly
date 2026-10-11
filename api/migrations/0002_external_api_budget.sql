CREATE TABLE IF NOT EXISTS external_api_budget (source TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0 CHECK(calls>=0), PRIMARY KEY(source,day));
INSERT OR IGNORE INTO schema_migrations(version) VALUES (2);
