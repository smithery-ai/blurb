-- Add webhook URL to folders for comment notifications
ALTER TABLE folders ADD COLUMN webhook_url TEXT;
