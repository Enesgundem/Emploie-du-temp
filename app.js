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
  const STORAGE_KEY = 'mon_emploi_du_temps_v3_events';

  // État de l'application
  const state = {
    events: [],
    currentMonday: null,
    activeCategories: new Set(['all', 'cours', 'alternance', 'travail', 'sport', 'medical', 'perso', 'pause']),
    selectedEvent: null,
    viewMode: window.innerWidth <= 768 ? 'day' : 'week',
    selectedDayIndex: 0
  };

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
      const stored = localStorage.getItem(STORAGE_KEY);
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
  }

  function saveEvents() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
      updateFooterCount();
    } catch (e) {
      console.error('Erreur sauvegarde localStorage:', e);
    }
  }

  // Initialisation sur la date actuelle (ou début de semaine du 7 septembre 2026)
  function initCurrentDate() {
    // Utiliser la date système locale (actuellement 2026-09-07)
    const now = new Date();
    state.currentMonday = getMonday(now);
    const day = now.getDay();
    state.selectedDayIndex = (day === 0 ? 6 : day - 1);
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
      const headerEl = document.getElementById(`headerDay${i}`);
      const dayColEl = document.getElementById(`dayCol${i}`);
      const tabEl = document.getElementById(`mTab${i}`);

      if (headerEl) {
        const nameEl = headerEl.querySelector('.day-name');
        const numEl = headerEl.querySelector('.day-number');
        if (nameEl) nameEl.textContent = DAY_NAMES[i];
        if (numEl) numEl.textContent = dayDate.getDate();

        if (i === todayIndex) {
          headerEl.classList.add('today');
        } else {
          headerEl.classList.remove('today');
        }
      }

      if (dayColEl) {
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

      const dayEvents = getEventsForDay(dayIdx);
      const positionedItems = layoutDayEvents(dayEvents);

      positionedItems.forEach(item => {
        const ev = item.event;
        const card = createEventCard(ev, item.startMin, item.endMin, item.col, item.totalCols);
        layer.appendChild(card);
      });
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
      if (tipTitle) tipTitle.textContent = 'Volley Lun/Mar';
      if (tipDesc) tipDesc.textContent = 'Début semaine prochaine (14 sept.)';
    } else if (weekNum % 2 === 0) {
      if (tipTitle) tipTitle.textContent = 'Semaine Volley+';
      if (tipDesc) tipDesc.textContent = 'Séances Lun, Mar et Ven (20h30)';
    } else {
      if (tipTitle) tipTitle.textContent = 'Semaine standard';
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
    const printArea = document.getElementById('schedulePrintArea');
    if (!printArea) return;

    if (typeof html2canvas !== 'undefined') {
      showToast('Génération de l\'image en cours...');
      html2canvas(printArea, {
        backgroundColor: '#090c0e',
        scale: 2, // Haute résolution
        logging: false,
        useCORS: true
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

    document.getElementById('todayBtn')?.addEventListener('click', () => {
      const now = new Date();
      state.currentMonday = getMonday(now);
      const day = now.getDay();
      state.selectedDayIndex = (day === 0 ? 6 : day - 1);
      render();
      updateDayColumnsVisibility();
    });

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

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeEventModal();
        closeDetailModal();
        closeImportModal();
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
