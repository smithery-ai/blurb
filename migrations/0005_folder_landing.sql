-- Add optional landing page fields to folders
ALTER TABLE folders ADD COLUMN description TEXT;
ALTER TABLE folders ADD COLUMN command TEXT;
