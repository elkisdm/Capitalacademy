-- Add explicit RLS policies for payments and coupons tables
-- These tables are accessed exclusively via service_role from API routes,
-- but need policies to prevent silent failures if access patterns change.

-- Payments: only platform staff can read, service_role can do everything
CREATE POLICY payments_staff_select ON public.payments
  FOR SELECT USING (public.is_platform_staff());

CREATE POLICY payments_service_all ON public.payments
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::json ->> 'role') = 'service_role'
  );

-- Coupons: platform staff can read, service_role can manage
CREATE POLICY coupons_staff_select ON public.coupons
  FOR SELECT USING (public.is_platform_staff());

CREATE POLICY coupons_service_all ON public.coupons
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::json ->> 'role') = 'service_role'
  );
