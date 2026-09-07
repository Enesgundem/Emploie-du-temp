const fs = require('fs');
const path = require('path');

const icsPath = path.join(__dirname, '..', 'ADECal.ics');
const content = fs.readFileSync(icsPath, 'utf8');
const lines = content.split(/\r?\n/);
let inEvent = false, cur = {}, events = [];

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
    line += lines[i + 1].slice(1);
    i++;
  }
  if (line === 'BEGIN:VEVENT') {
    inEvent = true;
    cur = {};
  } else if (line === 'END:VEVENT') {
    inEvent = false;
    events.push(cur);
  } else if (inEvent) {
    const idx = line.indexOf(':');
    if (idx !== -1) {
      const key = line.substring(0, idx).split(';')[0];
      const val = line.substring(idx + 1);
      cur[key] = val;
    }
  }
}

function parseICSDate(str) {
  const m = str ? str.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/) : null;
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

function cleanDescription(desc) {
  if (!desc) return { prof: '', group: '', raw: '' };
  const unescaped = desc.replace(/\\n/g, '\n').replace(/\\,/g, ',');
  const lines = unescaped.split('\n').map(l => l.trim()).filter(Boolean);
  let prof = '', groups = [];
  lines.forEach(l => {
    if (l.startsWith('(Exporté')) return;
    if (/^[A-Z][0-9]+(\.[0-9]+)?$/.test(l) || /^[BC][0-9]/.test(l) || l.includes('MMIm') || l.includes('BUT')) {
      groups.push(l);
    } else if (/[A-Z\s]{4,}/.test(l) || /^[A-ZÀ-ÿ\s-]+$/.test(l)) {
      prof = l;
    }
  });
  return { prof, group: groups.join(' - '), raw: unescaped };
}

// Function to simplify course titles for clean display
function formatCourseTitle(summary) {
  if (!summary) return 'Cours';
  let title = summary.trim();
  // Remove suffix like _MMIm3 or -TDB_MMIm3
  title = title.replace(/_MMIm3$/i, '').trim();
  return title;
}

const parsedCourses = events.map((e, idx) => {
  const start = parseICSDate(e.DTSTART);
  const end = parseICSDate(e.DTEND);
  const descInfo = cleanDescription(e.DESCRIPTION);
  return {
    id: 'ade_' + (e.UID ? e.UID.replace(/[^a-zA-Z0-9_-]/g, '') : idx),
    title: formatCourseTitle(e.SUMMARY),
    fullTitle: e.SUMMARY ? e.SUMMARY.trim() : '',
    location: e.LOCATION ? e.LOCATION.trim() : '',
    teacher: descInfo.prof,
    group: descInfo.group,
    description: descInfo.raw,
    category: 'cours',
    start: start ? start.toISOString() : null,
    end: end ? end.toISOString() : null,
    isSchool: true
  };
}).filter(e => e.start && e.end);

console.log(`Parsed ${parsedCourses.length} courses from ADECal.ics`);

// Now generate recurring events:
// 1. Weekend Work:
//    Saturday: 12h30 - 20h30
//    Sunday: 11h00 - 19h00
// 2. Volleyball:
//    Friday: 20h30 - 22h30 (every week)
//    Monday & Tuesday: 20h30 - 22h30 (1 week out of 2, starting next week: Sept 14, 2026)
// 3. Alternance:
//    Every weekday (Monday to Friday) with NO courses from Sept 14, 2026 to June 30, 2027:
//    Monday to Thursday: 09h00 - 17h00 (Entreprise)
//    Friday: 09h00 - 17h00 (Télétravail / TT)

const recurringEvents = [];

function addDays(d, days) {
  const res = new Date(d);
  res.setDate(res.getDate() + days);
  return res;
}

function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Map dates that already have university courses
const courseDays = new Set();
parsedCourses.forEach(c => {
  const d = new Date(c.start);
  courseDays.add(formatYMD(d));
});

// Start from Monday 2026-08-31
let curMonday = new Date('2026-08-31T00:00:00Z');
const endDate = new Date('2027-07-31T00:00:00Z');

let weekIndex = 0; // week 0 = Aug 31-Sept 6. Week 1 = Sept 7-13 (current week). Week 2 = Sept 14-20 (alternance & volley start Mon/Tue!).

