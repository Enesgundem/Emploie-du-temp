/**
 * ICSParser - Module autonome de parsing iCalendar (RFC 5545)
 * Conçu spécialement pour les exports ADE Campus, Google Agenda, Outlook, etc.
 */
const ICSParser = (function () {
  'use strict';

  function unfoldLines(icsContent) {
    const rawLines = icsContent.split(/\r?\n/);
    const lines = [];
    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      while (i + 1 < rawLines.length && (rawLines[i + 1].startsWith(' ') || rawLines[i + 1].startsWith('\t'))) {
        line += rawLines[i + 1].slice(1);
        i++;
      }
      lines.push(line);
    }
    return lines;
  }

  function parseDate(dateStr) {
    if (!dateStr) return null;
    // Format YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
    const mTime = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (mTime) {
      const isUTC = Boolean(mTime[7]);
      if (isUTC) {
        return new Date(Date.UTC(+mTime[1], +mTime[2] - 1, +mTime[3], +mTime[4], +mTime[5], +mTime[6]));
      } else {
        return new Date(+mTime[1], +mTime[2] - 1, +mTime[3], +mTime[4], +mTime[5], +mTime[6]);
      }
    }
    // Format YYYYMMDD (All day)
    const mDate = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (mDate) {
      return new Date(+mDate[1], +mDate[2] - 1, +mDate[3], 0, 0, 0);
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  function cleanDescription(desc) {
    if (!desc) return { prof: '', group: '', raw: '' };
    const unescaped = desc.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';');
    const lines = unescaped.split('\n').map(l => l.trim()).filter(Boolean);
    let prof = '', groups = [];
    lines.forEach(l => {
      if (l.startsWith('(Exporté')) return;
      if (/^[A-Z][0-9]+(\.[0-9]+)?$/.test(l) || /^[BC][0-9]/.test(l) || l.includes('MMIm') || l.includes('BUT')) {
        groups.push(l);
      } else if (/[A-Z\s]{4,}/.test(l) || /^[A-ZÀ-ÿ\s-]{4,}$/.test(l)) {
        if (!prof && !l.includes('BUT') && !l.includes('IUT')) prof = l;
      }
    });
    return { prof, group: groups.join(' - '), raw: unescaped };
  }

  function formatTitle(summary) {
    if (!summary) return 'Cours';
    return summary.replace(/_MMIm3$/i, '').trim();
  }

  function parse(icsString) {
    const lines = unfoldLines(icsString);
    let inEvent = false;
    let cur = {};
    const events = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === 'BEGIN:VEVENT') {
        inEvent = true;
        cur = {};
      } else if (line === 'END:VEVENT') {
        inEvent = false;
        if (cur.DTSTART && cur.DTEND) {
          const startDate = parseDate(cur.DTSTART);
          const endDate = parseDate(cur.DTEND);
          if (startDate && endDate) {
            const desc = cleanDescription(cur.DESCRIPTION);
            events.push({
              id: 'ics_' + (cur.UID ? cur.UID.replace(/[^a-zA-Z0-9_-]/g, '') : Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
              title: formatTitle(cur.SUMMARY),
              fullTitle: cur.SUMMARY ? cur.SUMMARY.trim() : 'Cours',
              location: cur.LOCATION ? cur.LOCATION.trim() : '',
              teacher: desc.prof,
              group: desc.group,
              description: desc.raw,
              category: 'cours',
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              isSchool: true
            });
          }
        }
      } else if (inEvent) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const keyPart = line.substring(0, colonIdx);
          const val = line.substring(colonIdx + 1);
          const key = keyPart.split(';')[0].toUpperCase();
          cur[key] = val;
        }
      }
    }
    return events;
  }

  return {
    parse,
    parseDate
  };
})();

if (typeof module !== 'undefined') {
  module.exports = ICSParser;
}
