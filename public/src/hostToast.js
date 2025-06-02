import util from './utils.js';
import { myUUID, isPhone, isLandscape } from '../script.js';

async function showHostToast(msg, username, duration = 1000) {
    const $toast = $('#hostToast');
    const visibleDuration = duration;
    const fadeDuration = visibleDuration * 10;
    const fadeInDuration = 500;


    let fadeStarted = false;
    let fadeWasPaused = false;
    let fadeRemaining = fadeDuration;
    let fadeStartTime = null;
    let pauseStartTime = null;
    let fadeTimer = null;
    let hasBeenInteracted = false;
    let toastShownAt = null;
    let fallbackChecker = null;

    // New flags
    let isAnimating = false;
    let isPaused = false;
    let hasFadeStartedAtLeastOnce = false;

    // Interaction tracker
    const recentExternalInteractions = [];

    $toast.stop(true, true).css({ display: 'flex' })
        .off('mouseenter mouseleave touchstart click')
        .show();

    const $header = $('<div>', {
        text: `Message from ${username ? `(${username})` : ''}`,
        css: {
            fontWeight: 'bold',
            fontSize: '1em',
            marginBottom: '0.5em',
            color: 'rgb(45 45 45)',
            display: 'flex',
            flexDirection: 'column',
            whiteSpace: 'nowrap',
        }
    });

    const $body = $('<div>', {
        html: msg,
        css: {
            maxWidth: '65vw',
            maxHeight: '50vh',
            minWidth: '10vw',
            overflowWrap: 'break-word',
            overflowY: 'auto',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '10px',
            border: '1px solid rgba(0, 0, 0, 0.3)',
            padding: '5px',
        }
    });

    const $closeBtn = $('<div>', {
        html: '<i class="fa-solid fa-xmark"></i>',
        css: {
            position: 'absolute',
            top: '0',
            paddingTop: '5px',
            paddingRight: '5px',
            cursor: 'pointer',
            fontSize: '0.8em',
            width: '100%',
            color: '#555',
            justifyContent: 'flex-end',
        }
    }).on('click', () => {
        hardCloseToast();
    });

    $closeBtn.addClass('flexbox')

    $toast.empty().append($closeBtn, $header, $body).fadeIn(fadeInDuration);

    toastShownAt = performance.now();
    //console.warn('[TOAST] Toast shown', toastShownAt / 1000, 'sec after page load');

    const startFade = () => {
        fadeStarted = true;
        hasFadeStartedAtLeastOnce = true;
        isAnimating = true;
        isPaused = false;
        fadeStartTime = performance.now();

        //console.warn('[TOAST] Fade started with duration', fadeRemaining, 'ms');
        $toast.animate({ opacity: 0 }, fadeRemaining, onFadeComplete);
    };

    fadeTimer = setTimeout(() => {
        startFade();
        fadeTimer = null;
    }, visibleDuration);

    await util.delay(1);

    let lastInteractionAt = 0;

    const handleInteraction = (e) => {
        const now = performance.now();

        if (now - lastInteractionAt < 250) {
            //console.warn('[TOAST] Skipping duplicate interaction within 250ms window.');
            return;
        }

        lastInteractionAt = now;
        hasBeenInteracted = true;

        //console.warn('>>>>>[TOAST] Interaction (hover/touch/click) detected');

        if (!fadeStarted) {
            //console.warn('[TOAST] ..fade hasn\'t started yet..');
            if (fadeTimer) {
                clearTimeout(fadeTimer);
                fadeTimer = null;

                const elapsedSinceShown = now - toastShownAt;
                const remainingUntilFade = Math.max(0, visibleDuration - elapsedSinceShown);

                //console.warn('[TOAST] Rescheduling fade to start in', remainingUntilFade, 'ms');
                fadeTimer = setTimeout(() => {
                    //console.warn('[TOAST] Rescheduled fade started');
                    startFade();
                    fadeTimer = null;
                }, remainingUntilFade);
            }
        } else if (!fadeWasPaused) {
            fadeRemaining -= now - fadeStartTime;
            fadeRemaining = Math.max(0, fadeRemaining);

            //console.warn('[TOAST] Pausing fade. Remaining time:', fadeRemaining);
            $toast.stop(true, false).css('opacity', 1);

            fadeWasPaused = true;
            isPaused = true;
            isAnimating = false;
            pauseStartTime = now;
        }
    };

    const handleResume = () => {
        //console.warn('<<<<<[TOAST] Mouse left Toast.');
        const now = performance.now();

        if (!hasBeenInteracted) {
            //console.warn('[TOAST] ..no prior interaction, ignoring.');
            return;
        }

        if (fadeWasPaused && fadeRemaining > 0) {
            fadeWasPaused = false;
            isPaused = false;
            isAnimating = true;
            fadeStartTime = now;

            //console.warn('[TOAST] Resuming fade for remaining', fadeRemaining, 'ms');
            $toast.animate({ opacity: 0 }, fadeRemaining, onFadeComplete);
        } else {
            //console.warn('[TOAST] Not resuming fade — either not paused or already completed.');
        }

        // Track external resume interaction
        recentExternalInteractions.push(now);
        recentExternalInteractions.splice(0, recentExternalInteractions.length - 5); // keep last 5
    };

    function hardCloseToast(reason = '[TOAST] Hard close') {
        console.warn(reason);
        $toast.stop(true, true).hide().css('opacity', 1);
        clearTimeout(fadeTimer);
        clearInterval(fallbackChecker);
        fadeStarted = false;
        fadeWasPaused = false;
        fadeRemaining = fadeDuration;
        isPaused = false;
        isAnimating = false;
        hasBeenInteracted = false;
        hasFadeStartedAtLeastOnce = false;
        $toast.off('mouseenter mouseleave touchstart click');
    }

    function onFadeComplete() {
        //console.warn('[TOAST] Fade completed.');
        $toast.hide().css('opacity', 1);
        clearTimeout(fallbackChecker);
        fadeStarted = false;
        fadeWasPaused = false;
        fadeRemaining = fadeDuration;
        isPaused = false;
        isAnimating = false;
        hasBeenInteracted = false;
        hasFadeStartedAtLeastOnce = false;
        $toast.off('mouseenter mouseleave touchstart click');
    }

    // Fallback checker
    fallbackChecker = setInterval(() => {
        const now = performance.now();
        const timeAlive = now - toastShownAt;

        const timeoutLimit = visibleDuration + fadeDuration;

        const recentOutside = recentExternalInteractions.filter(ts => now - ts < 4000);

        if (
            timeAlive > timeoutLimit &&
            recentOutside.length >= 3 &&
            !isAnimating &&
            hasFadeStartedAtLeastOnce &&
            !fadeTimer
        ) {
            hardCloseToast('[TOAST] Force-closed due to timeout + external interactions');
        }
    }, 1000);

    $toast.on('mouseenter', handleInteraction);
    $toast.on('touchstart', handleInteraction);
    $toast.on('mouseleave', handleResume);

    return $toast;
}





