// Quanto tempo uma reserva fica segurando estoque/mesa enquanto o comprador não paga.
export const RESERVATION_TTL_MS = Number(process.env.RESERVATION_TTL_MINUTES || 30) * 60 * 1000;

// De quanto em quanto tempo o servidor procura reservas vencidas.
export const RESERVATION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
