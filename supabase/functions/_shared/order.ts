// Edge Function 共通の注文処理ヘルパー
// =====================================================
// クーポン検証・割引計算・在庫チェックなど、in_store / paypay フローで共通する処理。

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface ProductRow {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  available_in_store: boolean;
}

export interface CouponRow {
  id: string;
  user_id: string;
  is_used: boolean;
  applicable_to: string;
  discount_amount: number | null;
  discount_percent: number | null;
  valid_from: string;
  valid_until: string;
  reserved_for_order_id?: string | null;
  reserved_at?: string | null;
}

export interface ValidatedOrderInput {
  product: ProductRow;
  qty: number;
  subtotal: number;
  discountAmount: number;
  total: number;
  coupon: CouponRow | null;
}

/**
 * 入力検証 + 商品取得 + クーポン検証 + 金額再計算を一括で行う。
 * 失敗時は throw する。
 */
export async function validateOrderInput(
  client: SupabaseClient,
  userId: string,
  input: {
    productId?: string;
    quantity?: unknown;
    couponId?: string | null;
    requirePaypay?: boolean; // PayPay フローのとき stock チェック厳密化
  },
): Promise<ValidatedOrderInput> {
  if (!input.productId) {
    throw new OrderError('productId is required', 400);
  }

  // qty を厳密に検証
  const rawQty = Number(input.quantity ?? 1);
  if (!Number.isFinite(rawQty) || !Number.isInteger(rawQty) || rawQty < 1 || rawQty > 99) {
    throw new OrderError('quantity must be an integer between 1 and 99', 400);
  }
  const qty = rawQty;

  // 商品取得
  const { data: product, error: productErr } = await client
    .from('products')
    .select('id, name, price, stock_quantity, is_active, available_in_store')
    .eq('id', input.productId)
    .single();
  if (productErr || !product) {
    throw new OrderError('商品が見つかりません', 404);
  }
  if (!product.is_active) {
    throw new OrderError('商品が販売停止中です', 400);
  }

  // 在庫チェック（PayPay/in_store 両方で実行）
  if (product.stock_quantity < qty) {
    throw new OrderError(
      `在庫不足です（在庫: ${product.stock_quantity}、要求: ${qty}）`,
      409,
    );
  }

  const subtotal = product.price * qty;
  let discountAmount = 0;
  let coupon: CouponRow | null = null;

  // クーポン検証
  if (input.couponId) {
    const { data: c } = await client
      .from('coupons')
      .select('*')
      .eq('id', input.couponId)
      .eq('user_id', userId)
      .single();
    if (!c) {
      throw new OrderError('クーポンが見つかりません', 400);
    }
    coupon = c as CouponRow;
    if (coupon.is_used) {
      throw new OrderError('このクーポンは使用済みです', 400);
    }
    if (
      coupon.reserved_for_order_id &&
      coupon.reserved_at &&
      new Date(coupon.reserved_at).getTime() > Date.now() - 15 * 60 * 1000
    ) {
      // 15分以内に他の注文に予約されている
      throw new OrderError('このクーポンは別の決済で予約中です。完了後に再度お試しください', 409);
    }
    if (coupon.applicable_to !== 'all' && coupon.applicable_to !== 'shop') {
      throw new OrderError('このクーポンは物販では使用できません', 400);
    }
    const now = new Date();
    if (
      new Date(coupon.valid_from) > now ||
      new Date(coupon.valid_until) < now
    ) {
      throw new OrderError('クーポンの有効期限外です', 400);
    }

    // 割引計算（%優先、cap = discount_amount）
    let calc = 0;
    if (coupon.discount_percent) {
      calc = Math.floor((subtotal * coupon.discount_percent) / 100);
      if (coupon.discount_amount && calc > coupon.discount_amount) {
        calc = coupon.discount_amount;
      }
    } else if (coupon.discount_amount) {
      calc = coupon.discount_amount;
    }
    discountAmount = Math.min(calc, subtotal);
  }

  const total = subtotal - discountAmount;
  if (total < 1) {
    throw new OrderError(
      `決済金額が無効です（合計: ${total}円）。クーポン割引額が高すぎる可能性があります。`,
      400,
    );
  }

  return {
    product: product as ProductRow,
    qty,
    subtotal,
    discountAmount,
    total,
    coupon,
  };
}

/**
 * クーポンを order に予約する（is_used にはまだしない）
 */
export async function reserveCoupon(
  client: SupabaseClient,
  couponId: string,
  orderId: string,
): Promise<void> {
  const { error } = await client
    .from('coupons')
    .update({
      reserved_for_order_id: orderId,
      reserved_at: new Date().toISOString(),
    })
    .eq('id', couponId)
    .eq('is_used', false)
    .or('reserved_for_order_id.is.null,reserved_at.lt.' + new Date(Date.now() - 15 * 60 * 1000).toISOString());

  if (error) {
    throw new OrderError('クーポンの予約に失敗しました', 409);
  }
}

export class OrderError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
