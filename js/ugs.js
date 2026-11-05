/* ============================================================================
   UNITY GAMING SERVICES (web REST APIs)
   Anonymous sign-in, career stats in Cloud Save, wins leaderboard, player names.
   Every call fails quietly: the game always works offline.
   API references: docs.unity.com/en-us/oas-player-auth-client, oas-leaderboards,
   oas-cloud-save-data-client, oas-player-names (all v1), and Cloud Code scripts (run-scripts/rest-api).
   Results go through the Cloud Code script so players can't post their own scores;
   the career lives in Protected Cloud Save data, which players can read but not write.
   ============================================================================ */
(function () {
    const CONFIG = {
        projectId: 'b2a96c9a-ae58-42d7-a9b9-c9cdcefe0c5e',
        environment: 'production',
        leaderboardId: 'wins',
        // Server-side script that records results (cloud/record-match.js); the browser never writes scores itself
        recordScript: 'record-match'
    };
    const AUTH = 'https://player-auth.services.api.unity.com/v1';
    const LEADERBOARDS = `https://leaderboards.services.api.unity.com/v1/projects/${CONFIG.projectId}/leaderboards/${CONFIG.leaderboardId}`;
    const SAVE = `https://cloud-save.services.api.unity.com/v1/data/projects/${CONFIG.projectId}/players`;
    const NAMES = 'https://social.services.api.unity.com/v1/names';
    const CLOUD_CODE = `https://cloud-code.services.api.unity.com/v1/projects/${CONFIG.projectId}/scripts`;
    const STORE_KEY = 'ugs-session-' + CONFIG.projectId;
    const CAREER_KEY = 'career';

    const emptyCareer = () => ({ wins: 0, losses: 0, matches: 0, finishers: 0, streak: 0, bestStreak: 0 });

    const state = {
        status: 'signing-in', // 'signing-in' | 'online' | 'offline'
        playerId: null,
        playerName: null,
        career: emptyCareer(),
        lastError: ''
    };
    let session = null; // { idToken, expiresAt, sessionToken }
    let signInPromise = null;
    const listeners = [];
    const emit = () => listeners.forEach(fn => { try { fn(state); } catch (e) { console.warn(e); } });

    const store = {
        get() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } },
        set(v) { try { localStorage.setItem(STORE_KEY, v); } catch (e) { /* storage blocked */ } },
        clear() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* storage blocked */ } }
    };

    function acceptAuth(res) {
        session = {
            idToken: res.idToken,
            expiresAt: Date.now() + (res.expiresIn || 3600) * 1000,
            sessionToken: res.sessionToken || (session && session.sessionToken)
        };
        state.playerId = res.userId;
        if (session.sessionToken) store.set(session.sessionToken);
    }

    async function authRequest(path, body) {
        const r = await fetch(AUTH + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ProjectId: CONFIG.projectId, UnityEnvironment: CONFIG.environment },
            body: JSON.stringify(body || {})
        });
        if (!r.ok) throw new Error(`Sign-in failed (${r.status})`);
        return r.json();
    }

    // Returning players keep the same player ID through their saved session token
    async function signIn() {
        const saved = store.get();
        if (saved) {
            try {
                acceptAuth(await authRequest('/authentication/session-token', { sessionToken: saved }));
                return;
            } catch (e) {
                store.clear(); // expired or from another environment: start fresh
            }
        }
        acceptAuth(await authRequest('/authentication/anonymous', {}));
    }

    async function ensureSignedIn() {
        if (session && Date.now() < session.expiresAt - 60000) return;
        if (!signInPromise) signInPromise = signIn().finally(() => { signInPromise = null; });
        await signInPromise;
    }

    async function api(url, options = {}, retry = true) {
        await ensureSignedIn();
        const r = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.idToken}`, ...(options.headers || {}) }
        });
        if (r.status === 401 && retry) {
            session = null;
            return api(url, options, false);
        }
        if (!r.ok) {
            let detail = '';
            try { const j = await r.json(); detail = j.detail || j.title || ''; } catch (e) { /* not json */ }
            const err = new Error(detail || `Request failed (${r.status})`);
            err.status = r.status;
            throw err;
        }
        return r.status === 204 ? null : r.json();
    }

    async function loadCareer() {
        const res = await api(`${SAVE}/${state.playerId}/protected/items?keys=${CAREER_KEY}`);
        const item = res && res.results && res.results.find(i => i.key === CAREER_KEY);
        state.career = Object.assign(emptyCareer(), item ? item.value : {});
    }

    async function loadName() {
        try {
            const res = await api(`${NAMES}/${state.playerId}`);
            state.playerName = res && res.name ? res.name : null;
        } catch (e) {
            state.playerName = null; // names service unreachable: the leaderboard still shows Unity's generated name
        }
    }

    async function start() {
        state.status = 'signing-in';
        emit();
        try {
            await ensureSignedIn();
            await loadCareer();
            state.status = 'online';
            console.info('[UGS] signed in as', state.playerId);
        } catch (e) {
            state.status = 'offline';
            state.lastError = e.message;
            console.warn('[UGS] offline:', e.message);
        }
        emit();
        if (state.status === 'online') { await loadName(); emit(); }
    }

    window.UGS = {
        CONFIG,
        state,
        start,
        onChange(fn) { listeners.push(fn); fn(state); },

        // Called once at the end of every match the local player took part in.
        // Unity's server checks the result, updates the career and posts the leaderboard score.
        async recordMatch({ won, finishers, matchSeconds }) {
            if (state.status !== 'online') return null;
            const result = { counted: false, reason: '', rank: null, error: '' };
            try {
                const res = await api(`${CLOUD_CODE}/${CONFIG.recordScript}`, {
                    method: 'POST',
                    body: JSON.stringify({ params: { won: !!won, finishers: finishers || 0, matchSeconds: Math.round(matchSeconds || 0) } })
                });
                const out = (res && res.output) || {};
                if (out.career) state.career = Object.assign(emptyCareer(), out.career);
                result.counted = !!out.counted;
                result.reason = out.reason || '';
                result.rank = out.rank || null;
                emit();
            } catch (e) {
                result.error = e.status === 404 ? 'the server script isn\'t set up yet'
                    : (e instanceof TypeError ? 'couldn\'t reach Unity\'s servers' : e.message);
                console.warn('[UGS] could not record the match:', e.message);
            }
            return result;
        },

        async topScores(limit = 10) {
            const res = await api(`${LEADERBOARDS}/scores?limit=${limit}`);
            return (res && res.results) || [];
        },

        // Your own entry, or null if you have no wins on the board yet
        async myEntry() {
            try {
                return await api(`${LEADERBOARDS}/scores/players/${state.playerId}`);
            } catch (e) {
                if (e.status === 404 && /player/i.test(e.message)) return null;
                throw e;
            }
        },

        // Unity adds a #1234 suffix; names can't contain spaces and are at most 50 characters
        async setName(name) {
            const clean = String(name || '').trim().replace(/\s+/g, '_').slice(0, 40);
            if (!clean) throw new Error('Enter a name');
            const res = await api(`${NAMES}/${state.playerId}`, { method: 'POST', body: JSON.stringify({ name: clean }) });
            state.playerName = res && res.name ? res.name : clean;
            emit();
            return state.playerName;
        }
    };
})();
