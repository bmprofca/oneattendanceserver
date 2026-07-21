import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const TZ = "Asia/Kolkata";


export function toIST(date) {
  if (!date) return null;
  return dayjs(date).tz(TZ).toDate();
}

export function toISTString(date) {
  if (!date) return null;
  return dayjs(date).tz(TZ).format("YYYY-MM-DD HH:mm:ss");
}

export function convertToISTFields(obj, fields = []) {
  if (!obj) return obj;

  const newObj = { ...obj };

  fields.forEach((field) => {
    if (newObj[field]) {
      newObj[field] = toISTString(newObj[field]);
    }
  });

  return newObj;
}

export const getISTNow = () => dayjs().tz(TZ);

export const getCurrentDate = () => getISTNow().format("YYYY-MM-DD");

export const getCurrentTime = () => getISTNow().format("HH:mm:ss");

export const toDateTime = (date, time) => {
  if (!time) return null;
  return dayjs(`${date} ${time}`).format("YYYY-MM-DD HH:mm:ss");
};

export function diffMinutes(t1, t2) {
  if (!t1 || !t2) return 0;

  let d1 = dayjs(t1, "HH:mm:ss", true);
  let d2 = dayjs(t2, "HH:mm:ss", true);

  if (!d1.isValid() || !d2.isValid()) {
    return 0;
  }

  if (d2.isBefore(d1)) {
    d2 = d2.add(1, "day"); 
  }

  return d2.diff(d1, "minute");
}

export const toISTDateTime = (date, time) => {
  if (!date || !time) {
    return null;
  }

  const value = `${date} ${time}`;
  const parsed = dayjs(value, "YYYY-MM-DD HH:mm:ss", true);

  if (!parsed.isValid()) {
    console.log("❌ Invalid datetime:", { date, time, value });
    return null;
  }

  return parsed.tz(TZ);
};

export const formatAttendanceTime = (timeStr) => {
  if (!timeStr) return null;

  const parsed = dayjs(timeStr, "HH:mm:ss", true);

  return parsed.isValid() ? parsed : null;
};

export const isValidTimeRange = (
  start_time,
  end_time
) => {

  if (!start_time || !end_time) {
    return false;
  }

  const start =
    formatAttendanceTime(
      start_time
    );

  const end =
    formatAttendanceTime(
      end_time
    );

  return (
    start &&
    end &&
    start.isValid() &&
    end.isValid()
  );
};

export const formatToDate = (date) => dayjs(date).tz(TZ).format("YYYY-MM-DD");

export const isBeforeJoining = (leaveStart, joiningDate) => {
  if (!joiningDate) return false;
  return dayjs(leaveStart).tz(TZ).isBefore(dayjs(joiningDate).tz(TZ), "day");
};


export const parseDate = (date) => {
  if (!date) return null;

  const parsed = dayjs(date, "YYYY-MM-DD", true);
  return parsed.isValid() ? parsed : null;
};

export const isValidDate = (value) => !!parseDate(value);

export const isDateAfter = (d1, d2) => {
  const date1 = parseDate(d1);
  const date2 = parseDate(d2);

  if (!date1 || !date2) return false;

  return date1.isAfter(date2, "day");
};

