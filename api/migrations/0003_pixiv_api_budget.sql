CREATE TABLE IF NOT EXISTS pixiv_api_budget (provider TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL CHECK(calls>=0), PRIMARY KEY(provider,day));
