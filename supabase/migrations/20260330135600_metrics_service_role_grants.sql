-- Metrics sync (Vercel cron + "Vernieuw cijfers") uses the Supabase service role.
-- RLS blocks direct table access; service_role needs explicit grants (see 20260330135500).
-- Draai na 20260330135500.

grant select, update on app.tenant_integrations to service_role;

grant select, insert, update, delete on app.tenant_metric_snapshots to service_role;
grant select, insert, update, delete on app.tenant_metric_daily to service_role;
grant select, insert, update, delete on app.tenant_performance_reports to service_role;

grant select on app.blog_concepts to service_role;