while (curMonday < endDate) {
  const mon = addDays(curMonday, 0);
  const tue = addDays(curMonday, 1);
  const wed = addDays(curMonday, 2);
  const thu = addDays(curMonday, 3);
  const fri = addDays(curMonday, 4);
  const sat = addDays(curMonday, 5);
  const sun = addDays(curMonday, 6);

  const getISOTime = (dateObj, hour, minute) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}:00`;
  };

  // Only add from week 1 onwards (Sept 7, 2026)
  if (weekIndex >= 1) {
    // Samedi travail : 12h30 - 20h30 avec PAUSE 15h00 - 16h00
    // Bloc 1 : 12h30 - 15h00
    recurringEvents.push({
      id: `work_sat_1_${weekIndex}`,
      title: 'Travail',
      category: 'travail',
      location: 'Poste week-end',
      description: 'Shift travail samedi (début)',
      start: getISOTime(sat, 12, 30),
      end: getISOTime(sat, 15, 0),
      isRecurring: true,
      recurringRule: 'WEEKEND_WORK'
    });
    // Pause Samedi : 15h00 - 16h00
    recurringEvents.push({
      id: `pause_sat_${weekIndex}`,
      title: 'Pause boulot',
      category: 'pause',
      location: 'Salle de pause',
      description: 'Pause repas / repos boulot (1h)',
      start: getISOTime(sat, 15, 0),
      end: getISOTime(sat, 16, 0),
      isRecurring: true,
      isPause: true
    });
    // Bloc 2 : 16h00 - 20h30
    recurringEvents.push({
      id: `work_sat_2_${weekIndex}`,
      title: 'Travail',
      category: 'travail',
      location: 'Poste week-end',
      description: 'Shift travail samedi (fin)',
      start: getISOTime(sat, 16, 0),
      end: getISOTime(sat, 20, 30),
      isRecurring: true,
      recurringRule: 'WEEKEND_WORK'
    });

    // Dimanche travail : 11h00 - 19h00 avec PAUSE 14h00 - 15h00
    // Bloc 1 : 11h00 - 14h00
    recurringEvents.push({
      id: `work_sun_1_${weekIndex}`,
      title: 'Travail',
      category: 'travail',
      location: 'Poste week-end',
      description: 'Shift travail dimanche (début)',
      start: getISOTime(sun, 11, 0),
      end: getISOTime(sun, 14, 0),
      isRecurring: true,
      recurringRule: 'WEEKEND_WORK'
    });
    // Pause Dimanche : 14h00 - 15h00
    recurringEvents.push({
      id: `pause_sun_${weekIndex}`,
      title: 'Pause boulot',
      category: 'pause',
      location: 'Salle de pause',
      description: 'Pause repas / repos boulot (1h)',
      start: getISOTime(sun, 14, 0),
      end: getISOTime(sun, 15, 0),
      isRecurring: true,
      isPause: true
    });
    // Bloc 2 : 15h00 - 19h00
    recurringEvents.push({
      id: `work_sun_2_${weekIndex}`,
      title: 'Travail',
      category: 'travail',
      location: 'Poste week-end',
      description: 'Shift travail dimanche (fin)',
      start: getISOTime(sun, 15, 0),
      end: getISOTime(sun, 19, 0),
      isRecurring: true,
      recurringRule: 'WEEKEND_WORK'
    });

    // Friday volleyball: 20h30 - 22h30 every week
    recurringEvents.push({
      id: `volley_fri_${weekIndex}`,
      title: 'Volley-ball',
      category: 'sport',
      location: 'Gymnase',
      description: 'Entraînement de volley hebdomadaire',
      start: getISOTime(fri, 20, 30),
      end: getISOTime(fri, 22, 30),
      isRecurring: true,
      recurringRule: 'VOLLEY_FRIDAY'
    });

    // Monday & Tuesday volleyball: 1 week out of 2, starting week 2 (Sept 14, 2026)
    if (weekIndex >= 2 && weekIndex % 2 === 0) {
      recurringEvents.push({
        id: `volley_mon_${weekIndex}`,
        title: 'Volley-ball',
        category: 'sport',
        location: 'Gymnase',
        description: 'Séance de volley-ball (1 semaine sur 2)',
        start: getISOTime(mon, 20, 30),
        end: getISOTime(mon, 22, 30),
        isRecurring: true,
        recurringRule: 'VOLLEY_BIWEEKLY'
      });

      recurringEvents.push({
        id: `volley_tue_${weekIndex}`,
        title: 'Volley-ball',
        category: 'sport',
        location: 'Gymnase',
        description: 'Séance de volley-ball (1 semaine sur 2)',
        start: getISOTime(tue, 20, 30),
        end: getISOTime(tue, 22, 30),
        isRecurring: true,
        recurringRule: 'VOLLEY_BIWEEKLY'
      });
    }

    // Alternance: 09h00 - 17h00 avec PAUSE 13h00 - 14h00 on weekdays without courses
    const weekdays = [
      { d: mon, name: 'Lundi' },
      { d: tue, name: 'Mardi' },
      { d: wed, name: 'Mercredi' },
      { d: thu, name: 'Jeudi' },
      { d: fri, name: 'Vendredi', isTT: true }
    ];

    weekdays.forEach((dayInfo, dIdx) => {
      const dayStr = formatYMD(dayInfo.d);
      if (weekIndex >= 2 && !courseDays.has(dayStr)) {
        const titlePrefix = dayInfo.isTT ? 'Alternance (Télétravail)' : 'Alternance (Entreprise)';
        const loc = dayInfo.isTT ? 'À domicile (TT)' : 'En entreprise';

        // Bloc Matin : 09h00 - 13h00 (4h)
        recurringEvents.push({
          id: `alt_${dayInfo.name.toLowerCase()}_m_${weekIndex}_${dIdx}`,
          title: titlePrefix,
          category: 'alternance',
          location: loc,
          description: dayInfo.isTT ? 'Matinée en télétravail' : 'Matinée en entreprise',
          start: getISOTime(dayInfo.d, 9, 0),
          end: getISOTime(dayInfo.d, 13, 0),
          isRecurring: true,
          isTT: Boolean(dayInfo.isTT)
        });

        // Pause Déjeuner : 13h00 - 14h00 (1h)
        recurringEvents.push({
          id: `alt_pause_${dayInfo.name.toLowerCase()}_${weekIndex}_${dIdx}`,
          title: 'Pause déjeuner',
          category: 'pause',
          location: dayInfo.isTT ? 'À domicile' : 'Restaurant / Cafétéria',
          description: 'Pause déjeuner (13h00 - 14h00)',
          start: getISOTime(dayInfo.d, 13, 0),
          end: getISOTime(dayInfo.d, 14, 0),
          isRecurring: true,
          isPause: true
        });

        // Bloc Après-midi : 14h00 - 17h00 (3h)
        recurringEvents.push({
          id: `alt_${dayInfo.name.toLowerCase()}_a_${weekIndex}_${dIdx}`,
          title: titlePrefix,
          category: 'alternance',
          location: loc,
          description: dayInfo.isTT ? 'Après-midi en télétravail' : 'Après-midi en entreprise',
          start: getISOTime(dayInfo.d, 14, 0),
          end: getISOTime(dayInfo.d, 17, 0),
          isRecurring: true,
          isTT: Boolean(dayInfo.isTT)
        });
      }
    });
  }

  curMonday = addDays(curMonday, 7);
  weekIndex++;
}

console.log(`Generated ${recurringEvents.length} recurring work & volley events`);

const allInitialEvents = [...parsedCourses, ...recurringEvents];
console.log(`Total initial events: ${allInitialEvents.length}`);

const jsContent = `// Données initiales générées pour Mon Emploi du Temps
const INITIAL_COURSES = ${JSON.stringify(parsedCourses, null, 2)};
const INITIAL_RECURRING_EVENTS = ${JSON.stringify(recurringEvents, null, 2)};
const ALL_DEFAULT_EVENTS = ${JSON.stringify(allInitialEvents, null, 2)};

if (typeof module !== 'undefined') {
  module.exports = { INITIAL_COURSES, INITIAL_RECURRING_EVENTS, ALL_DEFAULT_EVENTS };
}
`;

fs.writeFileSync(path.join(__dirname, '..', 'default-events.js'), jsContent, 'utf8');
console.log('Successfully written default-events.js');
