ALTER TABLE public.dashboard_preferences
ADD COLUMN IF NOT EXISTS personal_dashboard JSONB NOT NULL DEFAULT
'{
  "widgets": [
    { "id": "snapshot", "type": "section", "enabled": true },
    { "id": "scorecards", "type": "section", "enabled": true },
    {
      "id": "custom-slowest-delivery-branch",
      "type": "custom-metric",
      "enabled": true,
      "title": "Slowest Delivery Branch",
      "metricId": "slowest_delivery_branch"
    },
    {
      "id": "custom-highest-booking-branch",
      "type": "custom-metric",
      "enabled": true,
      "title": "Highest Booking Branch",
      "metricId": "highest_booking_branch"
    },
    { "id": "kpi-analytics", "type": "section", "enabled": true },
    { "id": "branch-comparison", "type": "section", "enabled": true }
  ]
}'::jsonb;

UPDATE public.dashboard_preferences
SET personal_dashboard = '{
  "widgets": [
    { "id": "snapshot", "type": "section", "enabled": true },
    { "id": "scorecards", "type": "section", "enabled": true },
    {
      "id": "custom-slowest-delivery-branch",
      "type": "custom-metric",
      "enabled": true,
      "title": "Slowest Delivery Branch",
      "metricId": "slowest_delivery_branch"
    },
    {
      "id": "custom-highest-booking-branch",
      "type": "custom-metric",
      "enabled": true,
      "title": "Highest Booking Branch",
      "metricId": "highest_booking_branch"
    },
    { "id": "kpi-analytics", "type": "section", "enabled": true },
    { "id": "branch-comparison", "type": "section", "enabled": true }
  ]
}'::jsonb
WHERE personal_dashboard IS NULL
   OR personal_dashboard = '{}'::jsonb;
