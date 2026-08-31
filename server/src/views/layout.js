export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function pageLayout(title, bodyHtml) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — Rolê</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #F9FAFB;
      color: #111827;
    }
    .header {
      background: #7C3AED;
      color: #fff;
      padding: 28px 20px;
      text-align: center;
      border-bottom-left-radius: 24px;
      border-bottom-right-radius: 24px;
    }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
    .container {
      max-width: 480px;
      margin: 0 auto;
      padding: 20px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      border: 1px solid #F0F0F0;
      padding: 20px;
      margin-top: -20px;
    }
    label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin: 16px 0 6px; }
    input, select {
      width: 100%;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid #E5E7EB;
      font-size: 15px;
      color: #111827;
    }
    button {
      width: 100%;
      background: #7C3AED;
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 14px;
      font-size: 15px;
      font-weight: 700;
      margin-top: 20px;
      cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: default; }
    .error { color: #DC2626; font-size: 13px; margin-top: 10px; }
    .success { color: #059669; font-size: 13px; margin-top: 10px; }
    .muted { color: #6B7280; font-size: 13px; }
    img.event-image { width: 100%; border-radius: 12px; display: block; }
    .qr-box { text-align: center; padding: 20px 0; }
    .code { font-size: 22px; font-weight: 800; letter-spacing: 4px; text-align: center; color: #111827; }
  </style>
</head>
<body>
  <div class="header"><h1>🎟️ Rolê</h1></div>
  <div class="container">${bodyHtml}</div>
</body>
</html>`;
}
