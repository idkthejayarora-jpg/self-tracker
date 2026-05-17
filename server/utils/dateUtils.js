// Timezone offset — configurable via env vars, defaults to IST (UTC+5:30)
const TZ_OFFSET_H = parseInt(process.env.TZ_OFFSET_HOURS  || '5',  10);
const TZ_OFFSET_M = parseInt(process.env.TZ_OFFSET_MINUTES || '30', 10);
const TOTAL_OFFSET_MS = (TZ_OFFSET_H * 60 + TZ_OFFSET_M) * 60 * 1000;

/** Current local date as YYYY-MM-DD */
function localDate() {
  const local = new Date(Date.now() + TOTAL_OFFSET_MS);
  return local.toISOString().slice(0, 10);
}

/** Current local datetime as YYYY-MM-DD HH:MM:SS */
function localDatetime() {
  const local = new Date(Date.now() + TOTAL_OFFSET_MS);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

// SQLite modifier strings
const SQL_OFF   = `'+${TZ_OFFSET_H} hours', '+${TZ_OFFSET_M} minutes'`;
/** SQLite expression: current local date  →  date('now','+5 hours','+30 minutes') */
const SQL_NOW   = `date('now', ${SQL_OFF})`;
/** SQLite expression: current local datetime */
const SQL_NOW_DT = `datetime('now', ${SQL_OFF})`;

/**
 * Convert a UTC-stored column to local date for WHERE comparisons.
 * e.g.  sqlDateOf('created_at') + " = " + SQL_NOW
 */
function sqlDateOf(col) {
  return `date(datetime(${col}, ${SQL_OFF}))`;
}

module.exports = { localDate, localDatetime, SQL_NOW, SQL_NOW_DT, sqlDateOf, SQL_OFF };
