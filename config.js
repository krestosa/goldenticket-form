/*
 * Golden Ticket — configuración de integración
 *
 * Para conectar backend:
 * 1. Cambiar backend.mode a "api".
 * 2. Definir backend.endpoint.
 * 3. Ajustar emailField y codePath si la API usa otros nombres.
 *
 * Request esperado por defecto:
 *   POST { "email": "persona@correo.com" }
 *
 * Response esperado por defecto:
 *   { "code": "ABC123" }
 */
window.GOLDEN_TICKET_CONFIG = Object.freeze({
  backend: {
    mode: "mock", // "mock" | "api"
    endpoint: "",
    method: "POST",
    emailField: "email",
    codePath: "code",
    timeoutMs: 10000,
    headers: {
      "Content-Type": "application/json"
    }
  },

  mock: {
    code: "GOLD25"
  },

  code: {
    length: 6,
    pattern: "^[A-Z0-9]{6}$"
  },

  ui: {
    copyFeedbackMs: 3500,
    fadeMs: 160,
    modalTransitionMs: 300
  },

  pdf: {
    filename: "golden-ticket-{code}.pdf"
  }
});
