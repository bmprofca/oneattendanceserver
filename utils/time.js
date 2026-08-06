import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const TZ = "Asia/Kolkata";

export const parseDate = (date) => {
  if (!date) return null;
  const parsed = dayjs.tz(date, "YYYY-MM-DD", TZ);
  return parsed.isValid() ? parsed : null;
};

export const parseTime = (timeStr, outputFormat) => {
  if (!timeStr) return null;
  const formats = ["HH:mm:ss", "HH:mm"];
  for (const fmt of formats) {
    const parsed = dayjs(timeStr, fmt, true);
    if (parsed.isValid()) {
      return outputFormat ? parsed.format(outputFormat) : parsed;
    }
  }
  return null;
};

export const parseDateTimeIST = (date, time, formats) => {
  if (!date || !time) return null;
  const raw = `${date} ${String(time).trim()}`;
  const fmts = formats || ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD HH:mm"];
  for (const fmt of fmts) {
    const parsed = dayjs.tz(raw, fmt, TZ);
    if (parsed.isValid()) return parsed;
  }
  return null;
};

export const compareDates = (d1, d2, unit = "day") => {
  const date1 = parseDate(d1);
  const date2 = parseDate(d2);
  if (!date1 || !date2) return null;
  if (unit === "same") {
    return date1.isSame(date2, "day");
  }
  return date1.diff(date2, unit);
};

export const compareDateTimes = (dt1, dt2, unit = "millisecond") => {
  const d1 = parseDateTimeIST(dt1, "", ["YYYY-MM-DD HH:mm:ss"]);
  const d2 = parseDateTimeIST(dt2, "", ["YYYY-MM-DD HH:mm:ss"]);
  if (!d1 || !d2) return null;
  if (unit === "same") return d1.isSame(d2);
  return d2.diff(d1, unit);
};

export const formatIST = (value, formatStr = "YYYY-MM-DD HH:mm:ss") => {
  if (!value) return null;
  const parsed = dayjs(value).tz(TZ);
  return parsed.isValid() ? parsed.format(formatStr) : null;
};

export const getISTNow = () => dayjs().tz(TZ);
export const getCurrentDate = () => getISTNow().format("YYYY-MM-DD");
export const getCurrentTime = () => getISTNow().format("HH:mm:ss");

export const toIST = (date) => (date ? dayjs(date).tz(TZ).toDate() : null);

export const isDateAfter = (d1, d2) => (compareDates(d1, d2) ?? 0) > 0;
export const isDateBefore = (d1, d2) => (compareDates(d1, d2) ?? 0) < 0;
export const isSameDate = (d1, d2) => compareDates(d1, d2, "same") === true;

export const isBeforeJoining = (leaveStart, joiningDate) => {
  if (!joiningDate) return false;
  const start = parseDate(leaveStart);
  const join = parseDate(joiningDate);
  if (!start || !join) return false;
  return start.isBefore(join, "day");
};

export const eachDateBetween = (startDate, endDate, callback) => {
  let cursor = parseDate(startDate);
  const end = parseDate(endDate);
  if (!cursor || !end) return;
  while (cursor.isBefore(end, "day") || cursor.isSame(end, "day")) {
    callback(cursor.format("YYYY-MM-DD"), cursor.clone());
    cursor = cursor.add(1, "day");
  }
};

export const getYearFromDate = (date) => parseDate(date)?.year() ?? null;

export const isDateTimeBefore = (a, b) => (compareDateTimes(a, b, "millisecond") ?? 0) < 0;
export const isDateTimeAfter = (a, b) => (compareDateTimes(a, b, "millisecond") ?? 0) > 0;
export const isDateTimeSame = (a, b) => compareDateTimes(a, b, "same") === true;
export const getDateTimeDiffDays = (from, to) => compareDateTimes(from, to, "day") ?? 0;

export const diffMinutes = (t1, t2) => {
  const d1 = parseTime(t1);
  let d2 = parseTime(t2);
  if (!d1 || !d2) return 0;
  if (d2.isBefore(d1)) d2 = d2.add(1, "day");
  return d2.diff(d1, "minute");
};

export const addMinutesToTime = (time, mins = 0) => {
  const p = parseTime(time);
  return p ? p.add(Number(mins) || 0, "minute").format("HH:mm:ss") : null;
};

export const isValidTimeRange = (start, end) => {
  const s = parseTime(start);
  const e = parseTime(end);
  return s && e && s.isValid() && e.isValid();
};

