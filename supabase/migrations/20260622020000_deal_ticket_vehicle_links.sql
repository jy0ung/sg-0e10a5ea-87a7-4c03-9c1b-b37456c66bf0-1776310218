-- Cross-module linking: deals ↔ vehicles, tickets ↔ deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);
CREATE INDEX IF NOT EXISTS idx_deals_vehicle ON deals(vehicle_id) WHERE vehicle_id IS NOT NULL;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id);
CREATE INDEX IF NOT EXISTS idx_tickets_deal ON tickets(deal_id) WHERE deal_id IS NOT NULL;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS chassis_no TEXT;
