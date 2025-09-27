export const streamUpdater = (() => {
    let pendingHTML = null;
    let isContinue;
    let lastUpdateTime = 0;
    let scrollTimeout = null;
    let isScrolling = false;
    let userIsScrolling = false;
    let programmaticScroll = false;
    const throttleDelay = 16;
    const scrollCancelDelay = 150;
    const scrollDuration = 100;
    const $aiChat = $("#AIChat");
    const el = $aiChat.get(0);

    // Stable text node helpers to reduce flicker during per-token updates
    function ensureTextNode($el, dataKey = 'streamTextNode') {
        let node = $el.data(dataKey);
        const elem = $el.get(0);
        if (node && node.nodeType === Node.TEXT_NODE && elem && elem.contains(node)) return node;
        if (!elem) return null;
        // If single text node exists, reuse it; otherwise create one from current text
        if (elem.childNodes && elem.childNodes.length === 1 && elem.firstChild.nodeType === Node.TEXT_NODE) {
            node = elem.firstChild;
        } else {
            const current = $el.text();
            while (elem.firstChild) elem.removeChild(elem.firstChild);
            node = document.createTextNode(current || '');
            elem.appendChild(node);
        }
        $el.data(dataKey, node);
        return node;
    }

    function setTextNodeValue($el, text, dataKey = 'streamTextNode') {
        const node = ensureTextNode($el, dataKey);
        if (!node) return;
        if (node.nodeValue !== text) node.nodeValue = text;
    }

    // Split a partial HTML fragment into inline-safe HTML and block-level list HTML
    function splitInlineAndBlocks(htmlStr, opts = {}) {
        const treatPAsBlock = !!opts.treatPAsBlock;
        try {
            const div = document.createElement('div');
            div.innerHTML = htmlStr || '';
            const inlineParts = [];
            const hoistParts = [];
            const blockTags = new Set(['UL', 'OL', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

            for (const node of Array.from(div.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE) {
                    inlineParts.push(node.textContent);
                    continue;
                }
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const tag = node.tagName;
                    if (tag === 'P') {
                        // If paragraph contains lists or block-levels, split: keep leading inline in inlineParts,
                        // and hoist only the list/block portion (so we don't duplicate text like "new").
                        if (node.querySelector('ul,ol,blockquote,pre,table,hr')) {
                            const html = node.innerHTML || '';
                            const idx = html.search(/<\s*(ul|ol|blockquote|pre|table|hr)(\s|>)/i);
                            if (idx > -1) {
                                const before = html.slice(0, idx);
                                const after = html.slice(idx);
                                if (before.trim().length) inlineParts.push(before);
                                if (after.trim().length) hoistParts.push(after);
                            } else {
                                // Fallback: hoist whole paragraph if splitting failed
                                hoistParts.push(node.outerHTML);
                            }
                        } else {
                            // Treat paragraphs as block elements when requested (e.g., after a list has been hoisted)
                            if (treatPAsBlock) {
                                hoistParts.push(node.outerHTML);
                            } else {
                                inlineParts.push(node.innerHTML);
                            }
                        }
                    } else if (blockTags.has(tag)) {
                        hoistParts.push(node.outerHTML);
                    } else {
                        // Inline-ish elements (em, strong, code, span, a, etc.)
                        inlineParts.push(node.outerHTML);
                    }
                }
            }
            return { inlineHTML: inlineParts.join(''), hoistHTML: hoistParts.join('') };
        } catch (e) {
            // On any parsing issue, fall back to treating all as inline text
            return { inlineHTML: (htmlStr || ''), hoistHTML: '' };
        }
    }

    // Detect real user scrolls
    $aiChat.on("scroll", () => {
        if (programmaticScroll) return;
        userIsScrolling = true;
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => userIsScrolling = false, scrollCancelDelay);
    });

    function update() {
        const now = performance.now();
        if (now - lastUpdateTime < throttleDelay) {
            requestAnimationFrame(update);
            return;
        }

        if (!pendingHTML) return;

        // Always stream into the unique .streamTarget established for this message
        const $target = $aiChat.find('.incomingStreamDiv .messageContent .streamTarget');

        if ($target.length) {
            // Determine if we are continuing from within a list item. If the target was hoisted
            // to top-level earlier, we keep a pointer to the original <li> to continue buffering
            // inline content there while hoisting block-level lists to top-level.
            const $parent = $target.parent();
            let $liContainer = $parent.is('li') ? $parent : $parent.closest('li');

            // Reuse stored LI container reference if we previously hoisted the target
            if ((!$liContainer || !$liContainer.length) && $target.data('liContainer')) {
                const liNode = $target.data('liContainer');
                if (liNode && document.body.contains(liNode)) {
                    $liContainer = $(liNode);
                }
            }

            const insideListMode = !!($liContainer && $liContainer.length);
            const hoistedOnce = !!$target.data('hoistedOnce');
            const { inlineHTML, hoistHTML } = splitInlineAndBlocks(pendingHTML, { treatPAsBlock: hoistedOnce });

            if (insideListMode) {
                const $messageContent = $target.closest('.messageContent') || $liContainer.closest('.messageContent');
                // 1) If there are block-level parts (lists etc.), hoist them to top-level target first
                if (hoistHTML) {
                    if ($messageContent && $messageContent.length) {
                        // Remember the original LI for subsequent frames
                        if (!$target.data('liContainer')) {
                            $target.data('liContainer', $liContainer.get(0));
                        }
                        // Ensure the target is at top-level messageContent
                        if (!$target.parent().is($messageContent)) {
                            $messageContent.append($target);
                        }
                        // Parse hoisted HTML and merge intelligently to avoid duplication
                        const tmp = document.createElement('div');
                        tmp.innerHTML = hoistHTML;

                        // Helper: get/create a single top-level buffer for non-list blocks; replace each frame
                        let $topBuf = $target.children('span.streamTopBuffer');
                        if (!$topBuf.length) {
                            $topBuf = $('<span class="streamTopBuffer"></span>');
                            $target.append($topBuf);
                        }
                        let topBlocksHTML = '';

                        // Find nearest existing list to extend (as a sibling before the target)
                        let $prevList = $target.prevAll('ul,ol').first();
                        if (!$prevList.length) {
                            const lastList = $messageContent.children('ul:last-child, ol:last-child');
                            if (lastList && lastList.length) $prevList = lastList;
                        }

                        // Small helpers
                        const liBufText = (() => {
                            const $buf = $liContainer.children('span.streamHtmlBuffer');
                            return $buf.length ? ($buf.text() || '').trim() : '';
                        })();
                        const cleanText = (el) => (el.textContent || '').trim();

                        const ensureListSibling = (listNode) => {
                            if ($prevList.length && $prevList.prop('tagName') === listNode.tagName) return $prevList;
                            // Insert a new list before the target so future frames can extend it
                            const clone = listNode.cloneNode(false); // shallow clone (UL/OL without children)
                            $target.before(clone);
                            $prevList = $target.prevAll('ul,ol').first();
                            return $prevList;
                        };

                        const appendOrGrowLI = ($list, liNode) => {
                            if (!$list || !$list.length) return;
                            const t = cleanText(liNode);
                            if (!t) return;
                            const $last = $list.children('li:last-child');
                            const lastText = $last.length ? cleanText($last.get(0)) : '';
                            // Token growth: extend last LI text instead of appending new duplicates
                            if ($last.length && (t.startsWith(lastText) || lastText.startsWith(t))) {
                                if (t.length > lastText.length) setTextNodeValue($last, t);
                                return;
                            }
                            // Exact duplicate check
                            const dup = $list.children('li').toArray().some(li => cleanText(li) === t);
                            if (!dup) $list.append(liNode);
                        };

                        Array.from(tmp.childNodes).forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                const tag = node.tagName;
                                if (tag === 'UL' || tag === 'OL') {
                                    const $list = ensureListSibling(node);
                                    // Append each LI uniquely
                                    Array.from(node.children).forEach(ch => {
                                        if (ch.tagName === 'LI') appendOrGrowLI($list, ch);
                                    });
                                } else if (tag === 'LI') {
                                    // Stray LI: attach to prev list
                                    appendOrGrowLI($prevList, node);
                                } else if (tag === 'P') {
                                    const pText = cleanText(node);
                                    // Skip duplicate paragraph that repeats buffered LI inline
                                    if (liBufText && pText === liBufText) return;
                                    if (pText) topBlocksHTML += node.outerHTML;
                                } else {
                                    topBlocksHTML += node.outerHTML;
                                }
                            } else if (node.nodeType === Node.TEXT_NODE) {
                                const text = (node.textContent || '').trim();
                                if (text) topBlocksHTML += text;
                            }
                        });

                        // Replace buffer with this frame's non-list blocks (prevents stacking duplicates)
                        $topBuf.html(topBlocksHTML);

                        // Mark that we've started hoisting content
                        if (!$target.data('hoistedOnce')) {
                            $target.data('hoistedOnce', true);
                        }
                    }
                }

                // 2) Render inline-safe HTML after hoist routing
                if (!hoistedOnce) {
                    // Before any hoist, inline belongs to the LI
                    let $buf = $liContainer.children('span.streamHtmlBuffer');
                    if (!$buf.length) {
                        $buf = $('<span class="streamHtmlBuffer"></span>');
                        $liContainer.append($buf);
                    }
                    $buf.html(inlineHTML);
                } else if (inlineHTML) {
                    // After hoist: try to grow the last LI per token when appropriate
                    // Prefer growing the last LI if we have a previous list and no top-level blocks this frame
                    let $prevList = $target.prevAll('ul,ol').first();
                    if (!$prevList.length && $messageContent) {
                        const lastList = $messageContent.children('ul:last-child, ol:last-child');
                        if (lastList && lastList.length) $prevList = lastList;
                    }
                    const $topBuf = $target.children('span.streamTopBuffer');
                    const topHasContent = $topBuf.length && ($topBuf.text().trim().length > 0);
                    const looksPlainText = !/[<][a-zA-Z]/.test(inlineHTML);
                    if ($prevList && $prevList.length && looksPlainText && !hoistHTML && !topHasContent) {
                        // Grow a phantom LI per token using a stable Text node to minimize flicker
                        let $phantom = $prevList.children('li.streamPhantomLI:last');
                        if (!$phantom.length) {
                            $phantom = $('<li class="streamPhantomLI"></li>');
                            $prevList.append($phantom);
                        }
                        const prevText = ($phantom.text() || '');
                        const joined = prevText + (inlineHTML.startsWith(' ') || prevText.endsWith(' ') ? '' : ' ') + inlineHTML;
                        setTextNodeValue($phantom, joined.trimStart());
                    } else {
                        // Otherwise, route inline to top-level buffer area
                        if ($messageContent && $messageContent.length) {
                            if (!$target.parent().is($messageContent)) {
                                $messageContent.append($target);
                            }
                            $target.append(inlineHTML);
                        }
                    }
                }
            } else {
                // Not continuing from a list item: render the partial HTML directly
                $target.html(pendingHTML);
            }
        } else {
            return;
        }

        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        if (nearBottom && !userIsScrolling && !isScrolling) {
            smoothScroll(scrollDuration);
        }

        pendingHTML = null;
        lastUpdateTime = now;
    }

    function smoothScroll(duration) {
        const start = el.scrollTop;
        const end = el.scrollHeight - el.clientHeight;
        const change = end - start;
        if (change <= 0) return;

        isScrolling = true;
        programmaticScroll = true;
        const startTime = performance.now();

        function animate(t) {
            const progress = Math.min((t - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            el.scrollTop = start + change * ease;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                isScrolling = false;
                setTimeout(() => programmaticScroll = false, 10);
            }
        }

        requestAnimationFrame(animate);
    }

    return {
        go(newHTML, shouldContinue) {
            pendingHTML = newHTML;
            isContinue = shouldContinue;
            requestAnimationFrame(update);
        }
    };
})();