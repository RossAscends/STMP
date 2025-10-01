import { apiLogger as logger } from './log.js';

// Remote tokenizer utilities using the active API endpoint/key.
// Endpoint: <base>/v1/token/encode/
// Request body:
// {
//   text: string,
//   add_bos_token: false,
//   encode_special_tokens: null,
//   decode_special_tokens: null
// }
// Response body:
// { tokens: number[]; length: number }

///KoboldCPP uses: api/extra/tokencount
//llamacpp uses /tokenize
//Tabby Uses: v1/token/encode/

//ollama does not provide it
//lmstudio does not provide it



function buildBaseURL(endpoint) {
    let baseURL = (endpoint || '').trim();
    if (!baseURL) return '';
    if (!/^https?:\/\//i.test(baseURL)) {
        baseURL = (baseURL.includes('localhost') || baseURL.includes('127.0.0.1')) ? 'http://' + baseURL : 'https://' + baseURL;
    }
    if (!/\/$/.test(baseURL)) baseURL += '/';
    return baseURL;
}

export async function tryRemoteTokenize(text, liveAPI) {
    try {
        if (!text) return null;
        const baseURL = buildBaseURL(liveAPI?.endpoint);
        if (!baseURL) return null;
        const url = baseURL + 'token/encode';
        const key = (liveAPI?.key || '').trim();
        const headers = { 'Content-Type': 'application/json' };
        if (key) {
            headers['x-api-key'] = key;
            headers['Authorization'] = `Bearer ${key}`; // keep for compatibility
        }
        const body = {
            text: String(text),
            add_bos_token: false,
            encode_special_tokens: null,
            decode_special_tokens: null,
        };
        //logger.info('[remoteTokenizer] POST', url, 'text length:', body.text.length);
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) {
            logger.error(`[remoteTokenizer] non-200 (${res.status})`);
            return null;
        }
        const json = await res.json();
        // Prefer the documented 'length' field
        if (typeof json?.length === 'number') return json.length;
        // Fallbacks for older/other shapes
        if (Array.isArray(json?.tokens)) return json.tokens.length;
        if (typeof json === 'number') return json;
        if (typeof json?.usage?.prompt_tokens === 'number') return json.usage.prompt_tokens;
        logger.error('[remoteTokenizer] Unexpected response shape');
        return null;
    } catch (e) {
        logger.error('[remoteTokenizer] failed:', e.message);
        return null;
    }
}

// Calibrate an estimator to backend count using a rendered prompt string.
// Returns a multiplicative factor or 1.0 on failure.
export async function calibrateFactor(renderedPrompt, estimatedUnits, liveAPI) {
    try {
        const remote = await tryRemoteTokenize(renderedPrompt, liveAPI);
        if (typeof remote === 'number' && remote > 0 && estimatedUnits > 0) {
            const factor = remote / estimatedUnits;
            // Cap the factor to avoid wild swings
            const bounded = Math.max(0.5, Math.min(1.8, factor));
            logger.info(`[remoteTokenizer] calibration: remote=${remote}, est=${estimatedUnits.toFixed?.(2) ?? estimatedUnits}, factor=${bounded.toFixed(3)}`);
            return bounded;
        }
        return 1.0;
    } catch {
        return 1.0;
    }
}

export default { tryRemoteTokenize, calibrateFactor };
