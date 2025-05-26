import showdown from 'showdown';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { logger } from './log.js';

// Create a DOM environment for DOMPurify
const { window } = new JSDOM('');
const domPurify = DOMPurify(window);


const sanitizeExtension = (allowImages) => ({
    type: "output",
    filter: function (text) {
        let forbiddenTags = [
            "style", "audio", "script", "iframe", "object", "embed", "form",
            "input", "select", "button", "marquee", "blink", "font"
        ];
        //console.warn('sanitize init - allowImages: ', allowImages);
        if (allowImages === false) {
            console.warn('checking for images...');
            const imageRegex = /<img\b[^>]*>/gi;
            const hasImage = imageRegex.test(text);
            console.warn('text: ', text);
            console.warn('hasImage: ', hasImage);

            if (hasImage) {
                console.warn('removing images..');
                text = text.replace(imageRegex, '>>haha embed fail, laugh at this user<<');
            }
            console.warn('After text: ', text);
            forbiddenTags.push("img");
        } else {
            forbiddenTags = forbiddenTags.filter(tag => tag !== "img");
        }

        const sanitizedHTML = domPurify.sanitize(text, {
            FORBID_TAGS: forbiddenTags,
            FORBID_ATTR: ["onload", "onclick", "onmouseover", "srcdoc", "data-*", "style", "color", "bgcolor"]
        });

        return sanitizedHTML;
    },
});

const quotesExtension = () => {
    const regexes = [
        { regex: /â|â/g, replace: '"' },
        { regex: /â¦/g, replace: "..." },
        { regex: /Ã¢ÂÂ¦/g, replace: "..." },
        { regex: /â/g, replace: "'" },
        { regex: /ÃÂ¢ÃÂÃÂ/g, replace: "'" },
        { regex: /Ã¢ÂÂ/g, replace: "'" },
        { regex: /(?<!<[^>]+)"([^"]*)"(?![^<]*>)/g, replace: "<q>$1</q>" },
        { regex: /“([^“”]*)”/g, replace: '<q class="invisible-quotation">"$1"</q>' },
        { regex: /‘([^‘’]*)’/g, replace: "<q class=\"invisible-quotation\">'$1'</q>" },
        { regex: /â([^(ââ]*)â/g, replace: "<q class=\"invisible-quotation\">'$1'</q>" },
        { regex: /«([^«»]*)»/g, replace: '<q class="invisible-quotation">«$1»</q>' },
        { regex: /「([^「」]*)」/g, replace: '<q class="invisible-quotation">「$1」</q>' },
        { regex: /『([^『』]*)』/g, replace: '<q class="invisible-quotation">『$1』</q>' },
        { regex: /【([^【】]*)】/g, replace: '<q class="invisible-quotation">【$1】</q>' },
        { regex: /《([^《》]*)》/g, replace: '<q class="invisible-quotation">《$1》</q>' },
    ];

    return regexes.map(rule => ({
        type: "output",
        regex: rule.regex,
        replace: rule.replace,
    }));
};

const BRTagsToParagraphTags = () => {
    const regexes = [{ regex: /<br>/g, replace: "</p><p>" }];

    return regexes.map(rule => ({
        type: "output",
        regex: rule.regex,
        replace: rule.replace,
    }));
};

// Create the Showdown converter
const createConverter = (allowImages = true) => {
    logger.warn('Purifier initialized - allowImages: ', allowImages);
    return new showdown.Converter({
        simpleLineBreaks: true,
        openLinksInNewWindow: true,
        parseImgDimensions: false,
        emoji: true,
        backslashEscapesHTMLTags: true,
        literalMidWordUnderscores: true,
        strikethrough: true,
        extensions: [sanitizeExtension(allowImages), quotesExtension, BRTagsToParagraphTags],
    });
};

// Export the converter factory
export default { createConverter };