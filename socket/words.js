// built-in list of drawable words
const DEFAULT_WORD_BANK = [
    "apple", "banana", "guitar", "house", "tree", "car", "elephant",
    "pizza", "rainbow", "robot", "flower", "mountain", "bicycle",
    "umbrella", "spider", "clock", "airplane", "sun", "moon", "star",
    "fish", "bird", "boat", "chair", "sword", "camera", "bridge"
];

// pick n random words for the drawer to choose from
function pickWords(list, count) {
    return [...list].sort(() => Math.random() - 0.5).slice(0, count);
}

// levenshtein distance: counts letter differences between guess and secret word
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({length: m + 1}, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

// returns true if the guess has only 1 or 2 typos
function isCloseGuess(guess, word) {
    const g = guess.trim().toLowerCase();
    const w = word.toLowerCase();
    if (g === w) return false;
    const threshold = w.length <= 4 ? 1 : 2;
    return levenshtein(g, w) <= threshold;
}

module.exports = {
    DEFAULT_WORD_BANK,
    pickWords,
    isCloseGuess
};
