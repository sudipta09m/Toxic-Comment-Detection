// popup.js — Auto-scroll that WAITs for DOM/network idle using MutationObserver (Videos + Shorts)
// Sends comment texts to toxicity API, shows results in popup, injects badges on page.

// ----------------- UI refs -----------------
const extractBtn = document.getElementById("extractBtn");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");

function setStatus(t) {
  if (!statusEl) return;
  statusEl.textContent = typeof t === 'string' ? "Status: " + t : t;
}

// ----------------- CONFIG -----------------
const API_URL = "http://localhost:5000/predict";
const BATCH_MAX = 32;
const TOXIC_THRESHOLD = 0.89;
const TEXT_PREFIX_MATCH_LEN = 120;

// ------------------------------------------
// Simple fetch with timeout
function fetchWithTimeout(url, opts = {}, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    fetch(url, opts)
      .then(res => { clearTimeout(timer); resolve(res); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

// Helper: chunk array
function chunkArray(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ------------- Main click flow -------------
extractBtn.addEventListener("click", async () => {
  outputEl.textContent = "";
  copyBtn.disabled = true;
  downloadBtn.disabled = true;
  setStatus("Preparing long-wait auto-scroll...");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return setStatus("No active tab.");

  // Inject long-scroller (once)
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      if (window.__YT_LONG_SCROLLER__) return;
      (function () {
        const sleep = ms => new Promise(r => setTimeout(r, ms));

        function isVisible(el) {
          try {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          } catch (e) { return false; }
        }

        function isScrollable(el) {
          try {
            if (!el || el === document.documentElement) return false;
            const s = window.getComputedStyle(el);
            if (!s) return false;
            const ov = s.overflowY;
            if (!(ov === 'auto' || ov === 'scroll' || ov === 'overlay')) return false;
            return el.scrollHeight > el.clientHeight + 2;
          } catch (e) { return false; }
        }

        function findRepresentativeCommentNode() {
          const selectors = [
            'ytd-comment-thread-renderer',
            'ytd-comment-view-model',
            'ytd-comment-renderer',
            'yt-attributed-string#content-text',
            'yt-formatted-string#content-text'
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el;
          }
          try {
            const xp = document.evaluate("//*[contains(@id,'comment') or contains(@class,'comment') or contains(name(),'comment')]", document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            if (xp.snapshotLength) return xp.snapshotItem(0);
          } catch (e) { }
          return null;
        }

        function findScrollableAncestor(startEl) {
          try {
            let el = startEl;
            let steps = 0;
            while (el && steps < 40) {
              if (isScrollable(el)) return el;
              if (el.getRootNode && el.getRootNode().host) {
                el = el.getRootNode().host;
              } else el = el.parentElement;
              steps++;
            }
            const candidates = [
              document.querySelector('ytd-engagement-panel-section-list-renderer #contents'),
              document.querySelector('#comments'),
              document.querySelector('ytd-comments'),
              document.scrollingElement || document.documentElement
            ];
            for (const c of candidates) if (c && isScrollable(c)) return c;
            return document.scrollingElement || document.documentElement;
          } catch (e) {
            return document.scrollingElement || document.documentElement;
          }
        }

        async function autoScrollUntilIdle(options = {}) {
          const idleMs = options.idleMs || 2500;
          const maxWait = options.maxWait || 5 * 60 * 1000;
          const perCycleScroll = options.perCycleScroll || 2500;
          const perCycleDelay = options.perCycleDelay || 450;

          const start = Date.now();
          const isShorts = location.pathname.includes('/shorts/');

          if (isShorts) {
            try {
              const btn = document.querySelector('[aria-label*="Comments"], button[aria-label*="Comments"]');
              if (btn && isVisible(btn)) { btn.click(); await sleep(800); }
            } catch (e) { }
          } else {
            try {
              const comments = document.querySelector('#comments, ytd-comments');
              if (comments && isVisible(comments)) comments.scrollIntoView({ behavior: 'auto', block: 'start' });
            } catch (e) { }
            await sleep(300);
          }

          let rep = findRepresentativeCommentNode();
          if (!rep) { await sleep(300); rep = findRepresentativeCommentNode(); }

          const scrollEl = rep ? findScrollableAncestor(rep) : (document.scrollingElement || document.documentElement);
          const usePanel = (scrollEl && scrollEl !== document.documentElement);

          let lastAdded = Date.now();
          let observer = null;
          try {
            const observeRoot = rep ? (rep.parentElement || document.body) : document.body;
            observer = new MutationObserver((mutations) => {
              for (const m of mutations) {
                if (m.addedNodes && m.addedNodes.length) {
                  lastAdded = Date.now();
                  break;
                }
              }
            });
            observer.observe(observeRoot, { childList: true, subtree: true });
          } catch (e) { observer = null; }

          for (let i = 0; i < 6; i++) {
            try {
              if (usePanel) scrollEl.scrollTop += perCycleScroll;
              else window.scrollBy(0, perCycleScroll);
            } catch (e) { window.scrollBy(0, perCycleScroll); }
            await sleep(perCycleDelay);
          }

          let lastCount = 0;
          let stagnation = 0;

          while (true) {
            try {
              if (usePanel) scrollEl.scrollTop += perCycleScroll;
              else window.scrollBy(0, perCycleScroll);
            } catch (e) { window.scrollBy(0, perCycleScroll); }

            await sleep(perCycleDelay + Math.round(Math.random() * 150));

            let nowCount = 0;
            try { nowCount = document.querySelectorAll('ytd-comment-thread-renderer, ytd-comment-view-model').length; } catch (e) { nowCount = 0; }

            if (nowCount > lastCount) stagnation = 0;
            else stagnation++;

            lastCount = nowCount;

            if ((Date.now() - lastAdded) >= idleMs) break;
            if ((Date.now() - start) > maxWait) break;
            if (stagnation > 30 && (Date.now() - lastAdded) > idleMs / 2) break;
          }

          if (observer) { observer.disconnect(); }
          await sleep(600);

          let finalCount = 0;
          try { finalCount = document.querySelectorAll('ytd-comment-thread-renderer, ytd-comment-view-model').length; } catch (e) { }
          return { success: true, finalCount, usedPanel: usePanel };
        }

        window.__YT_LONG_SCROLLER__ = { autoScrollUntilIdle };
      })();
    }
  });

  setStatus("Auto-scroll injected — running now.");

  const runRes = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      if (!window.__YT_LONG_SCROLLER__) return { success: false, error: 'scroller missing' };
      return await window.__YT_LONG_SCROLLER__.autoScrollUntilIdle({ idleMs: 2500, maxWait: 5 * 60 * 1000 });
    }
  });

  const runObj = runRes?.[0]?.result;
  setStatus(`Auto-scroll finished, extracting comments...`);

  // ----------------- CLEANUP previous injected UI -----------------
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      document.querySelectorAll('.ext-toxicity-badge').forEach(el => el.remove());
      document.querySelectorAll('.ext-toxic-highlight, .ext-safe-highlight')
        .forEach(el => el.classList.remove('ext-toxic-highlight', 'ext-safe-highlight'));
    }
  });

  // ----------------- EXTRACT -----------------
  const extractRes = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      function norm(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
      const nodes = Array.from(document.querySelectorAll(
        'ytd-comment-thread-renderer, ytd-comment-view-model, ytd-comment-renderer'
      ));

      const map = new Map();

      for (const n of nodes) {
        try {
          const clone = n.cloneNode(true);

          clone.querySelectorAll('.ext-toxicity-badge, .ext-toxic-highlight, .ext-safe-highlight')
            .forEach(el => el.remove());

          const textEl = clone.querySelector(
            '#content-text, yt-attributed-string#content-text, yt-formatted-string#content-text'
          );
          if (!textEl) continue;

          const raw = textEl.textContent.trim();
          if (!raw) continue;

          const authorElClone = clone.querySelector('#author-text, a#author, a#author-text');
          const authorName = authorElClone?.textContent?.trim() || null;

          let authorHrefVal = null;
          try {
            const authorOrig = n.querySelector('#author-text, a#author, a#author-text');
            if (authorOrig?.href) authorHrefVal = authorOrig.href;
          } catch { }

          const timeElClone = clone.querySelector(
            'a#published-time-text, span.published-time-text, a.yt-simple-endpoint'
          );
          const timeText = timeElClone?.textContent?.trim() || null;

          const commentId = n.getAttribute('data-comment-id') || n.id || null;

          const obj = {
            authorName,
            authorHref: authorHrefVal,
            text: raw,
            timeText,
            likes: 0,
            commentId
          };

          const key = norm(raw).toLowerCase();
          if (!map.has(key)) map.set(key, obj);
        } catch { }
      }

      return Array.from(map.values());
    }
  });

  const comments = extractRes?.[0]?.result || [];
  if (!comments.length) return setStatus("No comments found.");

  await predictThenAct(comments, tab);
});

