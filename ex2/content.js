// // content.js
// // Robust comment scraper (XPath + fallbacks). Listens for message { action: 'extractComments', maxComments }.
// // Replies with { success: true, comments: [...] } or { success:false, error: '...' }

// function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// function xpathNodes(expr) {
//   const out = [];
//   try {
//     const it = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
//     for (let i = 0; i < it.snapshotLength; i++) out.push(it.snapshotItem(i));
//   } catch (e) {
//     console.warn('xpathNodes error', e);
//   }
//   return out;
// }

// function xpathCount(expr) {
//   try {
//     const it = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
//     return it.snapshotLength;
//   } catch (e) {
//     return 0;
//   }
// }

// async function waitForCommentLike(timeout = 10000) {
//   const start = Date.now();
//   const expr = "//*[contains(name(), 'comment') or contains(@class, 'comment') or contains(@id,'comment') or contains(@aria-label,'comment')]";
//   while (Date.now() - start < timeout) {
//     const count = xpathCount(expr);
//     if (count > 0) return true;
//     await sleep(300);
//   }
//   return false;
// }

// async function ensureCommentsVisible() {
//   const commentsSection = document.querySelector('#comments') || document.querySelector('ytd-item-section-renderer') || document.querySelector('ytd-comments');
//   if (commentsSection) {
//     try { commentsSection.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch(e){}
//     await sleep(400);
//     return true;
//   }
//   // fallback: scroll the window
//   try { window.scrollBy({ top: window.innerHeight * 0.6, behavior: 'auto' }); } catch(e){}
//   await sleep(400);
//   return false;
// }

// function getLongestTextDescendant(root) {
//   try {
//     let longest = '';
//     const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
//       acceptNode: function(node) {
//         if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
//         const parentName = node.parentElement ? node.parentElement.nodeName.toLowerCase() : '';
//         if (['script','style','noscript'].includes(parentName)) return NodeFilter.FILTER_REJECT;
//         return NodeFilter.FILTER_ACCEPT;
//       }
//     });
//     while (walker.nextNode()) {
//       const txt = walker.currentNode.nodeValue.trim();
//       if (txt.length > longest.length) longest = txt;
//     }
//     return longest || null;
//   } catch (e) {
//     return null;
//   }
// }

// function parseCandidate(node) {
//   try {
//     if (!node) return null;

//     // author
//     let authorName = null, authorHref = null;
//     const authorSelectors = [
//       'a#author-text',
//       'a#author',
//       '[id*=author]',
//       '[class*=author]',
//       '.yt-simple-endpoint.yt-formatted-string'
//     ];
//     for (const s of authorSelectors) {
//       try {
//         const el = node.querySelector ? node.querySelector(s) : null;
//         if (el && el.textContent && el.textContent.trim()) {
//           authorName = el.textContent.trim();
//           if (el.href) authorHref = el.href;
//           const a = el.querySelector && el.querySelector('a');
//           if (!authorHref && a && a.href) authorHref = a.href;
//           break;
//         }
//       } catch (e){}
//     }

//     // text
//     let text = null;
//     const contentSelectors = [
//       'yt-formatted-string#content-text',
//       'div#content-text',
//       '[id*=content-text]',
//       'yt-formatted-string'
//     ];
//     for (const s of contentSelectors) {
//       try {
//         const el = node.querySelector ? node.querySelector(s) : null;
//         if (el && el.textContent && el.textContent.trim()) {
//           text = el.textContent.trim();
//           break;
//         }
//       } catch (e){}
//     }
//     if (!text) {
//       const fallback = getLongestTextDescendant(node);
//       if (fallback) text = fallback.trim();
//     }

//     // time
//     let timeText = null;
//     try {
//       const timeEl = node.querySelector ? node.querySelector('a#published-time-text, span.published-time-text, a.yt-simple-endpoint') : null;
//       if (timeEl && timeEl.textContent) timeText = timeEl.textContent.trim();
//     } catch (e){}

