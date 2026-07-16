// PayPay for Developers API クライアント（Deno / Edge Function 用）
// =====================================================
// PayPay 公式ドキュメントに準拠した HMAC-SHA256 署名を付けてリクエストを送る。
// https://developer.paypay.ne.jp/products/docs/webcashier
//
// 必要な環境変数（Supabase Edge Function secrets）:
//   PAYPAY_API_KEY         - APIキー
//   PAYPAY_API_SECRET      - APIシークレット
//   PAYPAY_MERCHANT_ID     - 加盟店ID
//   PAYPAY_ENV             - "sandbox" | "production"  (デフォルト: sandbox)
//   APP_REDIRECT_URL       - 決済完了後に顧客を戻すディープリンク（例: moveact://shop/orders）

import { crypto as stdCrypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

type PayPayEnv = 'sandbox' | 'production';

function getBaseUrl(env: PayPayEnv): string {
  return env === 'production'
    ? 'https://api.paypay.ne.jp'
    : 'https://stg-api.sandbox.paypay.ne.jp';
}

function getConfig() {
  const apiKey = Deno.env.get('PAYPAY_API_KEY');
  const apiSecret = Deno.env.get('PAYPAY_API_SECRET');
  const merchantId = Deno.env.get('PAYPAY_MERCHANT_ID');
  const env = (Deno.env.get('PAYPAY_ENV') ?? 'sandbox') as PayPayEnv;

  if (!apiKey || !apiSecret || !merchantId) {
    throw new Error(
      'PayPay API credentials are not set. Please set PAYPAY_API_KEY, PAYPAY_API_SECRET, PAYPAY_MERCHANT_ID.',
    );
  }
  return { apiKey, apiSecret, merchantId, env, baseUrl: getBaseUrl(env) };
}

// ------------ MD5 / HMAC helpers ------------

async function md5Base64(body: string, contentType: string): Promise<string> {
  // PayPay仕様: MD5(content-type + body) を Base64 エンコード
  const data = new TextEncoder().encode(contentType + body);
  const digest = await stdCrypto.subtle.digest('MD5', data);
  return encodeBase64(new Uint8Array(digest));
}

async function hmacSha256Base64(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return encodeBase64(new Uint8Array(signature));
}

// ------------ Request signer ------------

async function buildAuthHeader(
  method: string,
  path: string,
  body: string | null,
): Promise<string> {
  const { apiKey, apiSecret } = getConfig();
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const epoch = Math.floor(Date.now() / 1000).toString();
  const contentType = 'application/json';

  const hash = body && body.length > 0 ? await md5Base64(body, contentType) : 'empty';

  // 署名対象文字列: path\nmethod\nnonce\nepoch\ncontent-type\nhash
  const signatureRaw = [path, method, nonce, epoch, contentType, hash].join('\n');
  const signature = await hmacSha256Base64(signatureRaw, apiSecret);

  const authList = [
    'hmac OPA-Auth',
    apiKey,
    signature,
    nonce,
    epoch,
    hash,
  ].join(':');

  return authList;
}

// ------------ Public API ------------

export interface CreateQrCodePayload {
  merchantPaymentId: string;
  amount: number;
  codeType?: 'ORDER_QR' | 'ORDER_BARCODE';
  orderDescription?: string;
  orderItems?: Array<{
    name: string;
    category?: string;
    quantity: number;
    productId?: string;
    unitPrice: { amount: number; currency: 'JPY' };
  }>;
  redirectUrl?: string;
  redirectType?: 'WEB_LINK' | 'APP_DEEP_LINK';
  userAgent?: string;
  storeInfo?: string;
  storeId?: string;
  terminalId?: string;
  requestedAt?: number;
  expiresAt?: number; // unix seconds
  isAuthorization?: boolean;
}

export interface CreateQrCodeResponse {
  resultInfo: {
    code: string;
    message: string;
    codeId: string;
  };
  data?: {
    codeId: string;
    url: string;
    deeplink: string;
    expiryDate: number;
    merchantPaymentId: string;
    amount: { amount: number; currency: string };
    orderDescription?: string;
    isAuthorization: boolean;
  };
}

/**
 * PayPay QRコード決済リンクを作成する。
 * 返却される `url`（ブラウザ向け）と `deeplink`（PayPayアプリ向け）のうち、
 * 本アプリでは `url` を products.paypay_url に保存する。
 */
export async function createPayPayQrCode(
  payload: CreateQrCodePayload,
): Promise<CreateQrCodeResponse> {
  const { baseUrl, merchantId } = getConfig();
  const path = '/v2/codes';
  const url = `${baseUrl}${path}`;

  const fullPayload = {
    codeType: 'ORDER_QR',
    requestedAt: Math.floor(Date.now() / 1000),
    ...payload,
    amount: { amount: payload.amount, currency: 'JPY' },
  };

  const body = JSON.stringify(fullPayload);
  const authHeader = await buildAuthHeader('POST', path, body);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      'X-ASSUME-MERCHANT': merchantId,
    },
    body,
  });

  const json = (await res.json()) as CreateQrCodeResponse;
  return json;
}

/**
 * 発行済みのQRコード決済リンクを削除する。
 */
export async function deletePayPayQrCode(codeId: string): Promise<unknown> {
  const { baseUrl, merchantId } = getConfig();
  const path = `/v2/codes/${codeId}`;
  const url = `${baseUrl}${path}`;

  const authHeader = await buildAuthHeader('DELETE', path, null);

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': authHeader,
      'X-ASSUME-MERCHANT': merchantId,
    },
  });

  return res.json();
}

/**
 * 決済詳細を取得する（webhook受信後に二重確認したいときに使用）。
 */
export async function getPayPayPaymentDetails(merchantPaymentId: string): Promise<unknown> {
  const { baseUrl, merchantId } = getConfig();
  const path = `/v2/codes/payments/${merchantPaymentId}`;
  const url = `${baseUrl}${path}`;

  const authHeader = await buildAuthHeader('GET', path, null);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'X-ASSUME-MERCHANT': merchantId,
    },
  });

  return res.json();
}