// ----------------- Prediction + UI -----------------
async function predictThenAct(comments, tab) {
  if (!comments.length) return setStatus("No comments to analyze.");

  setStatus("Preparing predictions...");
  const texts = comments.map(c => String(c.text || ""));
  const batches = chunkArray(texts, BATCH_MAX);
  let allPreds = [];

  // ---- Fetch predictions ----
  for (let b = 0; b < batches.length; b++) {
    setStatus(`Predicting batch ${b + 1}/${batches.length}...`);
    const batch = batches[b];

    const res = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comments: batch })
    });

    const data = await res.json();
    allPreds = allPreds.concat(data.predictions);
  }

  // ---- Map predictions ----
  const results = comments.map((c, idx) => {
    const p = allPreds[idx];

    let toxicScore = 0;
    let toxic = false;

    if (p) {
      const rawLabel = String(p.label || "");
      const label = rawLabel.toLowerCase();
      const s = typeof p.score === "number" ? p.score : 0;

      if (label === "toxic") {
        toxicScore = s;
        toxic = s >= TOXIC_THRESHOLD;
      }
      else if (label === "non-toxic") {
        toxicScore = s;
        toxic = false;
      }
      else {
        toxicScore = s;
        toxic = s >= TOXIC_THRESHOLD;
      }
    }

    return { ...c, prediction: p, score: toxicScore, toxic };
  });

  // Show in popup
  const outJson = JSON.stringify(results, null, 2);
  outputEl.textContent = outJson;
  copyBtn.disabled = false;
  downloadBtn.disabled = false;

  // ---- Build list for UI injection ----
  const payload = results.map(r => ({
    commentId: r.commentId,
    textPrefix: r.text.substring(0, 120),
    score: r.score,
    toxic: r.toxic
  }));

  await markToxicCommentsOnPage(payload, tab);
  setStatus("Comments marked.");
}