export const isDateBefore = (d1, d2) => {
  const date1 = parseDate(d1);
  const date2 = parseDate(d2);

  if (!date1 || !date2) return false;

  return date1.isBefore(date2, "day");
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

export const getYearFromDate = (date) => {
  const parsed = parseDate(date);

  return parsed ? parsed.year() : null;
};

export const isSameDate = (
  date1,
  date2
) => {

  if (!date1 || !date2) {
    return false;
  }

  try {

    const d1 =
      new Date(date1);

    const d2 =
      new Date(date2);

    if (
      isNaN(d1.getTime()) ||
      isNaN(d2.getTime())
    ) {
      return false;
    }

    return (
      d1.getFullYear() ===
      d2.getFullYear() &&

      d1.getMonth() ===
      d2.getMonth() &&

      d1.getDate() ===
      d2.getDate()
    );

  } catch {

    return false;
  }
};

const VALID_WEEK_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

export const normalizeWeekends = (weekends = []) => {

  try {

    if (!weekends) {
      return [];
    }

    let parsed = weekends;

    if (typeof parsed === "string") {

      const trimmed =
        parsed.trim();

      if (!trimmed) {
        return [];
      }

      if (
        trimmed.startsWith("[") &&
        trimmed.endsWith("]")
      ) {

        try {
          parsed = JSON.parse(trimmed);
        } catch {
          parsed =
            trimmed
              .replace(/^\[/, "")
              .replace(/\]$/, "")
              .split(",");
        }
      }
 
      else {
        parsed = trimmed.split(",");
      }
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    return [
      ...new Set(
        parsed
          .map((day) =>
            String(day)
              .trim()
              .toLowerCase()
          )
          .filter((day) =>
            VALID_WEEK_DAYS.includes(day)
          )
      )
    ];

  } catch (error) {

    console.error(
      "[NORMALIZE_WEEKENDS_ERROR]",
      error
    );

    return [];
  }
};

export const getDayName = (date) => {

  if (!date) {
    return null;
  }

  const parsed =
    dayjs(date);

  if (!parsed.isValid()) {
    return null;
  }

  return parsed
    .format("dddd")
    .toLowerCase();
};

export const isWeekendDate = ({ date, weekends = [] }) => {

  const dayName =
    getDayName(date);

  if (!dayName) {
    return false;
  }

  const normalizedWeekends =
    normalizeWeekends(
      weekends
    );

  return normalizedWeekends.includes(
    dayName
  );
};

export const getWeekendDetails = ({ date, weekends = [] }) => {

  const dayName =
    getDayName(date);

  const normalizedWeekends =
    normalizeWeekends(
      weekends
    );

  const isWeekend =
    normalizedWeekends.includes(
      dayName
    );

  return {
    date,
    day_name: dayName,
    is_weekend: isWeekend,
    configured_weekends:
      normalizedWeekends
  };
};

export const normalizeHalfDayType = (
  value
) => {

  const allowed = [
    "first_half",
    "second_half"
  ];

  if (
    allowed.includes(value)
  ) {
    return value;
  }

  return "first_half";
};

export const parseOvertimeValue = (
  value
) => {

  const num = Number(value);

  if (
    Number.isFinite(num) &&
    num > 0
  ) {
    return Math.floor(num);
  }

  return 0;
};

export const parseAttendanceDateTime = (
  date,
  time
) => {

  if (!date || !time) {
    return null;
  }

  const parsed = dayjs.tz(
    `${date} ${time}`,
    "YYYY-MM-DD HH:mm:ss",
    TZ
  );

  return parsed.isValid()
    ? parsed
    : null;
};

export const formatTime12Hour = (
  time
) => {

  if (!time) {
    return null;
  }

  const parsed = dayjs(
    time,
    "HH:mm:ss",
    true
  );

  return parsed.isValid()
    ? parsed.format("hh:mm A")
    : null;
};

export const diffMilliseconds = (
  start,
  end
) => {

  if (
    !start ||
    !end ||
    !start.isValid() ||
    !end.isValid()
  ) {

    return 0;
  }

  if (!end.isAfter(start)) {
    return 0;
  }

  return end.diff(start);
};

export const getDaysInMonth = (
  year,
  month
) => {

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month)
  ) {

    return 0;
  }

  return new Date(
    year,
    month,
    0
  ).getDate();
};

export const buildMonthDateRange = (
  year,
  month
) => {

  const totalDays =
    getDaysInMonth(
      year,
      month
    );

  return {

    start_date:
      `${year}-${String(month).padStart(2, "0")}-01`,

    end_date:
      `${year}-${String(month).padStart(2, "0")}-${String(totalDays).padStart(2, "0")}`,

    total_days:
      totalDays
  };
};

export const formatMinutes = (
  mins = 0
) => {

  mins = Math.max(
    0,
    Math.round(
      Number(mins) || 0
    )
  );

  const hours =
    Math.floor(mins / 60);

  const minutes =
    mins % 60;

  return `${hours}h ${minutes}m`;
};


export const formatTime = (timeStr) => {

  if (!timeStr) {
    return null;
  }

  const formats = [
    "HH:mm:ss",
    "HH:mm"
  ];

  for (const format of formats) {

    const parsed =
      dayjs(
        timeStr,
        format,
        true
      );

    if (parsed.isValid()) {

      return parsed.format(
        "HH:mm:ss"
      );
    }
  }

  return null;
};

function timeToMinutes(time) {

  if (!time) {
    return 0;
  }

  const [h, m, s] =
    String(time)
      .split(":")
      .map(Number);

  return (
    (h * 60) +
    m +
    Math.floor((s || 0) / 60)
  );
}

