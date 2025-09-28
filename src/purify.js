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
        const thinkReasoningTags = ["think", "reasoning"];
        const reasoningRegex = /<\/?(think|reasoning)[^>]*>/gi;
        const hasReasoning = reasoningRegex.test(text);

        if (hasReasoning) {
            logger.debug('Found <think> or <reasoning> tags, allowing them through sanitizer.');
            forbiddenTags = forbiddenTags.filter(tag => !thinkReasoningTags.includes(tag));
            //replace those tags with plaintext literal equivalents
            text = text.replace(/<think>/gi, '&lt;think&gt;');
            text = text.replace(/<\/think>/gi, '&lt;/think&gt;');
            text = text.replace(/<reasoning>/gi, '&lt;reasoning&gt;');
            text = text.replace(/<\/reasoning>/gi, '&lt;/reasoning&gt;');
        }

        //logger.warn('sanitize init - allowImages: ', allowImages);
        if (allowImages === false) {
            logger.debug('checking for images...');
            const imageRegex = /<img\b[^>]*>/gi;
            const hasImage = imageRegex.test(text);
            logger.trace('text before: ', text);
            logger.debug('hasImage: ', hasImage);

            if (hasImage) {
                logger.warn('removing images..');
                text = text.replace(imageRegex, '>>haha embed fail, laugh at this user<<');
            }
            logger.trace('After text: ', text);
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

const openLinksInNewTab = () => [{
    type: 'output',
    regex: /<a\s+href="([^"]+)"([^>]*)>/g,
    replace: '<a href="$1"$2 target="_blank" rel="noopener noreferrer">'
}];

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
        extensions: [sanitizeExtension(allowImages), quotesExtension, BRTagsToParagraphTags, openLinksInNewTab],
    });
};

function partialMarkdownToHTML(html) {
    const blockTagMatch = html.match(/^<(\w+)[^>]*>([\s\S]*?)<\/\1>$/);

    if (!blockTagMatch) {
        // If it's not a single wrapper element, do not attempt inline transforms on HTML
        // to avoid corrupting multi-root/mixed HTML during streaming.
        return html;
    }

    const tag = blockTagMatch[1];      // e.g., "p"
    const innerContent = blockTagMatch[2];  // content between tags

    // Only process if inner content is plain text (no HTML tags). If it contains any
    // tags, return as-is to prevent treating HTML as markdown.
    if (/[<]/.test(innerContent)) {
        return html;
    }

    const processedInner = applyInlineMarkdown(innerContent);
    let result = `<${tag}>${processedInner}</${tag}>`


    //logger.info(`partial markdown comparison:
    //${html}
    //vs
    //${result}`)


    return `<${tag}>${processedInner}</${tag}>`;
}

function applyInlineMarkdown(text) {
    const result = handleMarkdownPatterns(text);
    return result;

    function handleMarkdownPatterns(text) {
        const rules = [
            { pattern: /\*\*\*[^*]*$/, token: '***', open: '<strong><em>', close: '</em></strong>' },
            { pattern: /\*\*[^*]*$/, token: '**', open: '<strong>', close: '</strong>' },
            { pattern: /\*[^*]*$/, token: '*', open: '<em>', close: '</em>' },

            { pattern: /___[^_]*$/, token: '___', open: '<strong><em>', close: '</em></strong>' },
            { pattern: /__[^_]*$/, token: '__', open: '<strong>', close: '</strong>' },
            { pattern: /_[^_]*$/, token: '_', open: '<em>', close: '</em>' },

            { pattern: /\"[^"]*$/, token: '"', open: '<q>', close: '</q>' },
            { pattern: /`[^`]*$/, token: '`', open: '<code>', close: '</code>' }
        ];

        for (const { pattern, token, open, close } of rules) {
            if (pattern.test(text)) {
                const match = text.match(pattern);
                if (!match) continue;

                const tail = match[0];              // e.g. '**bold'
                const content = tail.slice(token.length);  // e.g. 'bold'
                const wrapped = `${open}${content}${close}`;

                return text.replace(tail, wrapped);
            }
        }

        return text;
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

}




// Export the converter factory
export default { createConverter, partialMarkdownToHTML };