export interface CouponRow {
  id: string;
  code: string;
  percent_off: number;
  label: string | null;
  valid_from: string | null;
  valid_until: string | null;
  max_redemptions: number | null;
  redemptions: number;
  active: boolean;
}

export interface CouponPreview {
  id: string;
  code: string;
  percentOff: number;
  label: string | null;
}

export interface AppliedCoupon {
  id: string;
  code: string;
  percentOff: number;
  discountClp: number;
  finalAmountClp: number;
}
