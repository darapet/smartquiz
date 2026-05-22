(function(){
    var GROQ_URL    = 'https://api.groq.com/openai/v1/chat/completions';
    var STORAGE_KEY = 'aqs_groq_key';
    var IDX_KEY     = 'aqs_groq_key_idx';

    /* 5 Groq API keys — rotated round-robin to spread load and avoid rate limits.
       A personally-saved browser key still takes priority over all master keys. */
    var MASTER_GROQ_KEYS = [
        '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',
        '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',
        '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',
        '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',
        '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'
    ].filter(function(k){ return k && k.startsWith('gsk_'); });

    /* ── Current rotation index ── */
    function _getIdx() {
        var i = 0;
        try { i = parseInt(localStorage.getItem(IDX_KEY) || '0') || 0; } catch(e) {}
        if (isNaN(i) || i >= MASTER_GROQ_KEYS.length) i = 0;
        return i;
    }
    function _setIdx(i) {
        try { localStorage.setItem(IDX_KEY, String(i % Math.max(1, MASTER_GROQ_KEYS.length))); } catch(e) {}
    }

    /* ── getGroqKey: returns the current key (personal key wins) ── */
    window.getGroqKey = function(){
        var stored = '';
        try { stored = (localStorage.getItem(STORAGE_KEY) || '').trim(); } catch(e) {}
        if (stored && stored.startsWith('gsk_')) return stored;
        if (!MASTER_GROQ_KEYS.length) return '';
        var idx = _getIdx();
        _setIdx(idx + 1);
        return MASTER_GROQ_KEYS[idx];
    };

    /* ── groqFetch: drop-in fetch replacement that auto-retries on 429 ──
       Usage:  var res = await window.groqFetch(bodyObject, { signal, ... });
       Returns the Response on the first non-429 reply.
       Throws  'All Groq keys rate-limited' if every key returns 429.
       Throws  the original network error for any non-rate-limit failure.    */
    window.groqFetch = async function(bodyObj, extraOpts) {
        /* Personal key takes priority — no rotation for personal keys */
        var personal = '';
        try { personal = (localStorage.getItem(STORAGE_KEY) || '').trim(); } catch(e) {}
        if (personal && personal.startsWith('gsk_')) {
            return fetch(GROQ_URL, Object.assign({}, extraOpts || {}, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + personal },
                body:    JSON.stringify(bodyObj)
            }));
        }

        if (!MASTER_GROQ_KEYS.length) throw new Error('No Groq keys configured');

        var startIdx = _getIdx();

        for (var attempt = 0; attempt < MASTER_GROQ_KEYS.length; attempt++) {
            var idx = (startIdx + attempt) % MASTER_GROQ_KEYS.length;
            var key = MASTER_GROQ_KEYS[idx];
            var res = await fetch(GROQ_URL, Object.assign({}, extraOpts || {}, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                body:    JSON.stringify(bodyObj)
            }));

            if (res.status === 429) {
                /* This key is rate-limited — skip to the next one */
                console.warn('[groqFetch] key slot', idx, 'rate-limited (429), trying next…');
                _setIdx(idx + 1); /* advance past this key */
                continue;
            }

            /* Success (or a non-429 error the caller should handle) */
            _setIdx(idx + 1); /* advance rotation for next call */
            return res;
        }

        throw new Error('All Groq keys rate-limited (429). Try again in a moment.');
    };

    /* ── setGroqKey: save a personal key in this browser ── */
    window.setGroqKey = function(k){
        if (k && k.startsWith('gsk_'))
            try { localStorage.setItem(STORAGE_KEY, k.trim()); } catch(e) {}
    };

    /* ── setGroqKeys: replace master key pool at runtime ── */
    window.setGroqKeys = function(arr){
        MASTER_GROQ_KEYS.length = 0;
        (arr || []).forEach(function(k){
            if (k && k.startsWith('gsk_')) MASTER_GROQ_KEYS.push(k.trim());
        });
        _setIdx(0);
    };
})();