export const addMinutesToTime = (
  time,
  minutesToAdd = 0
) => {

  if (!time) {
    return null;
  }

  const parsed = dayjs(
    time,
    "HH:mm:ss",
    true
  );

  if (!parsed.isValid()) {
    return null;
  }

  return parsed
    .add(
      Number(minutesToAdd) || 0,
      "minute"
    )
    .format("HH:mm:ss");
};



export const buildShiftAnchor = (date, timeStr) => {
  if (!date || !timeStr) return null;
  const base = `${date} ${String(timeStr).trim()}`;
  const p1 = dayjs.tz(base, "YYYY-MM-DD HH:mm:ss", TZ);
  if (p1.isValid()) return p1;
  const p2 = dayjs.tz(base, "YYYY-MM-DD HH:mm", TZ);
  return p2.isValid() ? p2 : null;
};

export const alignTimeToShift = (date, timeStr, anchorDt) => {
  const dt = buildShiftAnchor(date, timeStr);
  if (!dt) return null;
  if (anchorDt && anchorDt.diff(dt, "hour") > 12) {
    return dt.add(1, "day");
  }
  return dt;
};

export const shiftNextDayIfBefore = (dt, anchorDt) => {
  if (!dt || !anchorDt) return dt;
  if (dt.isBefore(anchorDt)) return dt.add(1, "day");
  return dt;
};

export const diffMinutesBetween = (dt1, dt2) => {
  if (!dt1 || !dt2) return 0;
  return Math.max(0, dt2.diff(dt1, "minute"));
};

export const formatDatetime = (dt) => {
  if (!dt) return null;
  return dt.format("YYYY-MM-DD HH:mm:ss");
};

export const earliestDt = (dts) => {
  const valid = dts.filter(Boolean);
  if (!valid.length) return null;
  return valid.reduce((a, b) => (a.isBefore(b) ? a : b));
};

export const latestDt = (dts) => {
  const valid = dts.filter(Boolean);
  if (!valid.length) return null;
  return valid.reduce((a, b) => (a.isAfter(b) ? a : b));
};


export const parseISTDateTime = (dateTime) => {
    if (!dateTime) {
        return null;
    }

    const parsed = dayjs(dateTime);

    return parsed.isValid()
        ? parsed.tz(TZ)
        : null;
};



export const getSalaryStatus = ({effective_from,effective_to}) => {

  const today = parseDate(
    getCurrentDate()
  );

  const from =
    parseDate(effective_from);

  const to =
    effective_to
      ? parseDate(effective_to)
      : null;

  if (!from) {
    return null;
  }

  if (from.isAfter(today, "day")) {
    return "future";
  }

  if (
    from.isSame(today, "day") ||
    from.isBefore(today, "day")
  ) {

    if (
      !to ||
      to.isSame(today, "day") ||
      to.isAfter(today, "day")
    ) {
      return "current";
    }
  }

  if (
    to &&
    to.isBefore(today, "day")
  ) {
    return "past";
  }

  return null;
};

export const isFutureSalary = (
  salary
) =>
  getSalaryStatus(salary) ===
  "future";

export const isCurrentSalary = (
  salary
) =>
  getSalaryStatus(salary) ===
  "current";

export const isPastSalary = (
  salary
) =>
  getSalaryStatus(salary) ===
  "past";


  export const addDays = (
  date,
  days = 0
) => {
  return dayjs(date)
    .tz(TZ)
    .add(days, "day")
    .toDate();
};

export const formatDate = (
  date
) => {
  if (!date) {
    return null;
  }

  return dayjs(date)
    .tz(TZ)
    .format("YYYY-MM-DD");
};


export const isDateTimeBefore = (
  date1,
  date2
) => {

  const d1 =
    parseISTDateTime(date1);

  const d2 =
    parseISTDateTime(date2);

  if (!d1 || !d2) {
    return false;
  }

  return d1.isBefore(d2);
};

export const isDateTimeAfter = (
  date1,
  date2
) => {

  const d1 =
    parseISTDateTime(date1);

  const d2 =
    parseISTDateTime(date2);

  if (!d1 || !d2) {
    return false;
  }

  return d1.isAfter(d2);
};

export const isDateTimeSame = (
  date1,
  date2
) => {

  const d1 =
    parseISTDateTime(date1);

  const d2 =
    parseISTDateTime(date2);

  if (!d1 || !d2) {
    return false;
  }

  return d1.isSame(d2);
};

export const getDateTimeDiffDays = (
  from,
  to
) => {

  const d1 =
    parseISTDateTime(from);

  const d2 =
    parseISTDateTime(to);

  if (!d1 || !d2) {
    return 0;
  }

  return d2.diff(
    d1,
    "day"
  );
};