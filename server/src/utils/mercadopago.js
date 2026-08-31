import { MercadoPagoConfig, Preference, Payment, PaymentRefund, OAuth } from 'mercadopago';

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
const clientId = process.env.MERCADOPAGO_CLIENT_ID;
const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET;
const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';
const oauthRedirectUri = `${publicBaseUrl}/api/payments/mp/callback`;

const platformClient = accessToken ? new MercadoPagoConfig({ accessToken }) : null;

export function isPaymentsConfigured() {
  return Boolean(platformClient);
}

export function isMarketplaceConfigured() {
  return Boolean(platformClient && clientId && clientSecret);
}

export function getOAuthAuthorizationUrl(state) {
  if (!isMarketplaceConfigured()) {
    throw new Error('Conexão com organizadores não configurada no servidor.');
  }
  const oauth = new OAuth(platformClient);
  // O SDK devolve a URL como string direta, apesar do tipo declarado sugerir { authorization_url }.
  return oauth.getAuthorizationURL({
    options: { client_id: clientId, redirect_uri: oauthRedirectUri, state },
  });
}

export async function exchangeOAuthCode(code) {
  if (!isMarketplaceConfigured()) {
    throw new Error('Conexão com organizadores não configurada no servidor.');
  }
  const oauth = new OAuth(platformClient);
  return oauth.create({
    body: {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: oauthRedirectUri,
    },
  });
}

export async function createPaymentPreference({
  ticketId,
  title,
  unitPrice,
  quantity,
  payerEmail,
  sellerAccessToken,
  marketplaceFee,
}) {
  if (!sellerAccessToken) {
    throw new Error('Organizador não conectou uma conta de pagamento.');
  }
  const sellerClient = new MercadoPagoConfig({ accessToken: sellerAccessToken });
  const preference = new Preference(sellerClient);

  const response = await preference.create({
    body: {
      items: [
        {
          id: ticketId,
          title,
          quantity,
          unit_price: unitPrice,
          currency_id: 'BRL',
        },
      ],
      payer: payerEmail ? { email: payerEmail } : undefined,
      external_reference: ticketId,
      marketplace_fee: marketplaceFee,
      back_urls: {
        success: `${publicBaseUrl}/payment/success`,
        failure: `${publicBaseUrl}/payment/failure`,
        pending: `${publicBaseUrl}/payment/pending`,
      },
      auto_return: 'approved',
      notification_url: `${publicBaseUrl}/api/payments/webhook`,
    },
  });

  return {
    preferenceId: response.id,
    checkoutUrl: response.init_point ?? response.sandbox_init_point,
  };
}

export async function getPayment(paymentId) {
  if (!platformClient) {
    throw new Error('Pagamentos não configurados no servidor.');
  }
  const payment = new Payment(platformClient);
  return payment.get({ id: paymentId });
}

export async function refundPayment(paymentId, sellerAccessToken) {
  if (!sellerAccessToken) {
    throw new Error('Organizador não conectou uma conta de pagamento.');
  }
  const sellerClient = new MercadoPagoConfig({ accessToken: sellerAccessToken });
  const refund = new PaymentRefund(sellerClient);
  return refund.total({ payment_id: paymentId });
}