// ----------------- Injection: highlight comments -----------------
async function markToxicCommentsOnPage(items, tab) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (itemsSerialized) => {

      if (!document.getElementById('ext-toxicity-styles')) {
        const s = document.createElement('style');
        s.id = 'ext-toxicity-styles';
        s.textContent = `
          .ext-toxicity-badge {
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 14px;
            margin-left: 8px;
            display: inline-block;
            font-weight: 700;
            color: #fff;
          }
          .ext-toxicity-badge.toxic { background: #d62828; }
          .ext-toxicity-badge.safe { background: #2a9d8f; }

          .ext-toxic-highlight {
            outline: 3px solid #d62828 !important;
            border-radius: 6px !important;
          }
          .ext-safe-highlight {
            outline: 3px solid #2a9d8f !important;
            border-radius: 6px !important;
          }
        `;
        document.head.appendChild(s);
      }

      const clean = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

      function addBadge(container, it) {
        if (!container) return;

        // remove previous badge
        const old = container.querySelector('.ext-toxicity-badge');
        if (old) old.remove();

        const badge = document.createElement('span');
        const pct = Math.round((it.score || 0) * 100);

        if (it.toxic) {
          badge.className = "ext-toxicity-badge toxic";
          // badge.textContent = `toxic — ${pct}%`;
        } else {
          badge.className = "ext-toxicity-badge safe";
          // badge.textContent = `non-toxic — ${pct}%`;
        }

        const author = container.querySelector('#author-text, a#author, span.published-time-text');
        (author || container).appendChild(badge);

        if (it.toxic) {
          container.classList.add('ext-toxic-highlight');
          container.classList.remove('ext-safe-highlight');
        } else {
          container.classList.add('ext-safe-highlight');
          container.classList.remove('ext-toxic-highlight');
        }
      }

      for (const it of itemsSerialized) {
        const prefix = clean(it.textPrefix).slice(0, 120);

        const texts = document.querySelectorAll(
          '#content-text, yt-attributed-string#content-text, yt-formatted-string#content-text'
        );

        for (const el of texts) {
          const content = clean(el.textContent).slice(0, prefix.length);
          if (content === prefix) {
            const container = el.closest(
              'ytd-comment-thread-renderer, ytd-comment-renderer, ytd-comment-view-model'
            );
            addBadge(container, it);
          }
        }
      }
    },
    args: [items]
  });
}
