// ChatCart merchant dashboard (vanilla JS). Polls GET /api/dashboard every 4s.

(function () {
  "use strict";

  var dashMode = document.getElementById("dashMode");
  var statRevenue = document.getElementById("statRevenue");
  var statOrders = document.getElementById("statOrders");
  var statRefunded = document.getElementById("statRefunded");
  var statPending = document.getElementById("statPending");
  var policyLine = document.getElementById("policyLine");

  var ordersBody = document.querySelector("#ordersTable tbody");
  var refundsBody = document.querySelector("#refundsTable tbody");
  var invoicesBody = document.querySelector("#invoicesTable tbody");
  var actionsBody = document.querySelector("#actionsTable tbody");

  var ordersEmpty = document.getElementById("ordersEmpty");
  var refundsEmpty = document.getElementById("refundsEmpty");
  var invoicesEmpty = document.getElementById("invoicesEmpty");
  var actionsEmpty = document.getElementById("actionsEmpty");

  // All dynamic text is inserted via textContent (never innerHTML), which guards against XSS.
  function fmtMoneyText(amount, currency) {
    var n = Number(amount);
    if (!isFinite(n)) n = 0;
    var cur = currency || "USD";
    if (cur === "USD") return "$" + n.toFixed(2);
    return n.toFixed(2) + " " + cur;
  }

  function fmtTime(ts) {
    if (!ts) return "—";
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleString();
    } catch (e) {
      return String(ts);
    }
  }

  function td(text) {
    var el = document.createElement("td");
    el.textContent = text == null || text === "" ? "—" : String(text);
    return el;
  }

  function pill(status, kind) {
    var s = String(status || "UNKNOWN");
    var cls = "pill-grey";
    var up = s.toUpperCase();
    if (kind === "order") {
      if (up === "COMPLETED") cls = "pill-green";
      else if (up === "APPROVED") cls = "pill-blue";
      else if (up === "REFUNDED" || up === "PARTIALLY_REFUNDED") cls = "pill-orange";
      else cls = "pill-grey";
    } else if (kind === "refund") {
      if (up === "COMPLETED") cls = "pill-green";
      else if (up === "REJECTED") cls = "pill-red";
      else cls = "pill-orange";
    } else {
      if (up === "COMPLETED" || up === "SENT" || up === "PAID") cls = "pill-green";
      else if (up === "APPROVED") cls = "pill-blue";
    }
    var span = document.createElement("span");
    span.className = "pill " + cls;
    span.textContent = s;
    var wrap = document.createElement("td");
    wrap.appendChild(span);
    return wrap;
  }

  function itemsSummary(items) {
    if (!items || items.length === 0) return "—";
    return items
      .map(function (it) {
        return (it.name || it.productId || "?") + " ×" + (it.qty || 1);
      })
      .join(", ");
  }

  async function act(id, verb) {
    try {
      await fetch("/api/merchant/refunds/" + encodeURIComponent(id) + "/" + verb, {
        method: "POST",
      });
    } catch (e) {
      /* ignore; next poll refreshes */
    }
    refresh();
  }

  function render(data) {
    // Mode + stats
    var mode = data.mode || {};
    dashMode.textContent =
      "paypal: " + (mode.paypalMode || "?") + " · llm: " + (mode.llmMode || "?");

    var stats = data.stats || {};
    var cur = stats.currency || "USD";
    statRevenue.textContent = fmtMoneyText(stats.revenue || 0, cur);
    statOrders.textContent = String(stats.orders != null ? stats.orders : 0) +
      (stats.paidOrders != null ? " (" + stats.paidOrders + " paid)" : "");
    statRefunded.textContent = fmtMoneyText(stats.refunded || 0, cur);
    statPending.textContent = String(
      stats.pendingApprovals != null ? stats.pendingApprovals : 0
    );

    // Policy line
    var policy = data.policy || {};
    var limit = policy.autoRefundLimit != null ? policy.autoRefundLimit : 0;
    var pcur = policy.currency || cur;
    policyLine.textContent =
      "Refunds up to " + fmtMoneyText(limit, pcur) +
      " are auto-approved by the agent; larger refunds need your approval.";

    // Orders
    var orders = data.orders || [];
    ordersBody.innerHTML = "";
    ordersEmpty.hidden = orders.length > 0;
    orders.forEach(function (o) {
      var tr = document.createElement("tr");
      var idCell = document.createElement("td");
      var code = document.createElement("code");
      code.textContent = o.id || "—";
      idCell.appendChild(code);
      tr.appendChild(idCell);
      tr.appendChild(td(itemsSummary(o.items)));
      tr.appendChild(td(fmtMoneyText(o.total, o.currency)));
      tr.appendChild(pill(o.status, "order"));
      tr.appendChild(td(fmtTime(o.createdAt)));
      ordersBody.appendChild(tr);
    });

    // Refunds
    var refunds = data.refunds || [];
    refundsBody.innerHTML = "";
    refundsEmpty.hidden = refunds.length > 0;
    refunds.forEach(function (r) {
      var tr = document.createElement("tr");
      var idCell = document.createElement("td");
      var code = document.createElement("code");
      code.textContent = r.id || "—";
      idCell.appendChild(code);
      tr.appendChild(idCell);
      var oc = document.createElement("td");
      var ocode = document.createElement("code");
      ocode.textContent = r.orderId || "—";
      oc.appendChild(ocode);
      tr.appendChild(oc);
      tr.appendChild(td(fmtMoneyText(r.amount, r.currency)));
      tr.appendChild(td(r.reason || "—"));
      tr.appendChild(pill(r.status, "refund"));
      // Approve / Reject buttons when pending
      var actionCell = document.createElement("td");
      if (String(r.status || "").toUpperCase() === "PENDING_MERCHANT_APPROVAL") {
        var okBtn = document.createElement("button");
        okBtn.className = "btn-small btn-approve";
        okBtn.textContent = "Approve";
        okBtn.addEventListener("click", function () { act(r.id, "approve"); });
        var noBtn = document.createElement("button");
        noBtn.className = "btn-small btn-reject";
        noBtn.textContent = "Reject";
        noBtn.addEventListener("click", function () { act(r.id, "reject"); });
        actionCell.appendChild(okBtn);
        actionCell.appendChild(noBtn);
      } else {
        actionCell.textContent = "—";
      }
      tr.appendChild(actionCell);
      refundsBody.appendChild(tr);
    });

    // Invoices
    var invoices = data.invoices || [];
    invoicesBody.innerHTML = "";
    invoicesEmpty.hidden = invoices.length > 0;
    invoices.forEach(function (inv) {
      var tr = document.createElement("tr");
      var idCell = document.createElement("td");
      var code = document.createElement("code");
      code.textContent = inv.id || "—";
      idCell.appendChild(code);
      tr.appendChild(idCell);
      tr.appendChild(td(inv.recipientEmail || "—"));
      tr.appendChild(td(fmtMoneyText(inv.total, inv.currency)));
      tr.appendChild(pill(inv.status, "invoice"));
      var linkCell = document.createElement("td");
      if (inv.url) {
        var a = document.createElement("a");
        a.href = inv.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "View";
        linkCell.appendChild(a);
      } else {
        linkCell.textContent = "—";
      }
      tr.appendChild(linkCell);
      invoicesBody.appendChild(tr);
    });

    // Actions log, newest first
    var actions = (data.actions || []).slice().reverse();
    actionsBody.innerHTML = "";
    actionsEmpty.hidden = actions.length > 0;
    actions.forEach(function (a) {
      var tr = document.createElement("tr");
      tr.appendChild(td(fmtTime(a.ts)));
      tr.appendChild(td(a.sessionId ? String(a.sessionId).slice(0, 6) : "—"));
      var toolCell = document.createElement("td");
      var code = document.createElement("code");
      code.textContent = a.tool || "—";
      toolCell.appendChild(code);
      tr.appendChild(toolCell);
      var argsJson = "";
      try {
        argsJson = JSON.stringify(a.args || {});
      } catch (e) {
        argsJson = "{}";
      }
      if (argsJson.length > 80) argsJson = argsJson.slice(0, 80) + "…";
      var argsCell = document.createElement("td");
      var argsCode = document.createElement("code");
      argsCode.textContent = argsJson;
      argsCode.title = argsJson;
      argsCell.appendChild(argsCode);
      tr.appendChild(argsCell);
      tr.appendChild(td(a.ok ? "✓" : "✗"));
      tr.appendChild(td(a.summary || "—"));
      actionsBody.appendChild(tr);
    });
  }

  async function refresh() {
    try {
      var res = await fetch("/api/dashboard");
      var data = await res.json();
      render(data);
    } catch (e) {
      policyLine.textContent = "Could not reach dashboard API. Retrying…";
    }
  }

  refresh();
  setInterval(refresh, 4000);
})();
