-- Add per-folder write token (SHA-256 hash stored; plaintext returned once on creation)
ALTER TABLE folders ADD COLUMN token_hash TEXT;
