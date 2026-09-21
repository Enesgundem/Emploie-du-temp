/**
 * Mon Emploi du Temps - Application Principale
 * Gestionnaire d'agenda moderne, fluide et réactif
 */

(function () {
  'use strict';

  // Constantes de grille
  const GRID_START_HOUR = 6;  // 06:00
  const GRID_END_HOUR = 23;   // 23:00
  const TOTAL_HOURS = GRID_END_HOUR - GRID_START_HOUR; // 17 heures
  const HOUR_HEIGHT = 62;     // 62px par heure

  // Clé de stockage local
  const STORAGE_KEY = 'mon_emploi_du_temps_v4_events';
  const PREV_STORAGE_KEY = 'mon_emploi_du_temps_v3_events';

  // État de l'application
  const state = {
    events: [],
    currentMonday: null,
    activeCategories: new Set(['all', 'cours', 'alternance', 'travail', 'sport', 'medical', 'perso', 'pause']),
    selectedEvent: null,
    viewMode: window.innerWidth <= 768 ? 'day' : 'week',
    selectedDayIndex: 0
  };

  // Cache pour l'optimisation des calculs statistiques de 940+ créneaux
  let cachedSubjectsData = null;
  let cachedAlternanceData = null;
  let eventsDataDirty = true;

  function markEventsDirty() {
    eventsDataDirty = true;
    cachedSubjectsData = null;
    cachedAlternanceData = null;
  }

  // Utilitaire de debounce pour la saisie ultra-fluide (60fps)
  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Noms des mois et jours en français
  const MONTH_NAMES = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];
  const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  /* ==========================================================================
     INITIALISATION
     ========================================================================== */
  function init() {
    initTheme();
    loadEvents();
    initCurrentDate();
    buildTimeAxis();
    bindEvents();
    render();
    startLiveClock();
    updateNextEventWidget();
    updateLiveTimeIndicator();
    setViewMode(state.viewMode);
  }

  // Gestion des Thèmes (Sombre / Clair)
  const THEME_KEY = 'mon_emploi_du_temps_theme';

  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(savedTheme);
  }

  function applyTheme(theme) {
    const sunIcon = document.querySelector('.icon-sun');
    const moonIcon = document.querySelector('.icon-moon');

    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      if (sunIcon) sunIcon.style.display = 'block';
      if (moonIcon) moonIcon.style.display = 'none';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (sunIcon) sunIcon.style.display = 'none';
      if (moonIcon) moonIcon.style.display = 'block';
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = (current === 'light') ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, newTheme);
    applyTheme(newTheme);
    showToast(newTheme === 'light' ? 'Thème clair activé' : 'Thème sombre activé');
  }

  // Chargement des données (localStorage ou défaut)
  function loadEvents() {
    try {
      let stored = localStorage.getItem(STORAGE_KEY);
      if (!stored && localStorage.getItem(PREV_STORAGE_KEY)) {
        // Migration depuis v3 vers v4 : recharger le calendrier sans alternance le 11 nov tout en préservant les créneaux créés par l'utilisateur
        const oldEvents = JSON.parse(localStorage.getItem(PREV_STORAGE_KEY));
        const userEvents = Array.isArray(oldEvents) ? oldEvents.filter(ev => ev.id && ev.id.startsWith('user_')) : [];
        if (typeof ALL_DEFAULT_EVENTS !== 'undefined' && Array.isArray(ALL_DEFAULT_EVENTS)) {
          state.events = [...ALL_DEFAULT_EVENTS, ...userEvents];
        } else {
          state.events = Array.isArray(oldEvents) ? oldEvents.filter(ev => !ev.start || !ev.start.includes('2026-11-11') || ev.category !== 'alternance') : [];
        }
        saveEvents();
        return;
      }

      if (stored) {
        state.events = JSON.parse(stored);
      } else if (typeof ALL_DEFAULT_EVENTS !== 'undefined' && Array.isArray(ALL_DEFAULT_EVENTS)) {
        state.events = [...ALL_DEFAULT_EVENTS];
        saveEvents();
      } else {
        state.events = [];
      }
    } catch (e) {
      console.error('Erreur chargement localStorage:', e);
      state.events = (typeof ALL_DEFAULT_EVENTS !== 'undefined') ? [...ALL_DEFAULT_EVENTS] : [];
    }
    markEventsDirty();
  }

  function saveEvents() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
      markEventsDirty();
      updateFooterCount();
    } catch (e) {
      console.error('Erreur sauvegarde localStorage:', e);
    }
  }

  // Initialisation sur la date actuelle ou rentrée 2026
  function initCurrentDate() {
    const now = new Date();
    const minAcademicDate = new Date('2026-08-25T00:00:00');
    const maxAcademicDate = new Date('2027-08-01T23:59:59');

    if (now >= minAcademicDate && now <= maxAcademicDate) {
      state.currentMonday = getMonday(now);
      const day = now.getDay();
      state.selectedDayIndex = (day === 0 ? 6 : day - 1);
    } else {
      // Si la date système est hors de l'année universitaire 2026-2027, caler sur la rentrée de septembre 2026
      state.currentMonday = getMonday(new Date('2026-09-07T00:00:00'));
      state.selectedDayIndex = 0;
    }
  }

  function goToToday() {
    const now = new Date();
    const minAcademicDate = new Date('2026-08-25T00:00:00');
    const maxAcademicDate = new Date('2027-08-01T23:59:59');

    if (now >= minAcademicDate && now <= maxAcademicDate) {
      state.currentMonday = getMonday(now);
      const day = now.getDay();
      state.selectedDayIndex = (day === 0 ? 6 : day - 1);
    } else {
      state.currentMonday = getMonday(new Date('2026-09-07T00:00:00'));
      state.selectedDayIndex = 0;
      showToast('Planning calé sur la rentrée universitaire 2026-2027');
    }
    render();
    updateDayColumnsVisibility();
  }

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // ajuster pour le Lundi
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function getISOWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function formatYMD(d) {
    if (!d) return '';
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Jours fériés légaux français (2026-2027)
  const FRENCH_HOLIDAYS_MAP = {
    '2026-11-01': 'Toussaint',
    '2026-11-11': 'Armistice 1918',
    '2026-12-25': 'Noël',
    '2027-01-01': "Jour de l'An",
    '2027-03-29': 'Lundi de Pâques',
    '2027-05-01': 'Fête du Travail',
    '2027-05-06': 'Ascension',
    '2027-05-08': 'Victoire 1945',
    '2027-05-17': 'Lundi de Pentecôte',
    '2027-07-14': 'Fête Nationale',
    '2027-08-15': 'Assomption'
  };

  /* ==========================================================================
     CONSTRUCTION DE LA GRILLE
     ========================================================================== */
  function buildTimeAxis() {
    const timeAxisCol = document.getElementById('timeAxisCol');
    if (!timeAxisCol) return;
    timeAxisCol.innerHTML = '';

    for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) {
      const slot = document.createElement('div');
      slot.className = 'time-slot-label';
      const hh = String(h).padStart(2, '0');
      slot.textContent = `${hh}:00`;
      timeAxisCol.appendChild(slot);
    }
  }

  /* ==========================================================================
     RENDU PRINCIPAL
     ========================================================================== */
  function render() {
    updateWeekHeader();
    renderDayHeaders();
    renderEvents();
    updateWeeklyStats();
    updateNextEventWidget();
    updateLiveTimeIndicator();
    updateFooterCount();
  }

  function updateWeekHeader() {
    const monday = state.currentMonday;
    const sunday = addDays(monday, 6);

    const monD = monday.getDate();
    const monM = MONTH_NAMES[monday.getMonth()];
    const sunD = sunday.getDate();
    const sunM = MONTH_NAMES[sunday.getMonth()];
    const year = sunday.getFullYear();

    let titleStr = '';
    if (monM === sunM) {
      titleStr = `Semaine du ${monD} au ${sunD} ${sunM} ${year}`;
    } else {
      titleStr = `Semaine du ${monD} ${monM} au ${sunD} ${sunM} ${year}`;
    }

    const titleEl = document.getElementById('currentWeekTitle');
    if (titleEl) titleEl.textContent = titleStr;

    const badgeEl = document.getElementById('weekNumberBadge');
    if (badgeEl) badgeEl.textContent = `Semaine ${getISOWeekNumber(monday)}`;

    const datePicker = document.getElementById('dateJumpInput');
    if (datePicker) {
      const y = monday.getFullYear();
      const m = String(monday.getMonth() + 1).padStart(2, '0');
      const d = String(monday.getDate()).padStart(2, '0');
      datePicker.value = `${y}-${m}-${d}`;
    }
  }

  function renderDayHeaders() {
    const now = new Date();
    const isThisWeek = (now >= state.currentMonday && now < addDays(state.currentMonday, 7));
    const todayIndex = isThisWeek ? (now.getDay() === 0 ? 6 : now.getDay() - 1) : -1;

    for (let i = 0; i < 7; i++) {
      const dayDate = addDays(state.currentMonday, i);
      const dayYmd = formatYMD(dayDate);
      const holidayName = FRENCH_HOLIDAYS_MAP[dayYmd];

      const headerEl = document.getElementById(`headerDay${i}`);
      const dayColEl = document.getElementById(`dayCol${i}`);
      const tabEl = document.getElementById(`mTab${i}`);

      if (headerEl) {
        const nameEl = headerEl.querySelector('.day-name');
        const numEl = headerEl.querySelector('.day-number');
        if (nameEl) nameEl.textContent = DAY_NAMES[i];
        if (numEl) numEl.textContent = dayDate.getDate();

        // Enlever ancien tag férié s'il existe
        headerEl.querySelector('.holiday-header-tag')?.remove();

        if (holidayName) {
          headerEl.classList.add('is-holiday');
          headerEl.title = `Jour férié : ${holidayName}`;
          const holidayTag = document.createElement('span');
          holidayTag.className = 'holiday-header-tag';
          holidayTag.textContent = 'Férié';
          holidayTag.title = holidayName;
          headerEl.appendChild(holidayTag);
        } else {
          headerEl.classList.remove('is-holiday');
          headerEl.removeAttribute('title');
        }

        if (i === todayIndex) {
          headerEl.classList.add('today');
        } else {
          headerEl.classList.remove('today');
        }
      }

      if (dayColEl) {
        if (holidayName) {
          dayColEl.classList.add('is-holiday-col');
          dayColEl.title = `Jour férié : ${holidayName}`;
        } else {
          dayColEl.classList.remove('is-holiday-col');
          dayColEl.removeAttribute('title');
        }

        if (i === todayIndex) {
          dayColEl.classList.add('today-col');
        } else {
          dayColEl.classList.remove('today-col');
        }
      }

      // Mise à jour de l'onglet mobile
      if (tabEl) {
        const tabNumEl = tabEl.querySelector('.m-day-num');
        if (tabNumEl) tabNumEl.textContent = dayDate.getDate();

        if (holidayName) {
          tabEl.classList.add('is-holiday-tab');
          tabEl.title = `Jour férié : ${holidayName}`;
        } else {
          tabEl.classList.remove('is-holiday-tab');
          tabEl.removeAttribute('title');
        }

        if (i === todayIndex) {
          tabEl.classList.add('is-today');
        } else {
          tabEl.classList.remove('is-today');
        }
      }
    }

    updateDayColumnsVisibility();
  }

  /* ==========================================================================
     GESTION DU MODE D'AFFICHAGE (JOUR / SEMAINE) & NAVIGATION MOBILE
     ========================================================================== */
  function setViewMode(mode) {
    state.viewMode = mode;
    const dayBtn = document.getElementById('viewModeDayBtn');
    const weekBtn = document.getElementById('viewModeWeekBtn');
    const container = document.getElementById('scheduleContainer');
    const daySelector = document.getElementById('mobileDaySelector');

    if (dayBtn && weekBtn) {
      dayBtn.classList.toggle('active', mode === 'day');
      weekBtn.classList.toggle('active', mode === 'week');
    }

    if (container) {
      container.classList.toggle('view-mode-day', mode === 'day');
      container.classList.toggle('view-mode-week', mode === 'week');
    }

    if (daySelector) {
      daySelector.style.display = (mode === 'day' || window.innerWidth <= 768) ? 'grid' : 'none';
    }

    updateDayColumnsVisibility();
    updateLiveTimeIndicator();
  }

  function selectDay(dayIndex) {
    state.selectedDayIndex = Math.max(0, Math.min(6, dayIndex));
    updateDayColumnsVisibility();
    updateLiveTimeIndicator();
  }

  function goToNextDay() {
    if (state.selectedDayIndex < 6) {
      selectDay(state.selectedDayIndex + 1);
    } else {
      state.currentMonday = addDays(state.currentMonday, 7);
      state.selectedDayIndex = 0;
      render();
    }
  }

  function goToPrevDay() {
    if (state.selectedDayIndex > 0) {
      selectDay(state.selectedDayIndex - 1);
    } else {
      state.currentMonday = addDays(state.currentMonday, -7);
      state.selectedDayIndex = 6;
      render();
    }
  }

  function updateDayColumnsVisibility() {
    const isDayMode = (state.viewMode === 'day');
    const container = document.getElementById('scheduleContainer');
    if (container) {
      container.classList.toggle('view-mode-day', isDayMode);
      container.classList.toggle('view-mode-week', !isDayMode);
    }

    for (let i = 0; i < 7; i++) {
      const headerEl = document.getElementById(`headerDay${i}`);
      const dayColEl = document.getElementById(`dayCol${i}`);
      const tabEl = document.getElementById(`mTab${i}`);

      const isActive = (i === state.selectedDayIndex);

      if (headerEl) {
        headerEl.classList.toggle('active-day', isActive);
      }
      if (dayColEl) {
        dayColEl.classList.toggle('active-col', isActive);
      }
      if (tabEl) {
        tabEl.classList.toggle('active', isActive);
      }
    }
  }

  /* ==========================================================================
     CALCUL ET RENDU DES ÉVÉNEMENTS
     ========================================================================== */
  function parseEventDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    return new Date(val);
  }

  function getEventsForDay(dayIndex) {
    const dayStart = addDays(state.currentMonday, dayIndex);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = addDays(dayStart, 1);

    return state.events.filter(ev => {
      // Filtrer selon la catégorie active
      if (!state.activeCategories.has('all') && !state.activeCategories.has(ev.category)) {
        return false;
      }

      const s = parseEventDate(ev.start);
      const e = parseEventDate(ev.end);
      if (!s || !e) return false;

      // Correspond au jour
      return (s < dayEnd && e > dayStart);
    });
  }

  // Algorithme d'agencement des chevauchements (Overlapping Layout)
  function layoutDayEvents(events) {
    if (events.length === 0) return [];

    // Convertir en minutes depuis minuit
    const items = events.map(ev => {
      const s = parseEventDate(ev.start);
      const e = parseEventDate(ev.end);

      // Calculer minutes du jour
      const startMin = s.getHours() * 60 + s.getMinutes();
      let endMin = e.getHours() * 60 + e.getMinutes();
      if (endMin <= startMin) endMin = startMin + 60; // Au moins 1h par défaut

      return {
        event: ev,
        startMin,
        endMin,
        col: 0,
        totalCols: 1
      };
    }).sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

    // Regrouper par groupes qui se chevauchent
    const clusters = [];
    let currentCluster = [];
    let clusterEnd = -1;

    items.forEach(item => {
      if (item.startMin >= clusterEnd) {
        if (currentCluster.length > 0) clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.endMin;
      } else {
        currentCluster.push(item);
        if (item.endMin > clusterEnd) clusterEnd = item.endMin;
      }
    });
    if (currentCluster.length > 0) clusters.push(currentCluster);

    // Dans chaque cluster, assigner les colonnes
    clusters.forEach(cluster => {
      const columns = []; // chaque colonne garde l'heure de fin max
      cluster.forEach(item => {
        let placed = false;
        for (let c = 0; c < columns.length; c++) {
          if (item.startMin >= columns[c]) {
            item.col = c;
            columns[c] = item.endMin;
            placed = true;
            break;
          }
        }
        if (!placed) {
          item.col = columns.length;
          columns.push(item.endMin);
        }
      });
      const total = columns.length;
      cluster.forEach(item => {
        item.totalCols = total;
      });
    });

    return items;
  }

  function renderEvents() {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const layer = document.getElementById(`dayEvents${dayIdx}`);
      if (!layer) continue;
      layer.innerHTML = '';

      const dayDate = addDays(state.currentMonday, dayIdx);
      const dayYmd = formatYMD(dayDate);
      const holidayName = FRENCH_HOLIDAYS_MAP[dayYmd];

      const dayEvents = getEventsForDay(dayIdx);
      const positionedItems = layoutDayEvents(dayEvents);
      const fragment = document.createDocumentFragment();

      positionedItems.forEach(item => {
        const ev = item.event;
        const card = createEventCard(ev, item.startMin, item.endMin, item.col, item.totalCols);
        fragment.appendChild(card);
      });

      // Filigrane / badge discret pour jour férié
      if (holidayName && dayEvents.length === 0) {
        const watermark = document.createElement('div');
        watermark.className = 'holiday-day-watermark';
        watermark.innerHTML = `
          <div class="holiday-watermark-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <span class="holiday-watermark-title">Jour férié</span>
          <span class="holiday-watermark-desc">${escapeHtml(holidayName)}</span>
        `;
        fragment.appendChild(watermark);
      }

      layer.appendChild(fragment);
    }
  }

  function createEventCard(ev, startMin, endMin, col, totalCols) {
    const card = document.createElement('div');
    const cat = ev.category || 'cours';
    card.className = `event-card cat-${cat}`;
    card.setAttribute('data-id', ev.id);

    // Calcul de la position et dimensions
    const gridStartMinutes = GRID_START_HOUR * 60;
    const clampedStart = Math.max(gridStartMinutes, startMin);
    const clampedEnd = Math.min(GRID_END_HOUR * 60, endMin);
    const duration = Math.max(20, clampedEnd - clampedStart);

    const topPx = ((clampedStart - gridStartMinutes) / 60) * HOUR_HEIGHT;
    const heightPx = Math.max(26, (duration / 60) * HOUR_HEIGHT - 2);

    // Largeur et décalage horizontal
    const colWidthPct = 100 / totalCols;
    const leftPct = col * colWidthPct;

    card.style.top = `${topPx}px`;
    card.style.height = `${heightPx}px`;
    card.style.left = `calc(${leftPct}% + 1px)`;
    card.style.width = `calc(${colWidthPct}% - 3px)`;

    if (duration < 45) {
      card.classList.add('compact');
    }

    // Formatage des heures
    const sDate = parseEventDate(ev.start);
    const eDate = parseEventDate(ev.end);
    const timeStr = `${formatTime(sDate)} - ${formatTime(eDate)}`;

    // Nom de catégorie affichable
    let catLabel = 'Cours';
    if (cat === 'alternance') {
      if (ev.isTT) {
        card.classList.add('is-tt');
        catLabel = 'Télétravail';
      } else {
        catLabel = 'Alternance';
      }
    } else if (cat === 'travail') {
      catLabel = 'Travail';
    } else if (cat === 'sport') {
      catLabel = 'Volley';
    } else if (cat === 'medical') {
      catLabel = 'Médical';
    } else if (cat === 'perso') {
      catLabel = 'Personnel';
    } else if (cat === 'pause') {
      catLabel = 'Pause';
    }

    card.innerHTML = `
      <div class="event-header-row">
        <span class="event-time-badge">${timeStr}</span>
        <span class="event-category-tag">${catLabel}</span>
      </div>
      <div class="event-title" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>
      ${(ev.location || ev.teacher) ? `
        <div class="event-meta-row">
          ${ev.location ? `
            <span class="event-location-pill">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>${escapeHtml(ev.location)}</span>
            </span>
          ` : ''}
          ${ev.teacher ? `<span class="event-teacher">${escapeHtml(ev.teacher)}</span>` : ''}
        </div>
      ` : ''}
    `;

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetailModal(ev);
    });

    return card;
  }

  function formatTime(d) {
    if (!d) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ==========================================================================
     STATISTIQUES HEBDOMADAIRES
     ========================================================================== */
  function updateWeeklyStats() {
    const monday = state.currentMonday;
    const sunday = addDays(monday, 7);

    let coursMinutes = 0;
    let alternanceMinutes = 0;
    let travailMinutes = 0;
    let sportMinutes = 0;
    let totalMinutes = 0;

    state.events.forEach(ev => {
      const s = parseEventDate(ev.start);
      const e = parseEventDate(ev.end);
      if (!s || !e) return;

      if (s >= monday && s < sunday) {
        const durationMin = Math.max(0, (e.getTime() - s.getTime()) / 60000);
        totalMinutes += durationMin;

        if (ev.category === 'cours') coursMinutes += durationMin;
        else if (ev.category === 'alternance') alternanceMinutes += durationMin;
        else if (ev.category === 'travail') travailMinutes += durationMin;
        else if (ev.category === 'sport') sportMinutes += durationMin;
      }
    });

    const formatHours = (mins) => {
      const h = Math.floor(mins / 60);
      const m = Math.round(mins % 60);
      if (m === 0) return `${h} h`;
      return `${h}h${String(m).padStart(2, '0')}`;
    };

    const coursEl = document.getElementById('statsCoursHours');
    if (coursEl) coursEl.textContent = formatHours(coursMinutes);

    const altEl = document.getElementById('statsAlternanceHours');
    if (altEl) altEl.textContent = formatHours(alternanceMinutes);

    const travailEl = document.getElementById('statsTravailHours');
    if (travailEl) travailEl.textContent = formatHours(travailMinutes);

    const sportEl = document.getElementById('statsSportHours');
    if (sportEl) sportEl.textContent = formatHours(sportMinutes);

    const totalEl = document.getElementById('statsTotalHours');
    if (totalEl) totalEl.textContent = formatHours(totalMinutes);

    // Tip dynamique pour le volley
    const tipTitle = document.getElementById('statsTipTitle');
    const tipDesc = document.getElementById('statsTipDesc');
    const weekNum = getISOWeekNumber(monday);

    // Si semaine 37 (semaine du 7 sept 2026) -> reprise la semaine pro
    if (monday.getFullYear() === 2026 && monday.getMonth() === 8 && monday.getDate() >= 7 && monday.getDate() <= 13) {
      if (tipTitle) tipTitle.textContent = 'Volley Lun/Mar :';
      if (tipDesc) tipDesc.textContent = 'Début semaine prochaine (14 sept.)';
    } else if (weekNum % 2 === 0) {
      if (tipTitle) tipTitle.textContent = 'Semaine Volley+ :';
      if (tipDesc) tipDesc.textContent = 'Séances Lun, Mar et Ven (20h30)';
    } else {
      if (tipTitle) tipTitle.textContent = 'Semaine standard :';
      if (tipDesc) tipDesc.textContent = 'Séance de Volley le Vendredi 20h30';
    }
  }

  /* ==========================================================================
     HORLOGE EN DIRECT & PROCHAIN ÉVÉNEMENT
     ========================================================================== */
  function startLiveClock() {
    function updateClock() {
      const now = new Date();
      const clockEl = document.getElementById('liveClock');
      const dateEl = document.getElementById('liveDate');

      if (clockEl) {
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = `${hh}:${mm}:${ss}`;
      }

      if (dateEl) {
        const shortDays = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
        const shortMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
        const dayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
        const dayNum = now.getDate();
        dateEl.textContent = `${shortDays[dayIdx]} ${dayNum} ${shortMonths[now.getMonth()]}`;
      }
    }

    updateClock();
    setInterval(updateClock, 1000);
    setInterval(updateNextEventWidget, 30000);
    setInterval(updateLiveTimeIndicator, 30000);
  }

  function updateNextEventWidget() {
    const now = new Date();
    // Rechercher les événements futurs ou en cours
    const upcoming = state.events.map(ev => ({
      ...ev,
      startDate: parseEventDate(ev.start),
      endDate: parseEventDate(ev.end)
    }))
    .filter(ev => ev.startDate && ev.endDate && ev.endDate > now)
    .sort((a, b) => a.startDate - b.startDate);

    const titleEl = document.getElementById('nextEventTitle');
    const countdownEl = document.getElementById('nextEventCountdown');
    if (!titleEl || !countdownEl) return;

    if (upcoming.length === 0) {
      titleEl.textContent = 'Aucun événement à venir';
      countdownEl.textContent = '--';
      return;
    }

    const next = upcoming[0];
    const diffMs = next.startDate.getTime() - now.getTime();

    if (diffMs <= 0) {
      // Événement en cours
      const remainingMin = Math.round((next.endDate.getTime() - now.getTime()) / 60000);
      titleEl.textContent = `En cours : ${next.title}`;
      countdownEl.textContent = `Fin dans ${remainingMin}m`;
    } else {
      const diffMin = Math.round(diffMs / 60000);
      const hours = Math.floor(diffMin / 60);
      const mins = diffMin % 60;
      let countdownStr = '';
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        countdownStr = `Dans ${days}j`;
      } else if (hours > 0) {
        countdownStr = `Dans ${hours}h ${mins}m`;
      } else {
        countdownStr = `Dans ${mins}m`;
      }

      titleEl.textContent = next.title;
      titleEl.title = `${next.title}${next.location ? ' • ' + next.location : ''}`;
      countdownEl.textContent = countdownStr;
    }
  }

  function updateLiveTimeIndicator() {
    const line = document.getElementById('currentTimeLine');
    const tag = document.getElementById('currentTimeTag');
    if (!line || !tag) return;

    const now = new Date();
    const monday = state.currentMonday;
    const isThisWeek = (now >= monday && now < addDays(monday, 7));

    if (!isThisWeek) {
      line.style.display = 'none';
      return;
    }

    const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const gridStartMinutes = GRID_START_HOUR * 60;
    const gridEndMinutes = GRID_END_HOUR * 60;

    if (currentMinutes < gridStartMinutes || currentMinutes > gridEndMinutes) {
      line.style.display = 'none';
      return;
    }

    const topPx = ((currentMinutes - gridStartMinutes) / 60) * HOUR_HEIGHT;

    if (state.viewMode === 'day') {
      if (dayIndex !== state.selectedDayIndex) {
        line.style.display = 'none';
        return;
      }
      line.style.display = 'block';
      line.style.top = `${topPx}px`;
      line.style.left = '0%';
      line.style.width = '100%';
    } else {
      const colWidthPct = 100 / 7;
      const leftPct = dayIndex * colWidthPct;
      line.style.display = 'block';
      line.style.top = `${topPx}px`;
      line.style.left = `${leftPct}%`;
      line.style.width = `${colWidthPct}%`;
    }

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    tag.textContent = `${hh}:${mm}`;
  }

  function updateFooterCount() {
    const label = document.getElementById('eventsCountLabel');
    if (label) {
      label.textContent = `${state.events.length} événements synchronisés`;
    }
  }

  /* ==========================================================================
     MODALES & FORMULAIRES
     ========================================================================== */
  function openAddModal(defaultDate, defaultStartHour) {
    const modal = document.getElementById('eventModal');
    const titleEl = document.getElementById('eventModalTitle');
    const form = document.getElementById('eventForm');
    const deleteBtn = document.getElementById('deleteFormEventBtn');

    form.reset();
    document.getElementById('formEventId').value = '';
    titleEl.textContent = 'Ajouter un événement';
    deleteBtn.style.display = 'none';

    // Pré-remplir la date
    const d = defaultDate || state.currentMonday;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    document.getElementById('formDate').value = `${y}-${m}-${day}`;

    // Pré-remplir les heures
    const startH = defaultStartHour || 14;
    document.getElementById('formStartTime').value = `${String(startH).padStart(2, '0')}:00`;
    document.getElementById('formEndTime').value = `${String(startH + 2).padStart(2, '0')}:00`;

    // Catégorie par défaut
    const catInput = document.querySelector('input[name="formCategory"][value="sport"]');
    if (catInput) catInput.checked = true;

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('formTitle').focus();
  }

  function openEditModal(ev) {
    const modal = document.getElementById('eventModal');
    const titleEl = document.getElementById('eventModalTitle');
    const deleteBtn = document.getElementById('deleteFormEventBtn');

    document.getElementById('formEventId').value = ev.id;
    titleEl.textContent = 'Modifier l\'événement';
    deleteBtn.style.display = 'inline-flex';

    document.getElementById('formTitle').value = ev.title || '';
    document.getElementById('formLocation').value = ev.location || '';
    document.getElementById('formDescription').value = ev.description || '';

    const s = parseEventDate(ev.start);
    const e = parseEventDate(ev.end);
    if (s) {
      const y = s.getFullYear();
      const m = String(s.getMonth() + 1).padStart(2, '0');
      const d = String(s.getDate()).padStart(2, '0');
      document.getElementById('formDate').value = `${y}-${m}-${d}`;
      document.getElementById('formStartTime').value = formatTime(s);
    }
    if (e) {
      document.getElementById('formEndTime').value = formatTime(e);
    }

    const cat = ev.category || 'cours';
    const catRadio = document.querySelector(`input[name="formCategory"][value="${cat}"]`);
    if (catRadio) catRadio.checked = true;

    closeDetailModal();
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeEventModal() {
    const modal = document.getElementById('eventModal');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  function handleEventFormSubmit(e) {
    e.preventDefault();
    const eventId = document.getElementById('formEventId').value;
    const title = document.getElementById('formTitle').value.trim();
    const category = document.querySelector('input[name="formCategory"]:checked')?.value || 'sport';
    const dateStr = document.getElementById('formDate').value;
    const startTimeStr = document.getElementById('formStartTime').value;
    const endTimeStr = document.getElementById('formEndTime').value;
    const location = document.getElementById('formLocation').value.trim();
    const description = document.getElementById('formDescription').value.trim();
    const isRecurring = document.getElementById('formIsRecurring').checked;

    if (!title || !dateStr || !startTimeStr || !endTimeStr) {
      showToast('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    const startIso = `${dateStr}T${startTimeStr}:00`;
    const endIso = `${dateStr}T${endTimeStr}:00`;

    if (new Date(endIso) <= new Date(startIso)) {
      showToast('L\'heure de fin doit être postérieure à l\'heure de début.');
      return;
    }

    if (eventId) {
      // Modification
      const idx = state.events.findIndex(x => x.id === eventId);
      if (idx !== -1) {
        state.events[idx] = {
          ...state.events[idx],
          title,
          category,
          start: startIso,
          end: endIso,
          location,
          description
        };
        showToast('Événement mis à jour avec succès !');
      }
    } else {
      // Création
      if (isRecurring) {
        // Générer pour les semaines du semestre (jusqu'à fin juin 2027)
        let curDate = new Date(`${dateStr}T00:00:00`);
        const endDateLimit = new Date('2027-06-30T23:59:59');
        const baseId = 'rec_' + Date.now();
        let count = 0;

        while (curDate <= endDateLimit) {
          const y = curDate.getFullYear();
          const m = String(curDate.getMonth() + 1).padStart(2, '0');
          const d = String(curDate.getDate()).padStart(2, '0');
          const currentDayStr = `${y}-${m}-${d}`;

          state.events.push({
            id: `${baseId}_${count}`,
            title,
            category,
            start: `${currentDayStr}T${startTimeStr}:00`,
            end: `${currentDayStr}T${endTimeStr}:00`,
            location,
            description,
            isRecurring: true
          });

          curDate.setDate(curDate.getDate() + 7);
          count++;
        }
        showToast(`${count} séances récurrentes créées avec succès !`);
      } else {
        state.events.push({
          id: 'user_' + Date.now(),
          title,
          category,
          start: startIso,
          end: endIso,
          location,
          description
        });
        showToast('Événement créé avec succès !');
      }
    }

    saveEvents();
    closeEventModal();
    render();
  }

  function deleteEvent(eventId) {
    if (!eventId) return;
    if (confirm('Confirmer la suppression de cet événement ?')) {
      state.events = state.events.filter(x => x.id !== eventId);
      saveEvents();
      closeDetailModal();
      closeEventModal();
      render();
      showToast('Événement supprimé.');
    }
  }

  /* ==========================================================================
     MODAL DE DÉTAIL D'ÉVÉNEMENT
     ========================================================================== */
  function openDetailModal(ev) {
    state.selectedEvent = ev;
    const modal = document.getElementById('detailModal');
    const badge = document.getElementById('detailBadge');
    const title = document.getElementById('detailTitle');
    const timeEl = document.getElementById('detailTime');
    const locRow = document.getElementById('detailLocationRow');
    const locVal = document.getElementById('detailLocation');
    const teacherRow = document.getElementById('detailTeacherRow');
    const teacherVal = document.getElementById('detailTeacher');
    const groupRow = document.getElementById('detailGroupRow');
    const groupVal = document.getElementById('detailGroup');
    const descRow = document.getElementById('detailDescRow');
    const descVal = document.getElementById('detailDescription');

    title.textContent = ev.fullTitle || ev.title;

    // Catégorie badge
    const cat = ev.category || 'cours';
    badge.className = `detail-category-badge cat-${cat}`;
    let catText = 'Cours universitaire';
    if (cat === 'alternance') catText = ev.isTT ? 'Alternance (Télétravail - TT)' : 'Alternance (Entreprise)';
    else if (cat === 'travail') catText = 'Travail week-end';
    else if (cat === 'sport') catText = 'Volley-ball / Sport';
    else if (cat === 'medical') catText = 'Médical';
    else if (cat === 'perso') catText = 'Personnel';
    else if (cat === 'pause') catText = 'Pause / Déjeuner';
    badge.textContent = catText;

    // Date & Horaires
    const s = parseEventDate(ev.start);
    const e = parseEventDate(ev.end);
    if (s && e) {
      const dayName = DAY_NAMES[s.getDay() === 0 ? 6 : s.getDay() - 1];
      const dateStr = `${dayName} ${s.getDate()} ${MONTH_NAMES[s.getMonth()]}`;
      timeEl.textContent = `${dateStr} • ${formatTime(s)} - ${formatTime(e)}`;
    }

    // Lieu
    if (ev.location) {
      locRow.style.display = 'flex';
      locVal.textContent = ev.location;
    } else {
      locRow.style.display = 'none';
    }

    // Enseignant
    if (ev.teacher) {
      teacherRow.style.display = 'flex';
      teacherVal.textContent = ev.teacher;
    } else {
      teacherRow.style.display = 'none';
    }

    // Groupe
    if (ev.group) {
      groupRow.style.display = 'flex';
      groupVal.textContent = ev.group;
    } else {
      groupRow.style.display = 'none';
    }

    // Description / Notes
    if (ev.description) {
      descRow.style.display = 'flex';
      descVal.textContent = ev.description;
    } else {
      descRow.style.display = 'none';
    }

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeDetailModal() {
    const modal = document.getElementById('detailModal');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    state.selectedEvent = null;
  }

  /* ==========================================================================
     IMPORT ICALENDAR (.ICS)
     ========================================================================== */
  function openImportModal() {
    const modal = document.getElementById('importModal');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeImportModal() {
    const modal = document.getElementById('importModal');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  function handleFileImport(file) {
    if (!file) return;
    if (!file.name.endsWith('.ics') && !file.name.endsWith('.ical')) {
      showToast('Veuillez sélectionner un fichier .ics valide.');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const content = e.target.result;
      try {
        if (typeof ICSParser === 'undefined') {
          showToast('Erreur: Module ICSParser non trouvé.');
          return;
        }
        const newCourses = ICSParser.parse(content);
        if (newCourses.length === 0) {
          showToast('Aucun cours trouvé dans ce fichier .ics.');
          return;
        }

        // Remplacer uniquement les cours d'école pour garder le travail et le volley intacts !
        const nonSchoolEvents = state.events.filter(ev => !ev.isSchool && ev.category !== 'cours');
        state.events = [...newCourses, ...nonSchoolEvents];
        saveEvents();
        closeImportModal();
        render();
        showToast(`Succès ! ${newCourses.length} cours universitaires synchronisés.`);
      } catch (err) {
        console.error('Erreur de parsing .ics:', err);
        showToast('Erreur lors de l\'analyse du fichier .ics.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  /* ==========================================================================
     EXPORT EN IMAGE PNG / IMPRESSION
     ========================================================================== */
  function exportSchedule() {
    const printArea = document.getElementById('scheduleContainer') || document.getElementById('scheduleViewport');
    if (!printArea) {
      window.print();
      return;
    }

    if (typeof html2canvas !== 'undefined') {
      showToast('Génération de l\'image en cours...');
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const bgColor = isLight ? '#f8fafc' : '#0c0f13';

      html2canvas(printArea, {
        backgroundColor: bgColor,
        scale: 2, // Haute résolution
        logging: false,
        useCORS: true,
        scrollX: 0,
        scrollY: 0
      }).then(canvas => {
        const link = document.createElement('a');
        const weekNum = getISOWeekNumber(state.currentMonday);
        link.download = `Mon_Emploi_du_Temps_Semaine_${weekNum}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('Image du planning téléchargée avec succès !');
      }).catch(err => {
        console.warn('html2canvas erreur, repli sur impression standard:', err);
        window.print();
      });
    } else {
      window.print();
    }
  }

  /* ==========================================================================
     BILAN DES COURS ET PROGRESSION DES MATIÈRES (MODULES MMI 3)
     ========================================================================== */
  let currentBilanTab = 'cours';
  let currentSubjectFilter = 'all';
  let currentSubjectSearchQuery = '';
  let currentAltFilter = 'all';
  let currentAltSearchQuery = '';

  function openSubjectsModal(defaultTab) {
    const modal = document.getElementById('subjectsModal');
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    switchBilanTab(defaultTab || currentBilanTab);
  }

  function closeSubjectsModal() {
    const modal = document.getElementById('subjectsModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  function switchBilanTab(tabKey) {
    currentBilanTab = tabKey;
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabKey);
    });

    const paneCours = document.getElementById('paneBilanCours');
    const paneAlt = document.getElementById('paneBilanAlternance');
    const paneGlobal = document.getElementById('paneBilanGlobal');

    if (paneCours) paneCours.style.display = (tabKey === 'cours') ? 'flex' : 'none';
    if (paneAlt) paneAlt.style.display = (tabKey === 'alternance') ? 'flex' : 'none';
    if (paneGlobal) paneGlobal.style.display = (tabKey === 'global') ? 'flex' : 'none';

    if (tabKey === 'cours') renderSubjectsModal();
    else if (tabKey === 'alternance') renderAlternanceBilan();
    else if (tabKey === 'global') renderGlobalBilan();
  }

  function getSubjectInfo(title) {
    if (!title) return { code: 'AUTRE', name: 'Autre cours', key: 'Autre cours' };
    let t = title.trim().replace(/_MMIm3$/i, '').trim();

    const codeMatch = t.match(/^(R\d{3}|SAE\d{3}|SAÉ\d{3})/i);
    if (codeMatch) {
      const code = codeMatch[1].toUpperCase();
      let rest = t.slice(codeMatch[0].length).trim();
      rest = rest.replace(/^[\s\-–—:]+/, '');
      rest = rest.replace(/^(TP[0-9A-Z]*|TD[0-9A-Z]*|CM[0-9A-Z]*|TDB[0-9A-Z]*|TPC[0-9A-Z]*|FIFA|FA|Soutenances)[\s\-–—:]*/gi, '');
      rest = rest.replace(/[\s\-–—:]+(TP[0-9A-Z]*|TD[0-9A-Z]*|CM[0-9A-Z]*|TDB[0-9A-Z]*|TPC[0-9A-Z]*|FIFA|FA)[\s\-–—:]*/gi, ' ');
      rest = rest.replace(/[\s\-–—:]+$/, '').trim();
      rest = rest.charAt(0).toUpperCase() + rest.slice(1);
      if (code === 'R506') rest = 'Développement Back avancé';
      if (code === 'R505') rest = 'Développement Front avancé';
      if (code === 'R602') rest = 'Développement Web et Dispositif interactif';
      if (code === 'R502') rest = 'Management et Assurance qualité';
      if (code === 'R503') rest = 'Entrepreneuriat';
      if (code === 'R507') rest = 'Dispositifs interactifs';
      if (code === 'R508') rest = 'Hébergement et Cybersécurité';
      if (code === 'R501') rest = 'Anglais';
      if (code === 'R504') rest = 'Projet Personnel et Professionnel';
      if (code === 'SAE501') rest = 'Dev web ou dispositif interactif';
      return { code, name: rest || 'Cours', key: `${code} - ${rest || 'Cours'}` };
    }

    if (/^PORTFOLIO S5/i.test(t) || (/^PORTFOLIO/i.test(t) && !t.includes('S6'))) return { code: 'PORTFOLIO', name: 'Portfolio S5', key: 'Portfolio S5' };
    if (/^Démarche Portfolio/i.test(t) || t.includes('Portfolio S6')) return { code: 'PORTFOLIO', name: 'Portfolio S6', key: 'Portfolio S6' };
    if (/^Adaptation de Parcours/i.test(t)) return { code: 'ADAPT', name: 'Adaptation de Parcours S5', key: 'Adaptation de Parcours S5' };
    if (/^Plage projet/i.test(t)) return { code: 'PROJET', name: 'Plage Projet', key: 'Plage Projet' };
    if (/^Jour de révision/i.test(t)) return { code: 'RÉVISION', name: 'Jours de révision', key: 'Jours de révision' };
    if (/^Soutenance/i.test(t)) return { code: 'SOUTENANCE', name: 'Soutenances', key: 'Soutenances' };
    if (/^JPO/i.test(t)) return { code: 'JPO', name: 'Journée Portes Ouvertes (JPO)', key: 'Journée Portes Ouvertes (JPO)' };
    if (/^Comité de pilotage/i.test(t)) return { code: 'COPIL', name: 'Comité de pilotage', key: 'Comité de pilotage' };
    if (/^Nuit de l'info/i.test(t)) return { code: 'EVENT', name: "Nuit de l'info 2026", key: "Nuit de l'info 2026" };

    return { code: 'AUTRE', name: t, key: t };
  }

  function calculateSubjectsData() {
    if (!eventsDataDirty && cachedSubjectsData) {
      return cachedSubjectsData;
    }
    const now = new Date();
    // Extraire uniquement les cours d'école
    const courseEvents = state.events.filter(ev => ev.category === 'cours' || ev.isSchool);

    const map = new Map();

    courseEvents.forEach(ev => {
      const info = getSubjectInfo(ev.title);
      const s = parseEventDate(ev.start);
      const e = parseEventDate(ev.end);
      if (!s || !e) return;

      const durMin = Math.max(0, (e.getTime() - s.getTime()) / 60000);
      const isDone = (e <= now);
      const isUpcoming = (s > now);
      const isInProgress = (s <= now && e > now);

      if (!map.has(info.key)) {
        map.set(info.key, {
          code: info.code,
          name: info.name,
          key: info.key,
          totalMinutes: 0,
          doneMinutes: 0,
          remainingMinutes: 0,
          totalCount: 0,
          doneCount: 0,
          remainingCount: 0,
          sessions: [],
          nextSession: null
        });
      }

      const sub = map.get(info.key);
      sub.totalMinutes += durMin;
      sub.totalCount += 1;

      if (isDone) {
        sub.doneMinutes += durMin;
        sub.doneCount += 1;
      } else if (isInProgress) {
        const donePart = Math.max(0, (now.getTime() - s.getTime()) / 60000);
        sub.doneMinutes += donePart;
        sub.remainingMinutes += (durMin - donePart);
        sub.remainingCount += 1;
      } else {
        sub.remainingMinutes += durMin;
        sub.remainingCount += 1;
      }

      sub.sessions.push({
        id: ev.id,
        title: ev.title,
        fullTitle: ev.fullTitle || ev.title,
        start: s,
        end: e,
        location: ev.location,
        teacher: ev.teacher,
        group: ev.group,
        isDone: isDone,
        isUpcoming: isUpcoming,
        isInProgress: isInProgress
      });
    });

    const subjects = [...map.values()].map(sub => {
      // Trier les séances par date chronologique
      sub.sessions.sort((a, b) => a.start - b.start);
      sub.nextSession = sub.sessions.find(s => s.start > now || s.isInProgress) || null;

      const totalHours = Math.round((sub.totalMinutes / 60) * 10) / 10;
      const doneHours = Math.round((sub.doneMinutes / 60) * 10) / 10;
      const remainingHours = Math.round((sub.remainingMinutes / 60) * 10) / 10;
      const pct = totalHours > 0 ? Math.min(100, Math.round((doneHours / totalHours) * 100)) : 0;

      let status = 'upcoming';
      if (pct >= 100 || sub.remainingCount === 0) {
        status = 'completed';
      } else if (doneHours > 0 || sub.sessions.some(s => s.isInProgress)) {
        status = 'in_progress';
      }

      return {
        ...sub,
        totalHours,
        doneHours,
        remainingHours,
        pct,
        status
      };
    });

    // Trier par volume horaire total décroissant
    subjects.sort((a, b) => b.totalHours - a.totalHours);

    // Métriques globales
    let globalTotalMin = 0;
    let globalDoneMin = 0;
    let globalRemainingMin = 0;
    let globalTotalSessions = 0;
    let globalDoneSessions = 0;
    let globalRemainingSessions = 0;

    subjects.forEach(s => {
      globalTotalMin += s.totalMinutes;
      globalDoneMin += s.doneMinutes;
      globalRemainingMin += s.remainingMinutes;
      globalTotalSessions += s.totalCount;
      globalDoneSessions += s.doneCount;
      globalRemainingSessions += s.remainingCount;
    });

    const globalTotalHours = Math.round((globalTotalMin / 60) * 10) / 10;
    const globalDoneHours = Math.round((globalDoneMin / 60) * 10) / 10;
    const globalRemainingHours = Math.round((globalRemainingMin / 60) * 10) / 10;
    const globalPct = globalTotalHours > 0 ? Math.min(100, Math.round((globalDoneHours / globalTotalHours) * 100)) : 0;

    const resData = {
      subjects,
      global: {
        totalHours: globalTotalHours,
        doneHours: globalDoneHours,
        remainingHours: globalRemainingHours,
        pct: globalPct,
        totalSessions: globalTotalSessions,
        doneSessions: globalDoneSessions,
        remainingSessions: globalRemainingSessions,
        modulesCount: subjects.length
      }
    };
    cachedSubjectsData = resData;
    eventsDataDirty = false;
    return resData;
  }

  function renderSubjectsModal() {
    const data = calculateSubjectsData();
    const g = data.global;

    // Mise à jour des KPI globaux
    const doneEl = document.getElementById('kpiDoneHours');
    const donePctEl = document.getElementById('kpiDonePct');
    const doneSubEl = document.getElementById('kpiDoneSessions');
    if (doneEl) doneEl.textContent = `${g.doneHours} h`;
    if (donePctEl) donePctEl.textContent = `${g.pct}%`;
    if (doneSubEl) doneSubEl.textContent = `${g.doneSessions} séances passées`;

    const remEl = document.getElementById('kpiRemainingHours');
    const remPctEl = document.getElementById('kpiRemainingPct');
    const remSubEl = document.getElementById('kpiRemainingSessions');
    if (remEl) remEl.textContent = `${g.remainingHours} h`;
    if (remPctEl) remPctEl.textContent = `${100 - g.pct}%`;
    if (remSubEl) remSubEl.textContent = `${g.remainingSessions} séances à venir`;

    const totEl = document.getElementById('kpiTotalHours');
    const modCountEl = document.getElementById('kpiModulesCount');
    const totSubEl = document.getElementById('kpiTotalSessions');
    if (totEl) totEl.textContent = `${g.totalHours} h`;
    if (modCountEl) modCountEl.textContent = `${g.modulesCount} matières`;
    if (totSubEl) totSubEl.textContent = `${g.totalSessions} séances au semestre`;

    // Barre de progression globale
    const globPctEl = document.getElementById('globalProgressPct');
    const globFillEl = document.getElementById('globalProgressFill');
    if (globPctEl) globPctEl.textContent = `${g.pct}%`;
    if (globFillEl) globFillEl.style.width = `${g.pct}%`;

    // Compteurs des chips de filtre
    const inProgressCount = data.subjects.filter(s => s.status === 'in_progress').length;
    const completedCount = data.subjects.filter(s => s.status === 'completed').length;
    const upcomingCount = data.subjects.filter(s => s.status === 'upcoming').length;

    const cntAll = document.getElementById('subjCountAll');
    const cntInProg = document.getElementById('subjCountInProgress');
    const cntComp = document.getElementById('subjCountCompleted');
    const cntUp = document.getElementById('subjCountUpcoming');

    if (cntAll) cntAll.textContent = data.subjects.length;
    if (cntInProg) cntInProg.textContent = inProgressCount;
    if (cntComp) cntComp.textContent = completedCount;
    if (cntUp) cntUp.textContent = upcomingCount;

    // Filtrage de la liste
    const container = document.getElementById('subjectsListContainer');
    if (!container) return;
    container.innerHTML = '';

    const query = currentSubjectSearchQuery.toLowerCase().trim();

    const filtered = data.subjects.filter(sub => {
      // Filtre de statut
      if (currentSubjectFilter === 'in_progress' && sub.status !== 'in_progress') return false;
      if (currentSubjectFilter === 'completed' && sub.status !== 'completed') return false;
      if (currentSubjectFilter === 'upcoming' && sub.status !== 'upcoming') return false;

      // Filtre de recherche
      if (query) {
        const matchCode = sub.code.toLowerCase().includes(query);
        const matchName = sub.name.toLowerCase().includes(query);
        const matchTeacher = sub.sessions.some(s => s.teacher && s.teacher.toLowerCase().includes(query));
        const matchRoom = sub.sessions.some(s => s.location && s.location.toLowerCase().includes(query));
        if (!matchCode && !matchName && !matchTeacher && !matchRoom) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-subjects-message">
          <p>Aucune matière ne correspond à votre recherche ou filtre.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(sub => {
      const card = createSubjectCard(sub);
      container.appendChild(card);
    });
  }

  function createSubjectCard(sub) {
    const card = document.createElement('div');
    card.className = `subject-card status-${sub.status}`;

    let statusText = 'À venir';
    if (sub.status === 'completed') statusText = 'Terminée';
    else if (sub.status === 'in_progress') statusText = 'En cours';

    let nextSessionText = 'Toutes les séances ont été effectuées';
    if (sub.nextSession) {
      const d = sub.nextSession.start;
      const dayName = DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1];
      const dateStr = `${dayName} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
      const timeStr = `${formatTime(sub.nextSession.start)} - ${formatTime(sub.nextSession.end)}`;
      const locStr = sub.nextSession.location ? ` (${escapeHtml(sub.nextSession.location)})` : '';
      nextSessionText = `Prochaine séance : <strong>${dateStr} à ${timeStr}</strong>${locStr}`;
    }

    card.innerHTML = `
      <div class="subject-card-header">
        <div class="subject-title-group">
          <span class="subject-code-tag">${escapeHtml(sub.code)}</span>
          <h4 class="subject-name">${escapeHtml(sub.name)}</h4>
        </div>
        <span class="subject-status-pill ${sub.status}">${statusText}</span>
      </div>

      <div class="subject-progress-row">
        <div class="subject-progress-bar">
          <div class="subject-progress-fill ${sub.status === 'completed' ? 'completed' : ''}" style="width: ${sub.pct}%;"></div>
        </div>
        <span class="subject-pct-label">${sub.pct}%</span>
      </div>

      <div class="subject-metrics-grid">
        <div class="subj-metric">
          <span class="sm-label">Effectué</span>
          <span class="sm-val highlight">${sub.doneHours} h <small>(${sub.doneCount} séa.)</small></span>
        </div>
        <div class="subj-metric">
          <span class="sm-label">Restant</span>
          <span class="sm-val">${sub.remainingHours} h <small>(${sub.remainingCount} séa.)</small></span>
        </div>
        <div class="subj-metric">
          <span class="sm-label">Total matière</span>
          <span class="sm-val total">${sub.totalHours} h <small>(${sub.totalCount} séa.)</small></span>
        </div>
      </div>

      <div class="subject-next-info">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>${nextSessionText}</span>
      </div>

      <button type="button" class="btn-toggle-sessions">
        <span>Voir les ${sub.sessions.length} séances</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <div class="subject-sessions-list" style="display: none;">
        ${sub.sessions.map(s => {
          const d = s.start;
          const dayName = DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1].slice(0, 3);
          const dateStr = `${dayName}. ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 4)}.`;
          const timeStr = `${formatTime(s.start)} - ${formatTime(s.end)}`;
          const statusBadge = s.isDone
            ? '<span class="session-badge done">Effectué</span>'
            : (s.isInProgress ? '<span class="session-badge upcoming">En cours</span>' : '<span class="session-badge upcoming">À venir</span>');
          const metaTeacher = s.teacher ? ` • ${escapeHtml(s.teacher)}` : '';
          const metaRoom = s.location ? `<span class="session-room">${escapeHtml(s.location)}</span>` : '';

          return `
            <div class="session-item ${s.isDone ? 'done' : 'upcoming'}">
              <div class="session-left">
                ${statusBadge}
                <span class="session-date">${dateStr}</span>
                <span class="session-time">${timeStr}</span>
              </div>
              <div class="session-right">
                ${metaRoom}
                ${metaTeacher}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Gestion de l'accordéon des séances
    const toggleBtn = card.querySelector('.btn-toggle-sessions');
    const sessionsList = card.querySelector('.subject-sessions-list');
    if (toggleBtn && sessionsList) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = sessionsList.style.display === 'none';
        sessionsList.style.display = isHidden ? 'flex' : 'none';
        toggleBtn.classList.toggle('expanded', isHidden);
        const span = toggleBtn.querySelector('span');
        if (span) {
          span.textContent = isHidden ? 'Masquer les séances' : `Voir les ${sub.sessions.length} séances`;
        }
      });
    }

    return card;
  }

  /* ==========================================================================
     BILAN DE L'ALTERNANCE & DU TÉLÉTRAVAIL (ENTREPRISE & TT)
     ========================================================================== */
  function calculateAlternanceData() {
    if (!eventsDataDirty && cachedAlternanceData) {
      return cachedAlternanceData;
    }
    const now = new Date();
    const altEvents = state.events.filter(ev => ev.category === 'alternance');

    // Grouper les shifts par semaine (du Lundi au Vendredi)
    const weeksMap = new Map();

    altEvents.forEach(ev => {
      const s = parseEventDate(ev.start);
      const e = parseEventDate(ev.end);
      if (!s || !e) return;

      const mon = getMonday(s);
      const monStr = formatYMD(mon);
      const durMin = Math.max(0, (e.getTime() - s.getTime()) / 60000);
      const isDone = (e <= now);
      const isInProgress = (s <= now && e > now);

      if (!weeksMap.has(monStr)) {
        const fri = addDays(mon, 4);
        const weekNum = getISOWeekNumber(mon);
        const monD = mon.getDate();
        const monM = MONTH_NAMES[mon.getMonth()];
        const friD = fri.getDate();
        const friM = MONTH_NAMES[fri.getMonth()];
        const year = fri.getFullYear();

        const rangeStr = (monM === friM)
          ? `Du ${monD} au ${friD} ${friM} ${year}`
          : `Du ${monD} ${monM} au ${friD} ${friM} ${year}`;

        weeksMap.set(monStr, {
          monday: mon,
          monStr,
          weekNum,
          rangeStr,
          totalMinutes: 0,
          doneMinutes: 0,
          remainingMinutes: 0,
          onSiteMinutes: 0,
          ttMinutes: 0,
          shifts: []
        });
      }

      const w = weeksMap.get(monStr);
      w.totalMinutes += durMin;

      if (ev.isTT) {
        w.ttMinutes += durMin;
      } else {
        w.onSiteMinutes += durMin;
      }

      if (isDone) {
        w.doneMinutes += durMin;
      } else if (isInProgress) {
        const donePart = Math.max(0, (now.getTime() - s.getTime()) / 60000);
        w.doneMinutes += donePart;
        w.remainingMinutes += (durMin - donePart);
      } else {
        w.remainingMinutes += durMin;
      }

      w.shifts.push({
        id: ev.id,
        title: ev.title,
        start: s,
        end: e,
        isTT: Boolean(ev.isTT),
        isDone: isDone,
        isInProgress: isInProgress,
        location: ev.location
      });
    });

    const weeks = [...weeksMap.values()].map(w => {
      w.shifts.sort((a, b) => a.start - b.start);
      const totalHours = Math.round((w.totalMinutes / 60) * 10) / 10;
      const doneHours = Math.round((w.doneMinutes / 60) * 10) / 10;
      const remainingHours = Math.round((w.remainingMinutes / 60) * 10) / 10;
      const pct = totalHours > 0 ? Math.min(100, Math.round((doneHours / totalHours) * 100)) : 0;

      let status = 'upcoming';
      if (pct >= 100) status = 'completed';
      else if (doneHours > 0) status = 'in_progress';

      const onSiteHours = Math.round((w.onSiteMinutes / 60) * 10) / 10;
      const ttHours = Math.round((w.ttMinutes / 60) * 10) / 10;

      return {
        ...w,
        totalHours,
        doneHours,
        remainingHours,
        onSiteHours,
        ttHours,
        pct,
        status
      };
    });

    weeks.sort((a, b) => a.monday - b.monday);

    let totalAltMin = 0;
    let doneAltMin = 0;
    let remainingAltMin = 0;
    let totalOnSiteMin = 0;
    let doneOnSiteMin = 0;
    let totalTtMin = 0;
    let doneTtMin = 0;

    weeks.forEach(w => {
      totalAltMin += w.totalMinutes;
      doneAltMin += w.doneMinutes;
      remainingAltMin += w.remainingMinutes;
      totalOnSiteMin += w.onSiteMinutes;
      totalTtMin += w.ttMinutes;

      w.shifts.forEach(s => {
        const dur = (s.end - s.start) / 60000;
        if (s.isDone) {
          if (s.isTT) doneTtMin += dur;
          else doneOnSiteMin += dur;
        }
      });
    });

    const totalHours = Math.round((totalAltMin / 60) * 10) / 10;
    const doneHours = Math.round((doneAltMin / 60) * 10) / 10;
    const remainingHours = Math.round((remainingAltMin / 60) * 10) / 10;
    const pct = totalHours > 0 ? Math.min(100, Math.round((doneHours / totalHours) * 100)) : 0;

    const onSiteTotalHours = Math.round((totalOnSiteMin / 60) * 10) / 10;
    const onSiteDoneHours = Math.round((doneOnSiteMin / 60) * 10) / 10;
    const onSiteRemainingHours = Math.max(0, onSiteTotalHours - onSiteDoneHours);
    const onSitePct = onSiteTotalHours > 0 ? Math.round((onSiteDoneHours / onSiteTotalHours) * 100) : 0;

    const ttTotalHours = Math.round((totalTtMin / 60) * 10) / 10;
    const ttDoneHours = Math.round((doneTtMin / 60) * 10) / 10;
    const ttRemainingHours = Math.max(0, ttTotalHours - ttDoneHours);
    const ttPct = ttTotalHours > 0 ? Math.round((ttDoneHours / ttTotalHours) * 100) : 0;

    const completedWeeksCount = weeks.filter(w => w.status === 'completed').length;
    const inProgressWeeksCount = weeks.filter(w => w.status === 'in_progress').length;
    const upcomingWeeksCount = weeks.filter(w => w.status === 'upcoming').length;

    const resData = {
      weeks,
      global: {
        totalHours,
        doneHours,
        remainingHours,
        pct,
        totalWeeks: weeks.length,
        completedWeeks: completedWeeksCount,
        inProgressWeeks: inProgressWeeksCount,
        upcomingWeeks: upcomingWeeksCount,
        onSite: {
          total: onSiteTotalHours,
          done: onSiteDoneHours,
          remaining: onSiteRemainingHours,
          pct: onSitePct
        },
        tt: {
          total: ttTotalHours,
          done: ttDoneHours,
          remaining: ttRemainingHours,
          pct: ttPct
        }
      }
    };
    cachedAlternanceData = resData;
    return resData;
  }

  function renderAlternanceBilan() {
    const data = calculateAlternanceData();
    const g = data.global;

    // KPI Summary
    const doneEl = document.getElementById('kpiAltDoneHours');
    const donePctEl = document.getElementById('kpiAltDonePct');
    const doneWeeksEl = document.getElementById('kpiAltDoneWeeks');
    if (doneEl) doneEl.textContent = `${g.doneHours} h`;
    if (donePctEl) donePctEl.textContent = `${g.pct}%`;
    if (doneWeeksEl) doneWeeksEl.textContent = `${g.completedWeeks} semaines faites`;

    const remEl = document.getElementById('kpiAltRemainingHours');
    const remPctEl = document.getElementById('kpiAltRemainingPct');
    const remWeeksEl = document.getElementById('kpiAltRemainingWeeks');
    if (remEl) remEl.textContent = `${g.remainingHours} h`;
    if (remPctEl) remPctEl.textContent = `${100 - g.pct}%`;
    if (remWeeksEl) remWeeksEl.textContent = `${g.remainingWeeks} semaines à venir`;

    const totEl = document.getElementById('kpiAltTotalHours');
    const totWeeksEl = document.getElementById('kpiAltTotalWeeks');
    if (totEl) totEl.textContent = `${g.totalHours} h`;
    if (totWeeksEl) totWeeksEl.textContent = `${g.totalWeeks} semaines`;

    // Pôles
    const onSiteHoursEl = document.getElementById('kpiAltOnSiteHours');
    const onSiteFill = document.getElementById('poleOnSiteFill');
    const onSiteSub = document.getElementById('poleOnSiteSub');
    const onSitePct = document.getElementById('poleOnSitePct');
    if (onSiteHoursEl) onSiteHoursEl.textContent = `${g.onSite.total} h`;
    if (onSiteFill) onSiteFill.style.width = `${g.onSite.pct}%`;
    if (onSiteSub) onSiteSub.textContent = `${g.onSite.done}h faites • ${g.onSite.remaining}h restantes`;
    if (onSitePct) onSitePct.textContent = `${g.onSite.pct}%`;

    const ttHoursEl = document.getElementById('kpiAltTtHours');
    const ttFill = document.getElementById('poleTtFill');
    const ttSub = document.getElementById('poleTtSub');
    const ttPct = document.getElementById('poleTtPct');
    if (ttHoursEl) ttHoursEl.textContent = `${g.tt.total} h`;
    if (ttFill) ttFill.style.width = `${g.tt.pct}%`;
    if (ttSub) ttSub.textContent = `${g.tt.done}h faites • ${g.tt.remaining}h restantes`;
    if (ttPct) ttPct.textContent = `${g.tt.pct}%`;

    // Barre d'avancement globale
    const globPct = document.getElementById('globalAltProgressPct');
    const globFill = document.getElementById('globalAltProgressFill');
    if (globPct) globPct.textContent = `${g.pct}%`;
    if (globFill) globFill.style.width = `${g.pct}%`;

    // Filtres
    const cntAll = document.getElementById('altCountAll');
    const cntInProg = document.getElementById('altCountInProgress');
    const cntComp = document.getElementById('altCountCompleted');
    const cntUp = document.getElementById('altCountUpcoming');
    if (cntAll) cntAll.textContent = g.totalWeeks;
    if (cntInProg) cntInProg.textContent = g.inProgressWeeks;
    if (cntComp) cntComp.textContent = g.completedWeeks;
    if (cntUp) cntUp.textContent = g.upcomingWeeks;

    const container = document.getElementById('alternanceListContainer');
    if (!container) return;
    container.innerHTML = '';

    const query = currentAltSearchQuery.toLowerCase().trim();

    const filtered = data.weeks.filter(w => {
      if (currentAltFilter === 'in_progress' && w.status !== 'in_progress') return false;
      if (currentAltFilter === 'completed' && w.status !== 'completed') return false;
      if (currentAltFilter === 'upcoming' && w.status !== 'upcoming') return false;

      if (query) {
        const matchNum = `s${w.weekNum}`.includes(query) || `semaine ${w.weekNum}`.includes(query);
        const matchRange = w.rangeStr.toLowerCase().includes(query);
        if (!matchNum && !matchRange) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-subjects-message">
          <p>Aucune semaine d'alternance ne correspond à votre filtre.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(w => {
      const card = createAlternanceWeekCard(w);
      container.appendChild(card);
    });
  }

  function createAlternanceWeekCard(w) {
    const card = document.createElement('div');
    card.className = `subject-card status-${w.status}`;

    let statusText = 'À venir';
    if (w.status === 'completed') statusText = 'Effectuée';
    else if (w.status === 'in_progress') statusText = 'En cours';

    card.innerHTML = `
      <div class="subject-card-header">
        <div class="subject-title-group">
          <span class="subject-code-tag" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border-color: rgba(59, 130, 246, 0.3);">Sem. ${w.weekNum}</span>
          <h4 class="subject-name">${w.rangeStr}</h4>
        </div>
        <span class="subject-status-pill ${w.status}">${statusText}</span>
      </div>

      <div class="subject-progress-row">
        <div class="subject-progress-bar">
          <div class="subject-progress-fill ${w.status === 'completed' ? 'completed' : ''}" style="width: ${w.pct}%; background: linear-gradient(90deg, #1d4ed8, #3b82f6);"></div>
        </div>
        <span class="subject-pct-label">${w.pct}%</span>
      </div>

      <div class="subject-metrics-grid">
        <div class="subj-metric">
          <span class="sm-label">Effectué</span>
          <span class="sm-val highlight">${w.doneHours} h</span>
        </div>
        <div class="subj-metric">
          <span class="sm-label">Restant</span>
          <span class="sm-val">${w.remainingHours} h</span>
        </div>
        <div class="subj-metric">
          <span class="sm-label">Volume total</span>
          <span class="sm-val total">${w.totalHours} h <small>(${w.onSiteHours}h site • ${w.ttHours}h TT)</small></span>
        </div>
      </div>

      <button type="button" class="btn-toggle-sessions">
        <span>Voir les créneaux (${w.shifts.length})</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <div class="subject-sessions-list" style="display: none;">
        ${w.shifts.map(s => {
          const d = s.start;
          const dayName = DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1];
          const dateStr = `${dayName} ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 4)}.`;
          const timeStr = `${formatTime(s.start)} - ${formatTime(s.end)}`;
          const statusBadge = s.isDone
            ? '<span class="session-badge done">Effectué</span>'
            : (s.isInProgress ? '<span class="session-badge upcoming">En cours</span>' : '<span class="session-badge upcoming">À venir</span>');
          const typeBadge = s.isTT
            ? '<span class="session-room" style="color: #2dd4bf;">Télétravail</span>'
            : '<span class="session-room" style="color: #60a5fa;">Entreprise</span>';

          return `
            <div class="session-item ${s.isDone ? 'done' : 'upcoming'}">
              <div class="session-left">
                ${statusBadge}
                <span class="session-date">${dateStr}</span>
                <span class="session-time">${timeStr}</span>
              </div>
              <div class="session-right">
                ${typeBadge}
                <span style="font-size: 11px;">${escapeHtml(s.location || '')}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    const toggleBtn = card.querySelector('.btn-toggle-sessions');
    const sessionsList = card.querySelector('.subject-sessions-list');
    if (toggleBtn && sessionsList) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = sessionsList.style.display === 'none';
        sessionsList.style.display = isHidden ? 'flex' : 'none';
        toggleBtn.classList.toggle('expanded', isHidden);
        const span = toggleBtn.querySelector('span');
        if (span) {
          span.textContent = isHidden ? 'Masquer les créneaux' : `Voir les créneaux (${w.shifts.length})`;
        }
      });
    }

    return card;
  }

  function renderGlobalBilan() {
    const courseData = calculateSubjectsData().global;
    const altData = calculateAlternanceData().global;

    const grandTotal = Math.round((courseData.totalHours + altData.totalHours) * 10) / 10;
    const grandDone = Math.round((courseData.doneHours + altData.doneHours) * 10) / 10;
    const grandRemaining = Math.max(0, Math.round((grandTotal - grandDone) * 10) / 10);
    const grandPct = grandTotal > 0 ? Math.round((grandDone / grandTotal) * 100) : 0;

    const coursRatio = grandTotal > 0 ? Math.round((courseData.totalHours / grandTotal) * 100) : 0;
    const altRatio = Math.max(0, 100 - coursRatio);

    const gTotalEl = document.getElementById('grandTotalHours');
    if (gTotalEl) gTotalEl.textContent = `${grandTotal} h`;

    const cValEl = document.getElementById('synthCoursVal');
    const cMeterEl = document.getElementById('synthCoursMeter');
    if (cValEl) cValEl.textContent = `${courseData.totalHours} h (${coursRatio}%)`;
    if (cMeterEl) cMeterEl.style.width = `${coursRatio}%`;

    const aValEl = document.getElementById('synthAltVal');
    const aMeterEl = document.getElementById('synthAltMeter');
    if (aValEl) aValEl.textContent = `${altData.totalHours} h (${altRatio}%)`;
    if (aMeterEl) aMeterEl.style.width = `${altRatio}%`;

    const gDoneEl = document.getElementById('synthGrandDoneHours');
    const gDonePctEl = document.getElementById('synthGrandDonePct');
    if (gDoneEl) gDoneEl.textContent = `${grandDone} h`;
    if (gDonePctEl) gDonePctEl.textContent = `${grandPct}% de l'année réalisé`;

    const gRemEl = document.getElementById('synthGrandRemainingHours');
    const gRemPctEl = document.getElementById('synthGrandRemainingPct');
    if (gRemEl) gRemEl.textContent = `${grandRemaining} h`;
    if (gRemPctEl) gRemPctEl.textContent = `${100 - grandPct}% restant`;
  }

  /* ==========================================================================
     NOTIFICATIONS TOAST
     ========================================================================== */
  function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="toast-dot"></span>
      <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  /* ==========================================================================
     BINDING DES ÉVÉNEMENTS
     ========================================================================== */
  function bindEvents() {
    // Navigation des semaines et jours
    document.getElementById('prevWeekBtn')?.addEventListener('click', () => {
      if (state.viewMode === 'day') {
        goToPrevDay();
      } else {
        state.currentMonday = addDays(state.currentMonday, -7);
        render();
      }
    });

    document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
      if (state.viewMode === 'day') {
        goToNextDay();
      } else {
        state.currentMonday = addDays(state.currentMonday, 7);
        render();
      }
    });

    document.getElementById('todayBtn')?.addEventListener('click', goToToday);

    // Clic direct sur un créneau horaire vide pour créer rapidement un événement
    const columnsWrapper = document.getElementById('dayColumnsWrapper');
    if (columnsWrapper) {
      columnsWrapper.addEventListener('click', (e) => {
        if (e.target.closest('.event-card') || e.target.closest('.holiday-day-watermark') || e.target.closest('.current-time-indicator')) {
          return;
        }
        const col = e.target.closest('.day-column');
        if (!col) return;
        const dayIdx = parseInt(col.getAttribute('data-day-index'), 10);
        if (isNaN(dayIdx)) return;

        const rect = col.getBoundingClientRect();
        const offsetY = Math.max(0, e.clientY - rect.top);
        const clickedHour = Math.min(GRID_END_HOUR - 1, Math.max(GRID_START_HOUR, Math.floor(GRID_START_HOUR + (offsetY / HOUR_HEIGHT))));
        const targetDate = addDays(state.currentMonday, dayIdx);
        openAddModal(targetDate, clickedHour);
      });
    }

    // Bascule Mode Jour / Semaine
    document.getElementById('viewModeDayBtn')?.addEventListener('click', () => setViewMode('day'));
    document.getElementById('viewModeWeekBtn')?.addEventListener('click', () => setViewMode('week'));

    // Onglets de jours pour Smartphone
    for (let i = 0; i < 7; i++) {
      document.getElementById(`mTab${i}`)?.addEventListener('click', () => {
        selectDay(i);
        if (state.viewMode !== 'day' && window.innerWidth <= 768) {
          setViewMode('day');
        }
      });
    }

    // Bouton Flottant (FAB) Mobile
    document.getElementById('mobileFabBtn')?.addEventListener('click', () => {
      const targetDate = addDays(state.currentMonday, state.selectedDayIndex);
      openAddModal(targetDate);
    });

    // Gestes tactiles Swipe Gauche / Droite (changement de jour)
    const viewport = document.getElementById('scheduleViewport');
    if (viewport) {
      let touchStartX = 0;
      let touchStartY = 0;

      viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      viewport.addEventListener('touchend', (e) => {
        if (e.changedTouches.length === 1) {
          const diffX = e.changedTouches[0].clientX - touchStartX;
          const diffY = e.changedTouches[0].clientY - touchStartY;

          if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY) * 1.3) {
            if (state.viewMode === 'day') {
              if (diffX < 0) {
                goToNextDay();
              } else {
                goToPrevDay();
              }
            }
          }
        }
      }, { passive: true });
    }

    // Gestion du redimensionnement d'écran
    window.addEventListener('resize', () => {
      const isMobile = window.innerWidth <= 768;
      const daySelector = document.getElementById('mobileDaySelector');
      if (daySelector) {
        daySelector.style.display = (state.viewMode === 'day' || isMobile) ? 'grid' : 'none';
      }
    });

    document.getElementById('dateJumpInput')?.addEventListener('change', (e) => {
      if (e.target.value) {
        state.currentMonday = getMonday(new Date(e.target.value));
        render();
      }
    });

    // Filtres de catégories
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const cat = chip.getAttribute('data-category');
        if (cat === 'all') {
          if (state.activeCategories.has('all')) {
            state.activeCategories.clear();
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
          } else {
            state.activeCategories = new Set(['all', 'cours', 'alternance', 'travail', 'sport', 'medical', 'perso', 'pause']);
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.add('active'));
          }
        } else {
          if (state.activeCategories.has(cat)) {
            state.activeCategories.delete(cat);
            state.activeCategories.delete('all');
            chip.classList.remove('active');
            document.getElementById('filterAll')?.classList.remove('active');
          } else {
            state.activeCategories.add(cat);
            chip.classList.add('active');
            if (['cours', 'alternance', 'travail', 'sport', 'medical', 'perso', 'pause'].every(c => state.activeCategories.has(c))) {
              state.activeCategories.add('all');
              document.getElementById('filterAll')?.classList.add('active');
            }
          }
        }
        renderEvents();
      });
    });

    // Bascule de thème Clair / Sombre
    document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);

    // Modale Ajouter
    document.getElementById('openAddModalBtn')?.addEventListener('click', () => openAddModal());
    document.getElementById('closeEventModalBtn')?.addEventListener('click', closeEventModal);
    document.getElementById('cancelEventBtn')?.addEventListener('click', closeEventModal);
    document.getElementById('eventForm')?.addEventListener('submit', handleEventFormSubmit);
    document.getElementById('deleteFormEventBtn')?.addEventListener('click', () => {
      const id = document.getElementById('formEventId').value;
      deleteEvent(id);
    });

    // Modale Bilan des Matières & Alternance
    document.getElementById('openSubjectsModalBtn')?.addEventListener('click', () => openSubjectsModal());
    document.getElementById('closeSubjectsModalBtn')?.addEventListener('click', closeSubjectsModal);
    document.getElementById('closeSubjectsFooterBtn')?.addEventListener('click', closeSubjectsModal);

    // Onglets du Bilan (Cours / Alternance / Synthèse)
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) switchBilanTab(tab);
      });
    });

    // Filtres & Recherche de l'onglet Cours (avec micro-debounce pour saisie fluide)
    const subjSearchInput = document.getElementById('subjectsSearchInput');
    const clearSearchBtn = document.getElementById('clearSubjectSearchBtn');
    const debouncedRenderSubjects = debounce(() => renderSubjectsModal(), 80);

    if (subjSearchInput) {
      subjSearchInput.addEventListener('input', (e) => {
        currentSubjectSearchQuery = e.target.value;
        if (clearSearchBtn) {
          clearSearchBtn.style.display = currentSubjectSearchQuery ? 'block' : 'none';
        }
        debouncedRenderSubjects();
      });
    }
    if (clearSearchBtn && subjSearchInput) {
      clearSearchBtn.addEventListener('click', () => {
        subjSearchInput.value = '';
        currentSubjectSearchQuery = '';
        clearSearchBtn.style.display = 'none';
        renderSubjectsModal();
        subjSearchInput.focus();
      });
    }

    document.querySelectorAll('[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentSubjectFilter = chip.getAttribute('data-filter') || 'all';
        renderSubjectsModal();
      });
    });

    // Filtres & Recherche de l'onglet Alternance (avec micro-debounce)
    const altSearchInput = document.getElementById('altSearchInput');
    const clearAltSearchBtn = document.getElementById('clearAltSearchBtn');
    const debouncedRenderAlt = debounce(() => renderAlternanceBilan(), 80);

    if (altSearchInput) {
      altSearchInput.addEventListener('input', (e) => {
        currentAltSearchQuery = e.target.value;
        if (clearAltSearchBtn) {
          clearAltSearchBtn.style.display = currentAltSearchQuery ? 'block' : 'none';
        }
        debouncedRenderAlt();
      });
    }
    if (clearAltSearchBtn && altSearchInput) {
      clearAltSearchBtn.addEventListener('click', () => {
        altSearchInput.value = '';
        currentAltSearchQuery = '';
        clearAltSearchBtn.style.display = 'none';
        renderAlternanceBilan();
        altSearchInput.focus();
      });
    }

    document.querySelectorAll('[data-alt-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-alt-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentAltFilter = chip.getAttribute('data-alt-filter') || 'all';
        renderAlternanceBilan();
      });
    });

    // Modale Détails
    document.getElementById('closeDetailModalBtn')?.addEventListener('click', closeDetailModal);
    document.getElementById('detailCloseBtn')?.addEventListener('click', closeDetailModal);
    document.getElementById('detailDeleteBtn')?.addEventListener('click', () => {
      if (state.selectedEvent) deleteEvent(state.selectedEvent.id);
    });
    document.getElementById('detailEditBtn')?.addEventListener('click', () => {
      if (state.selectedEvent) openEditModal(state.selectedEvent);
    });

    // Modale Import .ICS
    document.getElementById('openImportModalBtn')?.addEventListener('click', openImportModal);
    document.getElementById('closeImportModalBtn')?.addEventListener('click', closeImportModal);
    document.getElementById('cancelImportBtn')?.addEventListener('click', closeImportModal);

    const dropZone = document.getElementById('icsDropZone');
    const fileInput = document.getElementById('icsFileInput');
    const triggerFileBtn = document.getElementById('triggerFileSelectBtn');

    if (triggerFileBtn && fileInput) {
      triggerFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
          handleFileImport(e.dataTransfer.files[0]);
        }
      });
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleFileImport(e.target.files[0]);
        }
      });
    }

    // URL Import
    document.getElementById('processUrlImportBtn')?.addEventListener('click', () => {
      const url = document.getElementById('icsUrlInput')?.value.trim();
      if (!url) {
        showToast('Veuillez saisir une URL de calendrier.');
        return;
      }
      showToast('Tentative de synchronisation...');
      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error('Erreur HTTP ' + res.status);
          return res.text();
        })
        .then(text => {
          const newCourses = ICSParser.parse(text);
          if (newCourses.length > 0) {
            const nonSchoolEvents = state.events.filter(ev => !ev.isSchool && ev.category !== 'cours');
            state.events = [...newCourses, ...nonSchoolEvents];
            saveEvents();
            closeImportModal();
            render();
            showToast(`Synchronisation réussie ! ${newCourses.length} cours chargés.`);
          } else {
            showToast('Aucun cours trouvé dans ce flux.');
          }
        })
        .catch(err => {
          console.warn('Erreur synchronisation CORS ou réseau:', err);
          showToast('Impossible de charger le flux en direct (restriction CORS de l\'école). Télécharge le fichier .ics et glisse-le dans la zone prévue !');
        });
    });

    // Exportation
    document.getElementById('exportScheduleBtn')?.addEventListener('click', exportSchedule);

    // Réinitialisation
    document.getElementById('resetDataBtn')?.addEventListener('click', () => {
      if (confirm('Attention : cela va réinitialiser tout le planning avec les cours de base, le travail du week-end et le volley-ball. Continuer ?')) {
        localStorage.removeItem(STORAGE_KEY);
        loadEvents();
        render();
        showToast('Planning réinitialisé par défaut.');
      }
    });

    // Fermeture des modales avec Échap ou clic en dehors
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          overlay.setAttribute('aria-hidden', 'true');
        }
      });
    });

    // Gestion des touches du clavier (Raccourcis & Échap)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeEventModal();
        closeDetailModal();
        closeImportModal();
        closeSubjectsModal();
        return;
      }

      // Ignorer les raccourcis si l'utilisateur saisit dans un champ de formulaire
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      // Ignorer les raccourcis de navigation si une modale est ouverte
      if (document.querySelector('.modal-overlay.active')) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (state.viewMode === 'day') goToPrevDay();
        else {
          state.currentMonday = addDays(state.currentMonday, -7);
          render();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (state.viewMode === 'day') goToNextDay();
        else {
          state.currentMonday = addDays(state.currentMonday, 7);
          render();
        }
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        goToToday();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openAddModal();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        openSubjectsModal();
      }
    });
  }

  // Démarrer l'application dès le chargement du DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