//     // likes
//     let likes = 0;
//     try {
//       const likesEl = node.querySelector ? node.querySelector('#vote-count-middle, [id*=vote-count], [class*=like]') : null;
//       if (likesEl && likesEl.textContent) likes = parseInt((likesEl.textContent||'').replace(/[^\d]/g,'')) || 0;
//     } catch (e){}

//     // reply count (best effort)
//     let replyCount = 0;
//     try {
//       const repliesEl = node.querySelector ? node.querySelector('ytd-comment-replies-renderer, #replies, .replies') : null;
//       if (repliesEl) {
//         const rthreads = repliesEl.querySelectorAll ? repliesEl.querySelectorAll('ytd-comment-renderer, .comment') : [];
//         replyCount = rthreads ? rthreads.length : 0;
//       } else {
//         const moreBtn = node.querySelector ? node.querySelector('tp-yt-paper-button#more-replies, #more-replies, button[aria-label*="repl"], button[aria-label*="replies"]') : null;
//         if (moreBtn && moreBtn.textContent) replyCount = parseInt(moreBtn.textContent.replace(/[^\d]/g,'')) || 0;
//       }
//     } catch (e){}

//     // id
//     let commentId = null;
//     try {
//       if (node.getAttribute) commentId = node.getAttribute('data-comment-id') || node.getAttribute('id') || null;
//     } catch (e){}

//     return { authorName, authorHref, text, timeText, likes, replyCount, commentId };
//   } catch (err) {
//     console.warn('parseCandidate error', err);
//     return null;
//   }
// }

// function getCandidateNodes() {
//   // broad XPath looking for comment-like nodes
//   const expr = "//*[contains(name(), 'comment') or contains(@class, 'comment') or contains(@id,'comment') or contains(@aria-label,'comment') or contains(@data-attribute,'comment')]";
//   let nodes = xpathNodes(expr);
//   if (!nodes.length) {
//     nodes = xpathNodes("//*[contains(@id,'content-text') or contains(@class,'content-text') or @role='article' or contains(@class,'comment-renderer')]");
//   }
//   // dedupe and filter null
//   nodes = nodes.filter((v, i, a) => v && a.indexOf(v) === i);
//   return nodes;
// }

// async function autoScrollComments(maxComments = 300, attempts = 60) {
//   await ensureCommentsVisible();
//   let prev = 0, stagnation = 0;
//   while (attempts-- > 0) {
//     const candidates = getCandidateNodes();
//     if (candidates.length >= maxComments) break;
//     const last = candidates[candidates.length - 1];
//     if (last && last.scrollIntoView) {
//       try { last.scrollIntoView({ behavior: 'auto', block: 'end' }); } catch(e){}
//     } else {
//       try { window.scrollBy(0, window.innerHeight * 0.5); } catch(e){}
//     }
//     await sleep(700 + Math.random() * 400);
//     const now = getCandidateNodes().length;
//     if (now === prev) stagnation++; else { prev = now; stagnation = 0; }
//     if (stagnation > 6) break;
//   }
// }

// async function extractComments(maxComments = 300) {
//   const found = await waitForCommentLike(8000);
//   if (!found) throw new Error('No comment-like nodes found — scroll to comments and try again.');
//   await autoScrollComments(maxComments);
//   const candidates = getCandidateNodes();
//   const results = [];
//   for (const n of candidates.slice(0, maxComments)) {
//     const parsed = parseCandidate(n);
//     if (parsed && parsed.text) results.push(parsed);
//     else if (parsed && !parsed.text) {
//       const fallbackText = (n.textContent || '').trim();
//       if (fallbackText) results.push(Object.assign(parsed || {}, { text: fallbackText }));
//     }
//   }
//   return results;
// }

// // Message listener for popup/background -> content script flow
// chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
//   if (msg && msg.action === 'extractComments') {
//     (async () => {
//       try {
//         const comments = await extractComments(msg.maxComments || 300);
//         sendResponse({ success: true, comments });
//       } catch (err) {
//         console.error('extractComments error', err);
//         sendResponse({ success: false, error: err && err.message ? err.message : String(err) });
//       }
//     })();
//     return true; // will respond asynchronously
//   }
// });
