-- Rename issues_identified to conditions_noted in maintenance_logs
ALTER TABLE maintenance_logs RENAME COLUMN issues_identified TO conditions_noted;

-- Rename notify_emails to notify_personnel in inspections
ALTER TABLE inspections RENAME COLUMN notify_emails TO notify_personnel;

-- Migrate existing 'pending' inspection status to 'scheduled'
UPDATE inspections SET status = 'scheduled' WHERE status = 'pending';
