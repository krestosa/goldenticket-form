(() => {
  "use strict";

  const CONFIG = window.GOLDEN_TICKET_CONFIG;
  if (!CONFIG) {
    console.error("GOLDEN_TICKET_CONFIG no está cargado.");
    return;
  }

  const elements = {
    form: document.getElementById("claimForm"),
    email: document.getElementById("claimEmail"),
    error: document.getElementById("claimError"),
    modal: document.getElementById("codeModal"),
    panel: document.querySelector(".code-modal__panel"),
    backdrop: document.querySelector(".code-modal__backdrop"),
    dragHandle: document.querySelector("[data-sheet-drag-handle]"),
    code: document.getElementById("generatedCode"),
    emailLabel: document.getElementById("generatedEmail"),
    status: document.getElementById("codeStatus"),
    copy: document.getElementById("copyCode"),
    pdf: document.getElementById("downloadPdf"),
    close: Array.from(document.querySelectorAll("[data-close-modal]"))
  };

  if (
    !elements.form ||
    !elements.email ||
    !elements.modal ||
    !elements.panel ||
    !elements.backdrop ||
    !elements.code ||
    !elements.emailLabel ||
    !elements.copy ||
    !elements.pdf
  ) {
    return;
  }

  const state = {
    code: "",
    email: "",
    previousFocus: null,
    copyFeedbackTimer: null,
    copyFadeTimer: null
  };


  /* -----------------------------
   * Backend adapter
   * ----------------------------- */

  const getByPath = (object, path) => {
    if (!path) return object;

    return String(path)
      .split(".")
      .reduce((value, key) => value?.[key], object);
  };

  const validateCode = (value) => {
    const code = String(value ?? "").trim().toUpperCase();
    const pattern = new RegExp(CONFIG.code.pattern);

    if (code.length !== CONFIG.code.length || !pattern.test(code)) {
      throw new Error("La API devolvió un código inválido.");
    }

    return code;
  };

  const requestApiCode = async (email) => {
    const backend = CONFIG.backend;

    if (!backend.endpoint) {
      throw new Error("Falta configurar GOLDEN_TICKET_CONFIG.backend.endpoint.");
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      backend.timeoutMs
    );

    try {
      const method = String(backend.method || "POST").toUpperCase();
      let url = backend.endpoint;

      const options = {
        method,
        headers: backend.headers || {},
        signal: controller.signal
      };

      if (method === "GET" || method === "HEAD") {
        const parsed = new URL(url, window.location.href);
        parsed.searchParams.set(backend.emailField, email);
        url = parsed.toString();
      } else {
        options.body = JSON.stringify({
          [backend.emailField]: email
        });
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
      }

      const payload = await response.json();
      const code = validateCode(getByPath(payload, backend.codePath));

      return { code, email, payload };
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const generateCode = async (email) => {
    if (CONFIG.backend.mode === "mock") {
      return {
        code: validateCode(CONFIG.mock.code),
        email,
        payload: null
      };
    }

    return requestApiCode(email);
  };

  window.GoldenTicketBackend = Object.freeze({
    config: CONFIG.backend,
    generateCode
  });


  /* -----------------------------
   * Modal
   * ----------------------------- */

  const openModal = () => {
    state.previousFocus = document.activeElement;
    elements.modal.style.removeProperty("--sheet-drag-y");
    elements.modal.style.removeProperty("--sheet-scrim-opacity");
    elements.panel.style.removeProperty("transform");
    elements.backdrop.style.removeProperty("opacity");
    elements.modal.classList.remove("is-dragging", "is-open");
    elements.modal.hidden = false;
    document.body.classList.add("has-open-modal");

    const focusCopy = () => {
      if (elements.modal.classList.contains("is-open")) {
        elements.copy.focus({ preventScroll: true });
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        elements.modal.classList.add("is-open");

        if (mobileSheet.matches) {
          window.setTimeout(focusCopy, CONFIG.ui.modalTransitionMs);
        } else {
          focusCopy();
        }
      });
    });
  };

  const closeModal = () => {
    elements.modal.classList.remove("is-open");
    document.body.classList.remove("has-open-modal");

    window.setTimeout(() => {
      elements.modal.hidden = true;
      elements.modal.classList.remove("is-dragging");
      elements.modal.style.removeProperty("--sheet-drag-y");
      elements.modal.style.removeProperty("--sheet-scrim-opacity");
      elements.panel.style.removeProperty("transform");
      elements.backdrop.style.removeProperty("opacity");

      if (state.previousFocus instanceof HTMLElement) {
        state.previousFocus.focus();
      }
    }, CONFIG.ui.modalTransitionMs);
  };


  /* -----------------------------
   * Mobile bottom-sheet gesture
   * ----------------------------- */

  const mobileSheet = window.matchMedia("(max-width: 760px)");

  const drag = {
    active: false,
    pointerId: null,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    velocityY: 0,
    distance: 0,
    height: 1,
    pendingDistance: 0,
    rafId: 0
  };

  const setSheetDrag = (distance) => {
    const clamped = Math.max(0, distance);
    const progress = Math.min(clamped / Math.max(drag.height, 1), 1);
    const scrimOpacity = Math.max(0, 1 - progress * 1.35);

    drag.distance = clamped;
    elements.panel.style.transform = `translate3d(0, ${clamped}px, 0)`;
    elements.backdrop.style.opacity = String(scrimOpacity);
  };

  const scheduleSheetDrag = (distance) => {
    drag.pendingDistance = distance;

    if (drag.rafId) return;

    drag.rafId = requestAnimationFrame(() => {
      drag.rafId = 0;
      setSheetDrag(drag.pendingDistance);
    });
  };

  const flushSheetDrag = () => {
    if (!drag.rafId) return;

    cancelAnimationFrame(drag.rafId);
    drag.rafId = 0;
    setSheetDrag(drag.pendingDistance);
  };

  const resetSheetDrag = () => {
    if (drag.rafId) {
      cancelAnimationFrame(drag.rafId);
      drag.rafId = 0;
    }

    drag.pendingDistance = 0;
    elements.modal.classList.remove("is-dragging");
    elements.panel.style.removeProperty("transform");
    elements.backdrop.style.removeProperty("opacity");
  };

  const finishSheetDrag = (shouldClose) => {
    drag.active = false;

    if (
      drag.pointerId !== null &&
      elements.dragHandle?.hasPointerCapture?.(drag.pointerId)
    ) {
      elements.dragHandle.releasePointerCapture(drag.pointerId);
    }

    drag.pointerId = null;

    if (drag.rafId) {
      cancelAnimationFrame(drag.rafId);
      drag.rafId = 0;
    }

    elements.modal.classList.remove("is-dragging");

    if (shouldClose) {
      elements.panel.style.removeProperty("transform");
      elements.backdrop.style.removeProperty("opacity");
      closeModal();
    } else {
      resetSheetDrag();
    }
  };

  const onSheetPointerDown = (event) => {
    if (
      !mobileSheet.matches ||
      elements.modal.hidden ||
      !elements.modal.classList.contains("is-open") ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return;
    }

    drag.active = true;
    drag.pointerId = event.pointerId;
    drag.startY = event.clientY;
    drag.lastY = event.clientY;
    drag.lastTime = performance.now();
    drag.velocityY = 0;
    drag.distance = 0;
    drag.pendingDistance = 0;
    drag.height = Math.max(elements.panel.getBoundingClientRect().height, 1);

    if (drag.rafId) {
      cancelAnimationFrame(drag.rafId);
      drag.rafId = 0;
    }

    elements.modal.classList.add("is-dragging");
    elements.dragHandle.setPointerCapture(event.pointerId);
  };

  const onSheetPointerMove = (event) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;

    const now = performance.now();
    const deltaY = Math.max(0, event.clientY - drag.startY);
    const frameDelta = event.clientY - drag.lastY;
    const frameTime = Math.max(now - drag.lastTime, 1);

    drag.velocityY = frameDelta / frameTime;
    drag.lastY = event.clientY;
    drag.lastTime = now;

    scheduleSheetDrag(deltaY);
  };

  const onSheetPointerUp = (event) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;

    flushSheetDrag();

    const threshold = Math.min(
      140,
      Math.max(96, drag.height * .28)
    );

    const shouldClose =
      drag.distance >= threshold ||
      (drag.distance > 36 && drag.velocityY >= .65);

    finishSheetDrag(shouldClose);
  };

  const onSheetPointerCancel = (event) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    finishSheetDrag(false);
  };

  elements.dragHandle?.addEventListener("pointerdown", onSheetPointerDown);
  elements.dragHandle?.addEventListener("pointermove", onSheetPointerMove);
  elements.dragHandle?.addEventListener("pointerup", onSheetPointerUp);
  elements.dragHandle?.addEventListener("pointercancel", onSheetPointerCancel);


  /* -----------------------------
   * Clipboard feedback
   * ----------------------------- */

  const fallbackCopy = (text) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  const setCodeMarkup = () => {
    elements.code.classList.remove("is-copied");
    elements.code.setAttribute("aria-label", "Copiar código");
    elements.code.textContent = state.code || CONFIG.mock.code;
  };

  const setCopiedMarkup = () => {
    elements.code.classList.add("is-copied");
    elements.code.setAttribute("aria-label", "Código copiado");
    elements.code.innerHTML =
      '<span class="material-symbols-outlined code-modal__copied-icon" aria-hidden="true">check_circle</span>' +
      '<span class="code-modal__copied-text">CÓDIGO COPIADO</span>';
  };

  const fadeSwap = (render) => {
    window.clearTimeout(state.copyFadeTimer);
    elements.code.classList.add("is-fading");

    state.copyFadeTimer = window.setTimeout(() => {
      render();
      requestAnimationFrame(() => elements.code.classList.remove("is-fading"));
    }, CONFIG.ui.fadeMs);
  };

  const restoreCodeState = () => {
    window.clearTimeout(state.copyFeedbackTimer);
    window.clearTimeout(state.copyFadeTimer);
    elements.code.classList.remove("is-fading");
    setCodeMarkup();
  };

  const showCopiedState = () => {
    window.clearTimeout(state.copyFeedbackTimer);
    fadeSwap(setCopiedMarkup);

    state.copyFeedbackTimer = window.setTimeout(() => {
      fadeSwap(setCodeMarkup);
    }, CONFIG.ui.copyFeedbackMs);
  };

  const copyCode = async () => {
    if (!state.code) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(state.code);
      } else {
        fallbackCopy(state.code);
      }
    } catch {
      fallbackCopy(state.code);
    }

    showCopiedState();
  };


  /* -----------------------------
   * PDF
   * ----------------------------- */

  const loadDataImage = (src) => new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => resolve(null), { once: true });
    image.src = src;
  });

  const canvasToJpegBytes = (canvas, quality = .94) => new Promise((resolve, reject) => {
    const fromDataUrl = () => {
      try {
        const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }

        resolve(bytes);
      } catch (error) {
        reject(error);
      }
    };

    if (typeof canvas.toBlob !== "function") {
      fromDataUrl();
      return;
    }

    canvas.toBlob(async (blob) => {
      if (!blob) {
        fromDataUrl();
        return;
      }

      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/jpeg", quality);
  });

  const imageToPdfJpeg = async (src, width) => {
    const image = await loadDataImage(src);
    const ratio = image
      ? image.naturalHeight / Math.max(image.naturalWidth, 1)
      : .25;

    const height = Math.max(2, Math.round(width * ratio));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas no disponible.");
    }

    canvas.width = width;
    canvas.height = height;

    context.fillStyle = "#090b0f";
    context.fillRect(0, 0, width, height);

    if (image) {
      context.drawImage(image, 0, 0, width, height);
    }

    return {
      bytes: await canvasToJpegBytes(canvas, .96),
      width,
      height
    };
  };

  const pdfLiteral = (value) => {
    const input = String(value ?? "");
    let output = "";

    for (const character of input) {
      const codePoint = character.codePointAt(0);

      if (character === "\\" || character === "(" || character === ")") {
        output += "\\" + character;
      } else if (codePoint >= 32 && codePoint <= 126) {
        output += character;
      } else if (codePoint >= 160 && codePoint <= 255) {
        output += "\\" + codePoint.toString(8).padStart(3, "0");
      } else {
        output += "?";
      }
    }

    return output;
  };

  const buildSelectablePdf = (code, email, sushiAsset, anniversaryAsset) => {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let byteLength = 0;

    const pushBytes = (bytes) => {
      chunks.push(bytes);
      byteLength += bytes.length;
    };

    const pushText = (value) => pushBytes(encoder.encode(value));

    const startObject = (number) => {
      offsets[number] = byteLength;
      pushText(number + " 0 obj\n");
    };

    const endObject = () => pushText("endobj\n");

    const content = [
      "q",
      "0.035 0.043 0.059 rg",
      "0 0 360 500 re f",
      "Q",

      "q",
      "64 0 0 9.3 28 460 cm",
      "/Im1 Do",
      "Q",

      "q",
      "21 0 0 16.1 311 456 cm",
      "/Im2 Do",
      "Q",

      "BT",
      "/F2 15 Tf",
      "0.72 0.74 0.77 rg",
      "28 414 Td",
      "(" + pdfLiteral("GOLDEN TICKET") + ") Tj",
      "ET",

      "BT",
      "/F2 10 Tf",
      "0.776 0.58 0.329 rg",
      "28 380 Td",
      "(" + pdfLiteral("CÓDIGO DE ÚNICO USO") + ") Tj",
      "ET",

      "BT",
      "/F2 62 Tf",
      "1 1 1 rg",
      "28 308 Td",
      "(" + pdfLiteral(code) + ") Tj",
      "ET",

      "BT",
      "/F1 10 Tf",
      "0.72 0.74 0.77 rg",
      "28 264 Td",
      "(" + pdfLiteral("Guardalo para tu canje. Se utiliza una sola vez.") + ") Tj",
      "ET",

      ...(email ? [
        "BT",
        "/F1 9 Tf",
        "0.58 0.60 0.63 rg",
        "28 238 Td",
        "(" + pdfLiteral(email) + ") Tj",
        "ET"
      ] : [])
    ].join("\n");

    pushText("%PDF-1.4\n%PDFGEN\n");

    startObject(1);
    pushText("<< /Type /Catalog /Pages 2 0 R >>\n");
    endObject();

    startObject(2);
    pushText("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
    endObject();

    startObject(3);
    pushText(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 500]" +
      " /Resources <<" +
      " /XObject << /Im1 4 0 R /Im2 5 0 R >>" +
      " /Font << /F1 6 0 R /F2 7 0 R >>" +
      " >> /Contents 8 0 R >>\n"
    );
    endObject();

    startObject(4);
    pushText(
      "<< /Type /XObject /Subtype /Image" +
      " /Width " + sushiAsset.width +
      " /Height " + sushiAsset.height +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8" +
      " /Filter /DCTDecode /Length " + sushiAsset.bytes.length +
      " >>\nstream\n"
    );
    pushBytes(sushiAsset.bytes);
    pushText("\nendstream\n");
    endObject();

    startObject(5);
    pushText(
      "<< /Type /XObject /Subtype /Image" +
      " /Width " + anniversaryAsset.width +
      " /Height " + anniversaryAsset.height +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8" +
      " /Filter /DCTDecode /Length " + anniversaryAsset.bytes.length +
      " >>\nstream\n"
    );
    pushBytes(anniversaryAsset.bytes);
    pushText("\nendstream\n");
    endObject();

    startObject(6);
    pushText(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica" +
      " /Encoding /WinAnsiEncoding >>\n"
    );
    endObject();

    startObject(7);
    pushText(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold" +
      " /Encoding /WinAnsiEncoding >>\n"
    );
    endObject();

    startObject(8);
    pushText("<< /Length " + encoder.encode(content).length + " >>\nstream\n");
    pushText(content);
    pushText("\nendstream\n");
    endObject();

    const xrefOffset = byteLength;

    pushText("xref\n0 9\n");
    pushText("0000000000 65535 f \n");

    for (let index = 1; index <= 8; index += 1) {
      pushText(String(offsets[index]).padStart(10, "0") + " 00000 n \n");
    }

    pushText("trailer\n<< /Size 9 /Root 1 0 R >>\n");
    pushText("startxref\n" + xrefOffset + "\n%%EOF");

    return new Blob(chunks, { type: "application/pdf" });
  };

  const buildPdfBlob = async () => {
    const assets = window.GoldenTicketAssets || {};

    const [sushiAsset, anniversaryAsset] = await Promise.all([
      imageToPdfJpeg(assets.sushiLogo, 900),
      imageToPdfJpeg(assets.anniversaryLogo, 420)
    ]);

    return buildSelectablePdf(
      state.code,
      state.email,
      sushiAsset,
      anniversaryAsset
    );
  };

  const getPdfFilename = () =>
    CONFIG.pdf.filename.replace("{code}", state.code);

  const openPdf = async () => {
    if (!state.code) return;

    const previewWindow = window.open("", "_blank");
    elements.pdf.disabled = true;
    elements.status.textContent = "";

    if (previewWindow) {
      previewWindow.document.write(
        '<!doctype html><title>Generando PDF...</title>' +
        '<body style="margin:0;background:#111;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;height:100vh">Generando PDF...</body>'
      );
    }

    try {
      const blob = await buildPdfBlob();
      const url = URL.createObjectURL(blob);

      if (previewWindow && !previewWindow.closed) {
        previewWindow.document.title = getPdfFilename();
        previewWindow.location.replace(url);
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }

      elements.status.textContent = "PDF generado.";
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }

      elements.status.textContent = "No se pudo generar el PDF.";
      console.error(error);
    } finally {
      elements.pdf.disabled = false;
    }
  };


  /* -----------------------------
   * Form
   * ----------------------------- */

  const submitForm = async (event) => {
    event.preventDefault();

    elements.error.textContent = "";
    elements.status.textContent = "";

    const email = elements.email.value.trim();

    if (!email || !elements.email.checkValidity()) {
      elements.error.textContent = "Ingresá un correo válido.";
      elements.email.focus();
      return;
    }

    const submitButton = elements.form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const result = await generateCode(email);

      state.code = result.code;
      state.email = email;

      restoreCodeState();
      elements.emailLabel.textContent = state.email;
      openModal();
    } catch (error) {
      elements.error.textContent = "No pudimos generar el código. Intentá nuevamente.";
      console.error(error);
    } finally {
      submitButton.disabled = false;
    }
  };


  /* -----------------------------
   * Events
   * ----------------------------- */

  elements.form.addEventListener("submit", submitForm);
  elements.copy.addEventListener("click", copyCode);
  elements.code.addEventListener("click", copyCode);
  elements.pdf.addEventListener("click", openPdf);

  elements.close.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.modal.hidden) {
      closeModal();
    }
  });
})();
