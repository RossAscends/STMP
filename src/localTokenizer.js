// Lightweight, dependency-free token estimators for Chat Completions.
// Strategy: chars->tokens baseline + per-template overheads for wrappers.
import { apiLogger as logger } from './log.js';

const charsPerToken = 4.4; // empirical average for English text with GPT-3.5/4

export function approxTokensFromChars(str) {
    const s = (str ?? '').toString();
    return Math.ceil(s.length / charsPerToken);
}

// Adaptive estimator for content-only tokens (no newlines, no wrappers)
// Uses average word length to modulate the effective chars-per-token (longer words → more tokens),
// and adds small weights for punctuation and numeric groups. This keeps charsPerToken impactful.
function approxContentTokenUnitsAdaptive(content) {
    const raw = (content || '').replace(/\r\n|\r/g, '\n');
    // Exclude newlines from the char-based part; newlines are counted separately
    const sNoNL = raw.replace(/\n/g, '');
    const len = sNoNL.length;
    if (len === 0) return 0;
    // But preserve word boundaries by turning newlines into spaces for word counting
    const sForWords = raw.replace(/\n/g, ' ');
    const trimmed = sForWords.trim();
    const words = trimmed.length ? trimmed.split(/\s+/).length : 0;
    const avgWordLen = words > 0 ? (len / words) : len;
    // Scale effective chars/token around the global charsPerToken so changing that knob has effect.
    // Longer words typically fragment into more tokens → smaller effective chars/token.
    let scale;
    if (avgWordLen >= 8) scale = 0.85;
    else if (avgWordLen >= 6) scale = 0.92;
    else if (avgWordLen >= 4.5) scale = 0.98;
    else scale = 1.05; // very short words/symbols compress a bit better
    const effectiveCPT = Math.max(2.8, charsPerToken * scale);
    const punctCount = (sNoNL.match(/[.,!?;:]/g) || []).length;
    const digitGroups = (sNoNL.match(/\d+/g) || []).length;
    let units = (len / effectiveCPT) + (punctCount * 0.12) + (digitGroups * 0.22);
    // Guardrails: keep reasonable bounds
    if (words > 0) units = Math.max(units, words * 0.5);
    // Do not allow it to exceed an aggressive cap tied to charsPerToken
    units = Math.min(units, len / Math.max(2.6, charsPerToken * 0.65));
    return units;
}

// Per-template overheads. Tune conservatively (overestimate slightly).
export const TEMPLATE_OVERHEADS = {
    ChatML: { per_msg: 6, per_system: 8, per_nudge: 6, trailing: 1 },
    Llama3: { per_msg: 8, per_system: 10, per_nudge: 6, trailing: 1 },
    Gemma:  { per_msg: 6, per_system: 8, per_nudge: 6, trailing: 1 },
    Mixtral:{ per_msg: 6, per_system: 8, per_nudge: 6, trailing: 1 },
    Alpaca: { per_msg: 4, per_system: 6, per_nudge: 4, trailing: 1 },
    Claude: { per_msg: 5, per_system: 7, per_nudge: 5, trailing: 1 }, // Anthropic-ish chat wrappers
    None:   { per_msg: 0, per_system: 0, per_nudge: 0, trailing: 0 },
};

export function getTemplateNameFromInstructFile(selectedInstructPath) {
    const name = (selectedInstructPath || '').toLowerCase();
    logger.info('Determining template from instruct file:', name);
    if (name.includes('chatml')) return 'ChatML';
    if (name.includes('llama3')) return 'Llama3';
    if (name.includes('gemma'))  return 'Gemma';
    if (name.includes('mixtral'))return 'Mixtral';
    if (name.includes('alpaca')) return 'Alpaca';
    return 'None';
}

// Optional helper to approximate special markers as single tokens when estimating fully-rendered strings.
export function compressSpecialMarkersForEstimation(s) {
    return (s || '')
        .replaceAll('<|im_start|>', '§')
        .replaceAll('<|im_end|>', '§')
        .replaceAll('[INST]', '§')
        .replaceAll('[/INST]', '§')
        .replaceAll('<|start_header_id|>', '§')
        .replaceAll('<|end_header_id|>', '§')
        .replaceAll('<|eot_id|>', '§')
        .replaceAll('<s>', '§')
        .replaceAll('</s>', '§');
}

function getOverheads(templateName) {
    return TEMPLATE_OVERHEADS[templateName] || TEMPLATE_OVERHEADS.None;
}

export function estimateSystemTokens_CC(systemContent, templateName) {
    const oh = getOverheads(templateName);
    return approxTokensFromChars(systemContent) + oh.per_system;
}