function getToastMessageInput() {
    const $dialog = $(`<div class="flexbox flexFlowCol">`, {
        css: {
            overflowWrap: 'break-word',
            overflowY: 'auto',
            borderRadius: '10px',
            padding: '5px',
            width: '30vw',
            height: '30vh',
        }
    });

    $dialog.dialog({
        modal: true,
        width: isPhone && !isLandscape ? window.innerWidth * 0.9 : window.innerWidth * 0.3,
        height: isPhone && !isLandscape ? window.innerHeight * 0.5 : window.innerHeight * 0.3,
        title: "Enter Toast Message",
        draggable: false,
        resizable: false,
        title: `Host Toast Input`,
        position: { my: "center", at: "center", of: window },
        buttons: {
            "Send": function () {
                const message = $(this).find('textarea').val();
                util.messageServer({
                    type: 'hostToastRequest',
                    UUID: myUUID,
                    message: message
                });
                $(this).dialog("close");
            },
            Cancel: function () {
                $(this).dialog("close");
            }
        },
        open: function () {
            $('.ui-widget-overlay').hide().fadeIn(250)
            const textarea = $('<textarea class="JQUIPopupInput flex1">', { placeholder: "Type a message for all users to see..." });
            $(this).html(textarea);
            $(".ui-button").trigger("blur");
            $(this).closest(".ui-dialog").css('z-index', 10001);
        },
        beforeClose: function (event, ui) {
            const $content = $(this);
            const $dialogWrapper = $content.closest('.ui-dialog');
            const $overlay = $('.ui-widget-overlay');

            if ($dialogWrapper.is(':visible')) {
                event.preventDefault();

                $.when(
                    $dialogWrapper.fadeOut(250),
                    $overlay.fadeOut(250)
                ).done(() => {
                    $content.dialog("destroy").remove();
                });

                return false;
            }
        }
    });
}

$(() => {
    $('#hostToast').hide();
    $("#showHostToast").on('click', () => getToastMessageInput());
})

export default { showHostToast, getToastMessageInput }