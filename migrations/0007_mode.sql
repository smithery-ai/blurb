-- Unix-style permission mode for folders.
-- Two octal digits: owner (u) + public (o).
-- Bits: 4=read, 2=comment, 1=write.
-- Default '76' = owner has all, public can read+comment.
ALTER TABLE folders ADD COLUMN mode TEXT NOT NULL DEFAULT '76' CHECK (mode GLOB '[0-7][0-7]');