export function estimateMessageTokens_CC(msg, templateName) {
    const oh = getOverheads(templateName);
    const text = msg?.content || '';
    return approxTokensFromChars(text) + oh.per_msg;
}

export function estimateNudgeTokens_CC(nudgeContent, templateName) {
    const oh = getOverheads(templateName);
    return approxTokensFromChars(nudgeContent) + oh.per_nudge;
}

export function computeCCBudget(contextSize, responseLengthTokens, safetyMargin = 32) {
    const ctx = Number(contextSize) || 0;
    const resp = Number(responseLengthTokens) || 0;
    const margin = Number(safetyMargin) || 0;
    return Math.max(0, ctx - resp - margin);
}

// Optional: build a rendered approximation using known wrappers, then chars->tokens
export function estimateCCTokensByRender(messages, systemContent, templateName, options = {}) {
    // Follow a template-aware virtual render, then count:
    // 1) special markers as +1 each,
    // 2) newlines as +1 each,
    // 3) per-line content via chars->tokens (ceil(len/charsPerToken)) excluding markers and newlines.
    const { includeAssistantStart = true } = options;

    // 1) Build rendered string per template
    let rendered = buildRenderedCCPrompt(messages, systemContent, templateName, includeAssistantStart);

    // Normalize line endings to \n only
    rendered = (rendered || '').replace(/\r\n|\r/g, '\n');

    // 2) Count special markers by template
    let specialMarkers = [];
    if (templateName === 'ChatML') {
        specialMarkers = ['<|im_start|>', '<|im_end|>'];
    } else if (templateName === 'Llama3') {
        specialMarkers = ['<|start_header_id|>', '<|end_header_id|>', '<|eot_id|>'];
    } else {
        specialMarkers = [];
    }

    // Count occurrences of each special marker
    let numSpecialTokens = 0;
    let stripped = rendered;
    for (const marker of specialMarkers) {
        const parts = stripped.split(marker);
        if (parts.length > 1) {
            numSpecialTokens += (parts.length - 1);
            stripped = parts.join(''); // remove from string for content counting
        }
    }

    // 3) Count newlines as +1 token each, then remove them from content counting
    const numNewLines = (stripped.match(/\n/g) || []).length;
    const lines = stripped.split('\n');

    // 4) Per-line content token UNITS (no ceil per line); we ceil once at the end
    let contentUnits = 0;
    for (const line of lines) {
        if (!line) continue; // empty line contributes 0 content units
        contentUnits += Math.ceil(line.length / charsPerToken);
    }

    const totalUnits = numSpecialTokens + numNewLines + contentUnits;
    //const total = Math.ceil(totalUnits);
    // Optionally log for diagnostics
    logger.info(`[estimateCCTokensByRender] specials=${numSpecialTokens}, newlines=${numNewLines}, content=${contentUnits.toFixed(2)}, total=${totalUnits.toFixed(2)}`);
    return  Number(totalUnits.toFixed(2));
}

// Internal helper: compute token units (fractional for content) for an already-rendered block
function tokenUnitsFromRendered(rendered, templateName) {
    let s = (rendered || '').replace(/\r\n|\r/g, '\n');
    let specialMarkers = [];
    if (templateName === 'ChatML') {
        specialMarkers = ['<|im_start|>', '<|im_end|>'];
    } else if (templateName === 'Llama3') {
        specialMarkers = ['<|start_header_id|>', '<|end_header_id|>', '<|eot_id|>'];
    }
    let numSpecialTokens = 0;
    for (const marker of specialMarkers) {
        const parts = s.split(marker);
        if (parts.length > 1) {
            numSpecialTokens += (parts.length - 1);
            s = parts.join('');
        }
    }
    const numNewLines = (s.match(/\n/g) || []).length;
    const lines = s.split('\n');
    let contentUnits = 0;
    for (const line of lines) {
        if (!line) continue;
        contentUnits += Math.ceil(line.length / charsPerToken);
    }
    const totalUnits = numSpecialTokens + numNewLines + contentUnits;
    return { numSpecialTokens, numNewLines, contentUnits, totalUnits };
}

// Render a single message for the given template
function renderSingleMessage(msg, templateName) {
    const role = msg?.role || 'user';
    const content = msg?.content || '';
    if (templateName === 'ChatML') {
        return `<|im_start|>${role}\n${content}<|im_end|>\n`;
    } else if (templateName === 'Llama3') {
        return `<|start_header_id|>${role}<|end_header_id|>\n\n${content}<|eot_id|>`;
    }
    return `${role}: ${content}\n`;
}

