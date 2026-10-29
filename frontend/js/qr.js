// qr.js - Dedicated Public QR Code Generator for AgriTrace OS
import QRCode from 'qrcode';

export const PUBLIC_VERIFICATION_DOMAIN = 'https://frontend-tau-three-20.vercel.app';

/**
 * Returns the public HTTPS verification URL for a crop consignment.
 * Example: https://frontend-tau-three-20.vercel.app/consumer.html?batch=BATCH-2026-00017
 * Also supports ?crop_id=X and ?chain_id=X for explicit fallback resolution.
 */
export function getConsumerTraceUrl(target, options = {}) {
  let paramKey = 'batch';
  let paramVal = '';

  if (target && typeof target === 'object') {
    if (target.batch_number) {
      paramKey = 'batch';
      paramVal = target.batch_number;
    } else if (target.blockchain_crop_id) {
      paramKey = 'chain_id';
      paramVal = String(target.blockchain_crop_id);
    } else if (target.crop_id) {
      paramKey = 'crop_id';
      paramVal = String(target.crop_id);
    }
  } else {
    const raw = String(target || '').trim();
    if (/^[A-Za-z0-9_-]{3,32}$/.test(raw) && !/^\d+$/.test(raw)) {
      paramKey = 'batch';
      paramVal = raw;
    } else if (/^\d+$/.test(raw)) {
      paramKey = 'crop_id';
      paramVal = raw;
    } else {
      paramKey = 'batch';
      paramVal = raw;
    }
  }

  // Base domain: Only use local origin if specifically requested for local testing
  const baseDomain = options.useLocalOrigin
    ? (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:5173')
    : PUBLIC_VERIFICATION_DOMAIN;

  return `${baseDomain}/consumer.html?${paramKey}=${encodeURIComponent(paramVal)}`;
}

/**
 * Renders a scannable QR Code onto a canvas element.
 * Defaults to the production public HTTPS verification URL.
 */
export async function renderQRCode(canvasElement, target, options = {}) {
  if (!canvasElement) return '';
  const url = getConsumerTraceUrl(target, options);

  try {
    await QRCode.toCanvas(canvasElement, url, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
    return url;
  } catch (err) {
    console.error('Failed to render QR Code:', err);
    throw err;
  }
}
