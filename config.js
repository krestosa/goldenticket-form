window.GOLDEN_TICKET_CONFIG = Object.freeze({
  backend: {
    mode: "mock",
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
