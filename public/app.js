// ChatCart chat frontend (vanilla JS, no frameworks).
// Talks to GET /api/health and POST /api/chat.

(function () {
  "use strict";

  var chatLog = document.getElementById("chatLog");
  var chipRow = document.getElementById("chipRow");
  var chatForm = document.getElementById("chatForm");
  var chatInput = document.getElementById("chatInput");
  var modeBadge = document.getElementById("modeBadge");

  var GREETING =
    "Namaste! 🙏 I'm the ChatCart agent for Marwar Crafts, Jodhpur. " +
    "I can show products, build your cart, take payment via PayPal, track orders, and handle refunds. " +
    "Try: “show me bedsheets”";
  var INITIAL_CHIPS = ["Show catalog", "Show me bedsheets", "My cart", "Checkout"];

  // --- helpers ---

  // Random session id, persisted in localStorage.
  function getSessionId() {
    var key = "chatcart_session";
    try {
      var existing = localStorage.getItem(key);
      if (existing) return existing;
      var fresh =
        Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(key, fresh);
      return fresh;
    } catch (e) {
      return "sess-" + Math.random().toString(36).slice(2, 10);
    }
  }
  var sessionId = getSessionId();

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Escape HTML, then **bold**, then newlines.
  function formatReply(text) {
    var esc = escapeHtml(text || "");
    esc = esc.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    esc = esc.replace(/\n/g, "<br>");
    return esc;
  }

  // Format money as plain text (button labels use textContent, so no HTML escaping needed).
  function fmtMoneyText(amount, currency) {
    var n = Number(amount);
    if (!isFinite(n)) n = 0;
    var cur = currency || "USD";
    if (cur === "USD") return "$" + n.toFixed(2);
    return n.toFixed(2) + " " + cur;
  }

  function nowTime() {
    var d = new Date();
    var h = String(d.getHours()).padStart(2, "0");
    var m = String(d.getMinutes()).padStart(2, "0");
    return h + ":" + m;
  }

  function scrollToBottom() {
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  // --- rendering ---

  function bubbleDiv(html, isTyping) {
    var div = document.createElement("div");
    div.className = "bubble" + (isTyping ? " typing-dots" : "");
    if (isTyping) {
      div.textContent = "typing…";
    } else {
      div.innerHTML = html + '<span class="time"></span>';
      div.querySelector(".time").textContent = nowTime();
    }
    return div;
  }

  function addUserMessage(text) {
    var row = document.createElement("div");
    row.className = "msg-row user";
    var group = document.createElement("div");
    group.className = "bubble-group";
    var b = document.createElement("div");
    b.className = "bubble";
    // textContent for XSS safety; preserve line breaks via <br> using escaped html
    b.innerHTML = escapeHtml(text).replace(/\n/g, "<br>") + '<span class="time"></span>';
    b.querySelector(".time").textContent = nowTime();
    group.appendChild(b);
    row.appendChild(group);
    chatLog.appendChild(row);
    scrollToBottom();
  }

  function orderPillClass(status) {
    var s = String(status || "").toUpperCase();
    if (s === "COMPLETED") return "pill-green";
    if (s === "APPROVED") return "pill-blue";
    if (s === "REFUNDED" || s === "PARTIALLY_REFUNDED") return "pill-orange";
    return "pill-grey"; // CREATED, PAYER_ACTION_REQUIRED, etc.
  }

  function refundPillClass(status) {
    var s = String(status || "").toUpperCase();
    if (s === "COMPLETED") return "pill-green";
    if (s === "REJECTED") return "pill-red";
    return "pill-orange"; // PENDING_MERCHANT_APPROVAL, PENDING, etc.
  }

  function addAgentMessage(reply, attachments) {
    var row = document.createElement("div");
    row.className = "msg-row agent";
    var group = document.createElement("div");
    group.className = "bubble-group";

    if (reply) {
      group.appendChild(bubbleDiv(formatReply(reply), false));
    }
    (attachments || []).forEach(function (a) {
      var el = renderAttachment(a);
      if (el) {
        el.classList.add("attach");
        group.appendChild(el);
      }
    });

    row.appendChild(group);
    chatLog.appendChild(row);
    scrollToBottom();
  }

  function renderAttachment(a) {
    if (!a || !a.type) return null;
    if (a.type === "products") return renderProducts(a);
    if (a.type === "cart") return renderCart(a);
    if (a.type === "pay") return renderPay(a);
    if (a.type === "invoice") return renderInvoice(a);
    if (a.type === "order") return renderOrder(a);
    if (a.type === "refund") return renderRefund(a);
    return null;
  }

  function renderProducts(a) {
    var strip = document.createElement("div");
    strip.className = "product-strip";
    (a.products || []).forEach(function (p) {
      var card = document.createElement("div");
      card.className = "product-card";

      var emoji = document.createElement("div");
      emoji.className = "product-emoji";
      emoji.textContent = p.emoji || "🛍️";
      card.appendChild(emoji);

      var name = document.createElement("div");
      name.className = "product-name";
      name.textContent = p.name || p.id || "Product";
      card.appendChild(name);

      var price = document.createElement("div");
      price.className = "product-price";
      price.textContent = fmtMoneyText(p.price, p.currency);
      card.appendChild(price);

      if (p.description) {
        var desc = document.createElement("div");
        desc.className = "product-desc";
        desc.textContent = String(p.description).slice(0, 90);
        card.appendChild(desc);
      }
      if (typeof p.stock !== "undefined" && p.stock !== null) {
        var stock = document.createElement("div");
        stock.className = "product-desc";
        stock.textContent = "Stock: " + p.stock;
        card.appendChild(stock);
      }

      var btn = document.createElement("button");
      btn.className = "btn btn-green";
      btn.textContent = "Add to cart";
      btn.addEventListener("click", function () {
        sendMessage("add 1 " + p.id);
      });
      card.appendChild(btn);

      strip.appendChild(card);
    });
    return strip;
  }

  function renderCart(a) {
    var card = document.createElement("div");
    card.className = "receipt-card";

    var title = document.createElement("div");
    title.style.fontWeight = "700";
    title.style.marginBottom = "6px";
    title.textContent = "🧾 Your cart";
    card.appendChild(title);

    var items = a.items || [];
    if (items.length === 0) {
      var empty = document.createElement("div");
      empty.textContent = "Your cart is empty.";
      card.appendChild(empty);
    }
    items.forEach(function (it) {
      var line = document.createElement("div");
      line.className = "receipt-line";
      var left = document.createElement("span");
      left.textContent = (it.name || it.productId) + " × " + it.qty;
      var right = document.createElement("span");
      right.textContent = fmtMoneyText(Number(it.unitPrice) * Number(it.qty), a.currency);
      line.appendChild(left);
      line.appendChild(right);
      card.appendChild(line);
    });

    var total = document.createElement("div");
    total.className = "receipt-total";
    var tl = document.createElement("span");
    tl.textContent = "Total";
    var tr = document.createElement("span");
    tr.textContent = fmtMoneyText(a.total, a.currency);
    total.appendChild(tl);
    total.appendChild(tr);
    card.appendChild(total);

    var btn = document.createElement("button");
    btn.className = "btn btn-green";
    btn.style.marginTop = "8px";
    btn.style.width = "100%";
    btn.textContent = "Checkout with PayPal";
    btn.addEventListener("click", function () {
      sendMessage("checkout");
    });
    card.appendChild(btn);
    return card;
  }

  function renderPay(a) {
    var card = document.createElement("div");
    card.className = "pay-card";

    var title = document.createElement("div");
    title.style.fontWeight = "700";
    title.style.marginBottom = "6px";
    title.textContent = "💳 Pay with PayPal";
    card.appendChild(title);

    var payBtn = document.createElement("button");
    payBtn.className = "btn btn-pay";
    payBtn.textContent = "Pay " + fmtMoneyText(a.total, a.currency) + " with PayPal";
    payBtn.addEventListener("click", function () {
      if (a.url) window.open(a.url, "_blank", "noopener");
    });
    card.appendChild(payBtn);

    var paidBtn = document.createElement("button");
    paidBtn.className = "btn btn-secondary";
    paidBtn.textContent = "I've paid ✓";
    paidBtn.addEventListener("click", function () {
      sendMessage("I have paid");
    });
    card.appendChild(paidBtn);

    if (a.orderId) {
      var oid = document.createElement("div");
      oid.className = "small-grey";
      oid.textContent = "Order: " + a.orderId;
      card.appendChild(oid);
    }
    return card;
  }

  function renderInvoice(a) {
    var card = document.createElement("div");
    card.className = "invoice-card";

    var title = document.createElement("div");
    title.style.fontWeight = "700";
    title.style.marginBottom = "4px";
    title.textContent = "🧾 Invoice sent";
    card.appendChild(title);

    if (a.invoiceId || a.total) {
      var meta = document.createElement("div");
      meta.className = "small-grey";
      meta.textContent =
        (a.invoiceId ? "Invoice " + a.invoiceId + " · " : "") +
        fmtMoneyText(a.total, a.currency);
      card.appendChild(meta);
    }

    var btn = document.createElement("button");
    btn.className = "btn btn-link";
    btn.style.marginTop = "8px";
    btn.textContent = "View invoice";
    btn.addEventListener("click", function () {
      if (a.url) window.open(a.url, "_blank", "noopener");
    });
    card.appendChild(btn);
    return card;
  }

  function renderOrder(a) {
    var card = document.createElement("div");
    card.className = "status-card";

    var title = document.createElement("div");
    title.style.fontWeight = "700";
    title.textContent = "📦 Order " + (a.orderId || "");
    card.appendChild(title);

    var pill = document.createElement("span");
    pill.className = "pill " + orderPillClass(a.status);
    pill.textContent = String(a.status || "UNKNOWN");
    pill.style.marginTop = "6px";
    card.appendChild(pill);

    var meta = document.createElement("div");
    meta.className = "small-grey";
    var parts = [];
    if (a.total != null) parts.push(fmtMoneyText(a.total, a.currency));
    if (a.captureId) parts.push("capture " + String(a.captureId).slice(0, 12) + "…");
    meta.textContent = parts.join(" · ");
    card.appendChild(meta);
    return card;
  }

  function renderRefund(a) {
    var card = document.createElement("div");
    card.className = "status-card";

    var title = document.createElement("div");
    title.style.fontWeight = "700";
    title.textContent = "↩️ Refund" + (a.refundId ? " " + a.refundId : "");
    card.appendChild(title);

    var pill = document.createElement("span");
    pill.className = "pill " + refundPillClass(a.status);
    pill.textContent = String(a.status || "UNKNOWN");
    pill.style.marginTop = "6px";
    card.appendChild(pill);

    if (a.amount != null) {
      var meta = document.createElement("div");
      meta.className = "small-grey";
      meta.textContent = fmtMoneyText(a.amount, a.currency);
      card.appendChild(meta);
    }
    return card;
  }

  function renderChips(list) {
    chipRow.innerHTML = "";
    (list || []).forEach(function (label) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = label;
      chip.addEventListener("click", function () {
        sendMessage(label);
      });
      chipRow.appendChild(chip);
    });
  }

  // --- network ---

  async function loadHealth() {
    try {
      var res = await fetch("/api/health");
      var data = await res.json();
      modeBadge.textContent =
        "paypal: " + (data.paypalMode || "?") + " · llm: " + (data.llmMode || "?");
    } catch (e) {
      modeBadge.textContent = "offline";
    }
  }

  var sending = false;

  async function sendMessage(text) {
    text = String(text == null ? "" : text).trim();
    if (!text || sending) return;
    sending = true;
    addUserMessage(text);
    chatInput.value = "";

    // Typing bubble
    var typingRow = document.createElement("div");
    typingRow.className = "msg-row agent";
    var typingGroup = document.createElement("div");
    typingGroup.className = "bubble-group";
    typingGroup.appendChild(bubbleDiv("", true));
    typingRow.appendChild(typingGroup);
    chatLog.appendChild(typingRow);
    scrollToBottom();

    try {
      var res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId, message: text }),
      });
      var data = await res.json();
      typingRow.remove();
      addAgentMessage(data.reply || "", data.attachments || []);
      if (Array.isArray(data.quickReplies)) renderChips(data.quickReplies);
    } catch (e) {
      typingRow.remove();
      addAgentMessage("Sorry, I couldn't reach the shop server. Please try again.", []);
    } finally {
      sending = false;
    }
  }

  // --- init ---

  chatForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    sendMessage(chatInput.value);
  });

  // Local greeting (no POST on load).
  addAgentMessage(GREETING, []);
  renderChips(INITIAL_CHIPS);
  loadHealth();

  // Auto-capture after PayPal redirect: ?paid=<orderId>
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.has("paid")) {
      window.history.replaceState({}, document.title, window.location.pathname);
      sendMessage("I have paid");
    } else if (params.has("cancelled")) {
      window.history.replaceState({}, document.title, window.location.pathname);
      addAgentMessage("No worries, the PayPal payment was cancelled. Your cart is still saved. Say **checkout** whenever you're ready.", []);
    }
  } catch (e) {
    /* ignore */
  }
})();
