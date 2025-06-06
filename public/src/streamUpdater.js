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

        let $target;
        if (isContinue) {
            $target = $aiChat.find(".incomingStreamDiv .messageContent p:last-child span:last-child");
            //remove the outermost <P> tag from pending
            pendingHTML = pendingHTML.replace(/<p>(.*?)<\/p>/, '$1');
            //add a leading space
            pendingHTML = " " + pendingHTML;
        } else {
            $target = $aiChat.find(".incomingStreamDiv .messageContent span");
        }

        if ($target.length) {
            //let $messageContent = $target.closest(".messageContent");
            $target.html(pendingHTML);
            //console.warn($messageContent.text())
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