/* Cloud Code script "record-match" (Unity Gaming Services).
 *
 * Runs on Unity's servers, not in the player's browser. It is the only thing allowed to change a
 * player's career and their score on the "wins" leaderboard, so a player can't simply post a fake
 * high score. It also rejects results that can't be real: matches shorter than 15 seconds, results
 * sent less than 20 seconds apart, and more than 300 matches a day.
 *
 * Parameters (add them on the script's page in the Unity dashboard):
 *   won          Boolean  true if the calling player won
 *   matchSeconds Numeric  how long the match lasted
 *   finishers    Numeric  finishers the player landed in the match
 *
 * The career is stored as Protected player data: the player can read it but only server code can
 * write it. The SDK clients below use Cloud Code's own service token by default.
 */
const { DataApi } = require("@unity-services/cloud-save-1.4");
const { LeaderboardsApi } = require("@unity-services/leaderboards-1.1");

const LEADERBOARD_ID = "wins";
const CAREER_KEY = "career";
const MIN_MATCH_SECONDS = 15;
const MIN_SECONDS_BETWEEN_MATCHES = 20;
const MAX_MATCHES_PER_DAY = 300;
const MAX_FINISHERS_PER_MATCH = 5;

module.exports = async ({ params, context, logger }) => {
  const { projectId, playerId } = context;
  const cloudSave = new DataApi(context);
  const leaderboards = new LeaderboardsApi(context);
  const now = Date.now();

  const saved = await cloudSave.getProtectedItems(projectId, playerId, [CAREER_KEY]);
  const item = ((saved.data && saved.data.results) || []).find((i) => i.key === CAREER_KEY);
  const career = Object.assign(
    { wins: 0, losses: 0, matches: 0, finishers: 0, streak: 0, bestStreak: 0, lastMatchAt: 0, day: "", dayCount: 0 },
    item ? item.value : {}
  );

  const won = params.won === true;
  const matchSeconds = Number(params.matchSeconds) || 0;
  const finishers = Math.max(0, Math.min(MAX_FINISHERS_PER_MATCH, Math.floor(Number(params.finishers) || 0)));

  const today = new Date(now).toISOString().slice(0, 10);
  if (career.day !== today) {
    career.day = today;
    career.dayCount = 0;
  }

  let reason = "";
  if (matchSeconds < MIN_MATCH_SECONDS) reason = "match too short";
  else if (now - career.lastMatchAt < MIN_SECONDS_BETWEEN_MATCHES * 1000) reason = "too soon after the last match";
  else if (career.dayCount >= MAX_MATCHES_PER_DAY) reason = "daily match limit reached";
  if (reason) {
    logger.warning("Match result not counted", { reason, matchSeconds });
    return { counted: false, reason, career, rank: null };
  }

  career.matches += 1;
  career.finishers += finishers;
  if (won) {
    career.wins += 1;
    career.streak += 1;
    career.bestStreak = Math.max(career.bestStreak, career.streak);
  } else {
    career.losses += 1;
    career.streak = 0;
  }
  career.lastMatchAt = now;
  career.dayCount += 1;

  await cloudSave.setProtectedItem(projectId, playerId, { key: CAREER_KEY, value: career });

  let rank = null;
  if (won) {
    try {
      const entry = await leaderboards.addLeaderboardPlayerScore(projectId, LEADERBOARD_ID, playerId, { score: career.wins });
      rank = entry.data && typeof entry.data.rank === "number" ? entry.data.rank + 1 : null;
    } catch (err) {
      logger.error("Could not post to the leaderboard", { "error.message": err.message });
    }
  }
  return { counted: true, reason: "", career, rank };
};

module.exports.params = {
  won: { type: "Boolean", required: true },
  matchSeconds: { type: "Numeric", required: true },
  finishers: { type: "Numeric", required: false },
};