export const buildShiftAnchor = (date, timeStr) =>
  parseDateTimeIST(date, timeStr, ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD HH:mm"]);

export const alignTimeToShift = (date, timeStr, anchorDt) => {
  const dt = buildShiftAnchor(date, timeStr);
  if (!dt) return null;
  if (anchorDt && anchorDt.diff(dt, "hour") > 12) return dt.add(1, "day");
  return dt;
};

export const shiftNextDayIfBefore = (dt, anchorDt) => {
  if (!dt || !anchorDt) return dt;
  return dt.isBefore(anchorDt) ? dt.add(1, "day") : dt;
};

export const diffMinutesBetween = (dt1, dt2) => {
  if (!dt1 || !dt2) return 0;
  return Math.max(0, dt2.diff(dt1, "minute"));
};

export const formatDatetime = (dt) => formatIST(dt, "YYYY-MM-DD HH:mm:ss");
export const formatTime12Hour = (time) => parseTime(time)?.format("hh:mm A") ?? null;
export const formatUTCToIST = (value, format = "YYYY-MM-DD HH:mm:ss") => {
  if (!value) return null;
  const utcParsed = dayjs.utc(value);
  return utcParsed.isValid() ? utcParsed.tz(TZ).format(format) : null;
};

export const formatMinutes = (mins = 0) => {
  mins = Math.max(0, Math.round(Number(mins) || 0));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

export const addDays = (date, days = 0) =>
  dayjs(date).tz(TZ).add(days, "day").toDate();

export const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

export const buildMonthDateRange = (year, month) => {
  const totalDays = getDaysInMonth(year, month);
  const mm = String(month).padStart(2, "0");
  return {
    start_date: `${year}-${mm}-01`,
    end_date: `${year}-${mm}-${String(totalDays).padStart(2, "0")}`,
    total_days: totalDays,
  };
};

const VALID_WEEK_DAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"
];

export const normalizeWeekends = (weekends = []) => {
  try {
    if (!weekends) return [];
    let parsed = weekends;
    if (typeof parsed === "string") {
      const trimmed = parsed.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try { parsed = JSON.parse(trimmed); } catch {
          parsed = trimmed.replace(/^\[/, "").replace(/\]$/, "").split(",");
        }
      } else {
        parsed = trimmed.split(",");
      }
    }
    if (!Array.isArray(parsed)) return [];
    return [...new Set(
      parsed.map(d => String(d).trim().toLowerCase())
        .filter(d => VALID_WEEK_DAYS.includes(d))
    )];
  } catch (error) {
    console.error("[NORMALIZE_WEEKENDS_ERROR]", error);
    return [];
  }
};

export const getDayName = (date) => {
  if (!date) return null;
  const d = dayjs(date);
  return d.isValid() ? d.format("dddd").toLowerCase() : null;
};

export const weekendInfo = (date, weekends = []) => {
  const dayName = getDayName(date);
  const normalized = normalizeWeekends(weekends);
  return {
    date,
    day_name: dayName,
    is_weekend: normalized.includes(dayName),
    configured_weekends: normalized,
  };
};

export const getSalaryStatus = ({ effective_from, effective_to }) => {
  const today = parseDate(getCurrentDate());
  const from = parseDate(effective_from);
  const to = effective_to ? parseDate(effective_to) : null;
  if (!from) return null;
  if (from.isAfter(today, "day")) return "future";
  if (from.isSame(today, "day") || from.isBefore(today, "day")) {
    if (!to || to.isSame(today, "day") || to.isAfter(today, "day")) return "current";
  }
  if (to && to.isBefore(today, "day")) return "past";
  return null;
};

export const normalizeHalfDayType = (value) =>
  ["first_half", "second_half"].includes(value) ? value : "first_half";

export const parseOvertimeValue = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
};

export const diffMilliseconds = (start, end) => {
  if (!start || !end || !start.isValid() || !end.isValid()) return 0;
  return end.isAfter(start) ? end.diff(start) : 0;
};

export const earliestDt = (dts) => {
  const valid = dts.filter(Boolean);
  return valid.length ? valid.reduce((a, b) => (a.isBefore(b) ? a : b)) : null;
};

export const latestDt = (dts) => {
  const valid = dts.filter(Boolean);
  return valid.length ? valid.reduce((a, b) => (a.isAfter(b) ? a : b)) : null;
};

export const parseISTDateTime = (dateTime) => {
  if (!dateTime) return null;
  const parsed = dayjs(dateTime);
  return parsed.isValid() ? parsed.tz(TZ) : null;
};