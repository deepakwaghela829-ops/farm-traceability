// qr.js - QR Code Generator for AgriTrace OS
import QRCode from 'qrcode';

export function getConsumerTraceUrl(cropId) {
  const origin = window.location.origin;
  const path = window.location.pathname.replace(/\/index\.html$/, '');
  return `${origin}${path}#/consumer/trace/${cropId}`;
}

export async function renderQRCode(canvasElement, cropId) {
  if (!canvasElement) return;
  const url = getConsumerTraceUrl(cropId);

  try {
    await QRCode.toCanvas(canvasElement, url, {
      width: 220,
      margin: 2,
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