// Render only the system block (without assistant-start by default)
function renderSystemBlock(systemContent, templateName) {
    const content = systemContent || '';
    if (templateName === 'ChatML') {
        return `<|im_start|>system\n${content}<|im_end|>\n`;
    } else if (templateName === 'Llama3') {
        return `<|start_header_id|>system<|end_header_id|>\n\n${content}<|eot_id|>`;
    }
    return `system: ${content}\n`;
}

// Render only the assistant primer header
function renderAssistantPrimer(templateName) {
    if (templateName === 'ChatML') {
        return `<|im_start|>assistant\n`;
    } else if (templateName === 'Llama3') {
        return `<|start_header_id|>assistant<|end_header_id|>\n\n`;
    }
    return '';
}

// Exported per-block estimators (return fractional units; caller may ceil at end)
export function estimateCCMessageTokensByRender(msg, templateName) {
    if (templateName === 'ChatML') {
        const role = (msg?.role || 'user').toLowerCase();
        const contentRaw = (msg?.content || '');
        // Fixed cost for "<|im_start|>role" header
        const roleHeaderUnits = role === 'user' ? 2 : 3; // user:2, assistant/system:3
        // Newline after role header
        const headerNewlineUnits = 1;
        // Content: count internal newlines explicitly, and chars->tokens on the rest
        const contentNewlines = (contentRaw.match(/\n/g) || []).length;
        const contentUnits = approxContentTokenUnitsAdaptive(contentRaw);
        // Closing marker and trailing newline
        const closingUnits = 1 /* <|im_end|> */ + 1 /* trailing \n */;
        const totalUnits = roleHeaderUnits + headerNewlineUnits + contentUnits + contentNewlines + closingUnits;
        return totalUnits;
    }
    const rendered = renderSingleMessage(msg, templateName);
    const { totalUnits } = tokenUnitsFromRendered(rendered, templateName);
    return totalUnits; // float
}

export function estimateCCSystemTokensByRender(systemContent, templateName) {
    if (templateName === 'ChatML') {
        const roleHeaderUnits = 3; // system
        const headerNewlineUnits = 1;
        const contentRaw = systemContent || '';
        const contentNewlines = (contentRaw.match(/\n/g) || []).length;
        const contentUnits = approxContentTokenUnitsAdaptive(contentRaw);
        const closingUnits = 1 /* <|im_end|> */ + 1 /* trailing \n */;
        return roleHeaderUnits + headerNewlineUnits + contentUnits + contentNewlines + closingUnits;
    }
    const rendered = renderSystemBlock(systemContent, templateName);
    const { totalUnits } = tokenUnitsFromRendered(rendered, templateName);
    return totalUnits; // float
}

export function estimateCCAssistantPrimerTokensByRender(templateName) {
    if (templateName === 'ChatML') {
        // "<|im_start|>assistant\n" => role header 3 + newline 1
        return 3 + 1;
    }
    const rendered = renderAssistantPrimer(templateName);
    const { totalUnits } = tokenUnitsFromRendered(rendered, templateName);
    return totalUnits; // float
}

export default {
    approxTokensFromChars,
    TEMPLATE_OVERHEADS,
    getTemplateNameFromInstructFile,
    compressSpecialMarkersForEstimation,
    estimateSystemTokens_CC,
    estimateMessageTokens_CC,
    estimateNudgeTokens_CC,
    estimateCCTokensByRender,
    computeCCBudget,
};

// Helper: build a rendered CC prompt string for a given template (for diagnostics or remote tokenization)
export function buildRenderedCCPrompt(messages, systemContent, templateName, includeAssistantStart = true) {
    let rendered = '';
    if (templateName === 'ChatML') {
        if (systemContent) rendered += `<|im_start|>system\n${systemContent}<|im_end|>\n`;
        for (const m of (messages || [])) {
            rendered += `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`;
        }
        if (includeAssistantStart) rendered += `<|im_start|>assistant\n`;
    } else if (templateName === 'Llama3') {
        if (systemContent) rendered += `<|start_header_id|>system<|end_header_id|>\n\n${systemContent}<|eot_id|>`;
        for (const m of (messages || [])) {
            rendered += `<|start_header_id|>${m.role}<|end_header_id|>\n\n${m.content}<|eot_id|>`;
        }
        if (includeAssistantStart) rendered += `<|start_header_id|>assistant<|end_header_id|>\n\n`;
    } else {
        rendered = [systemContent || '', ...(messages || []).map(m => `${m.role}: ${m.content}`)].join('\n');
    }
    return (rendered || '').replace(/\r\n|\r/g, '\n');
}
