/* ============================================================================
 * JCW PPV tab — drop-in for index.html (the #ppv route)
 * ----------------------------------------------------------------------------
 * Self-contained. Include it once, just before </body>:
 *     <script src="ppv-tab.js"></script>
 *
 * It defines window.jcwPpvRender (called by your route() when r==='ppv'),
 * wires the Buy button, handles the return from Stripe, and mounts the player.
 * Access is gated by the Worker (verified Stripe session) — NOT by the
 * Lunatics membership. It never reads __lkPremOn or premiumMembers.
 * ==========================================================================*/
(function () {
  /* ===================== CONFIG — edit these two ===================== */
  var PPV_API = "https://ppv-backend.YOUR-SUBDOMAIN.workers.dev"; // or https://api.jcwlunacy.net
  var DEFAULT_EVENT = "bloodymania-19"; // must match the EVENTS key in worker.js
  /* ================================================================== */

  function $(id) { return document.getElementById(id); }
  function storeKey(ev) { return "jcw_ppv_" + ev; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function currentEvent() {
    return new URLSearchParams(location.search).get("event") || DEFAULT_EVENT;
  }

  function showGate(note) {
    var gate = $("ppv-gate"), video = $("ppv-video"), msg = $("ppv-msg");
    if (gate) gate.style.display = "block";
    if (video) video.style.display = "none";
    if (msg) { if (note) { msg.textContent = note; msg.style.display = "block"; } else { msg.style.display = "none"; } }
  }

  function showVideo(url) {
    var gate = $("ppv-gate"), video = $("ppv-video"), frame = $("ppv-frame"), msg = $("ppv-msg");
    if (frame) frame.src = url;
    if (video) video.style.display = "block";
    if (gate) gate.style.display = "none";
    if (msg) msg.style.display = "none";
  }

  // Ask the Worker for a player URL given a paid Stripe session id.
  async function loadStream(ev, sessionId) {
    var res = await fetch(PPV_API + "/get-video-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId, eventId: ev })
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.playerUrl) {
      try { localStorage.setItem(storeKey(ev), sessionId); } catch (e) {}
      showVideo(data.playerUrl);
      return true;
    }
    if (res.status === 403) return false;        // not paid / wrong event
    throw new Error(data.error || "Stream unavailable");
  }

  // Called by route() when the tab opens, and once on load if we land on #ppv.
  window.jcwPpvRender = async function () {
    if (!$("ppv-gate")) return; // view not on the page
    var ev = currentEvent();
    var params = new URLSearchParams(location.search);
    var fromStripe = params.get("session_id");
    var saved = null;
    try { saved = localStorage.getItem(storeKey(ev)); } catch (e) {}
    var sessionId = fromStripe || saved;

    if (!sessionId) { showGate(); return; }

    try {
      var ok = await loadStream(ev, sessionId);
      if (!ok && fromStripe) {
        // Payment may take a second to settle after redirect — retry briefly.
        for (var i = 0; i < 4 && !ok; i++) { await wait(2500); ok = await loadStream(ev, sessionId); }
      }
      if (!ok) showGate(fromStripe ? "Payment not confirmed yet. If you were charged, reload in a moment." : "");
    } catch (e) {
      showGate(e.message);
    }
  };

  // Buy button (event delegation so it survives re-renders).
  document.addEventListener("click", async function (e) {
    var t = e.target;
    if (!t) return;

    if (t.id === "ppv-buy") {
      e.preventDefault();
      t.disabled = true;
      var label = t.textContent;
      t.textContent = "Redirecting…";
      try {
        var res = await fetch(PPV_API + "/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: currentEvent() })
        });
        var data = await res.json();
        if (data.url) { location.href = data.url; return; }
        throw new Error(data.error || "Could not start checkout");
      } catch (err) {
        showGate("Couldn't start checkout: " + err.message);
        t.disabled = false; t.textContent = label;
      }
    }

    if (t.id === "ppv-reload") {
      e.preventDefault();
      var ev = currentEvent(), sid = null;
      try { sid = localStorage.getItem(storeKey(ev)); } catch (_e) {}
      if (sid) loadStream(ev, sid).catch(function (err) { showGate(err.message); });
    }
  });

  // If the page loads directly on #ppv (route() may run before this script), render now.
  document.addEventListener("DOMContentLoaded", function () {
    if ((location.hash || "").indexOf("#ppv") === 0) window.jcwPpvRender();
  });
})();
