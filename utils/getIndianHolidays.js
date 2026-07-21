import ical from 'node-ical';

const url = "https://calendar.google.com/calendar/ical/en.indian%23holiday@group.v.calendar.google.com/public/basic.ics";

const EXCLUDED_CATEGORIES = new Set(["optional holiday"]);

async function getIndianHolidays({ year, month } = {}) {
  try {
    const data = await ical.async.fromURL(url);
    const holidays = [];

    for (let key in data) {
      const event = data[key];
      if (event.type !== 'VEVENT') continue;

      const d = new Date(event.start);
      const eventYear = d.getFullYear();
      const eventMonth = d.getMonth() + 1;
      const eventDay = d.getDate();

      const dateStr = `${eventYear}-${String(eventMonth).padStart(2, '0')}-${String(eventDay).padStart(2, '0')}`;

      if (year && eventYear !== year) continue;
      if (month && eventMonth !== month) continue;

      const desc = (event.description || '').trim().toLowerCase();
      if (EXCLUDED_CATEGORIES.has(desc)) continue;

      const rawType = event.description || "";

      const cleanType = rawType.split("\n")[0].trim();

      holidays.push({
        name: event.summary,
        date: dateStr,
        day: d.toLocaleDateString("en-IN", { weekday: "long" }),
        type: cleanType,
      });
    }

    holidays.sort((a, b) => new Date(a.date) - new Date(b.date));
    return holidays;

  } catch (err) {
    console.error("Error:", err);
    return [];
  }
}

export default getIndianHolidays;