import QRCode from 'qrcode';

export function generateQrDataUrl(value) {
  return QRCode.toDataURL(value, { width: 260, margin: 1, color: { dark: '#111827', light: '#ffffff' } });
}
