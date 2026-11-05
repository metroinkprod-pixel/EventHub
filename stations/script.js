// CONFIG
// Same site as the hub: the server functions live at /api/...
const API_BASE = '';
const stationMemory = {};

// Team and player names come from start.gg, so escape them before putting them on the page.
function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// CLOCK
function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  document.querySelector('.clock').textContent = hours + ':' + minutes + ' ' + ampm;
}

updateClock();
setInterval(updateClock, 1000);

// FETCH AND RENDER
async function fetchAndRender() {
  try {
    // The event is set on the server (EVENT_ID), so nobody can point your API token at another event.
    const dataRes = await fetch(API_BASE + '/api/bracket');
    const sets = await dataRes.json();
    if (!dataRes.ok || !Array.isArray(sets)) throw new Error((sets && sets.error) || 'Bad response');
    const activeSets = sets
      .filter(function(set) {
        return set.station !== null;
      })
      .sort(function(a, b) {
        if (a.station === 'M') return 1;
        if (b.station === 'M') return -1;
        return a.station - b.station;
      });

    // build lookup of currently active stations
    const activeByStation = {};
    activeSets.forEach(function(set) {
      activeByStation[set.station] = set;
    });

    // mark stations that dropped off as completed
    Object.keys(stationMemory).forEach(function(station) {
      if (!activeByStation[station] && !stationMemory[station].completed) {
        stationMemory[station] = { ...stationMemory[station], completed: true };
      }
    });

    // update memory with current active sets (always overwrite with fresh data)
    activeSets.forEach(function(set) {
      stationMemory[set.station] = set;
    });

    renderBoard(activeByStation);
    updateStreamFooter(activeSets);

  } catch (error) {
    console.error('Failed to fetch data:', error);
  }
}

// UPDATE STREAM FOOTER
function updateStreamFooter(sets) {
  const streamSet = sets.find(function(set) {
    return set.station === 'M';
  });

  const onStream = document.querySelector('.on-stream');

  if (streamSet) {
    onStream.textContent = 'ON STREAM: ' + streamSet.team1.name + ' vs ' + streamSet.team2.name + ' — ' + streamSet.round + ' · Station M';
  } else {
    onStream.textContent = 'No match currently on stream';
  }
}

// BUILD HTML FOR A SINGLE MATCH ROW
function buildMatchRow(set, isAlt) {
  const altClass = isAlt ? ' alt' : '';
  const completedClass = set.completed ? ' completed' : '';
  const players1 = set.team1.players.map(function(p) {
    return '<span>' + esc(p) + '</span>';
  }).join('');
  const players2 = set.team2.players.map(function(p) {
    return '<span>' + esc(p) + '</span>';
  }).join('');

  return `
    <div class="match-row${altClass}${completedClass}">
      <div class="station-bullet">${esc(set.station)}</div>
      <div class="team left">
        <span class="team-name">${esc(set.team1.name)}</span>
        <div class="players">${players1}</div>
      </div>
      <div class="scores">
        <div class="score">${esc(set.team1.score)}</div>
        <div class="score-divider">—</div>
        <div class="score">${esc(set.team2.score)}</div>
      </div>
      <div class="team right">
        <span class="team-name">${esc(set.team2.name)}</span>
        <div class="players">${players2}</div>
      </div>
    </div>
  `;
}

// RENDER THE FULL BOARD
function renderBoard(activeByStation) {
  const allStations = Object.keys(stationMemory).sort(function(a, b) {
    if (a === 'M') return 1;
    if (b === 'M') return -1;
    return a - b;
  });

  const groups = {};
  allStations.forEach(function(station) {
    // active set takes priority, otherwise use memory
    const set = activeByStation[station] || stationMemory[station];

    if (!groups[set.phase]) {
      groups[set.phase] = {
        style: set.phaseStyle,
        order: set.phaseOrder || 0,
        sets: []
      };
    }
    groups[set.phase].sets.push(set);
  });

  let html = '';
  // Show bracket stages in start.gg's order (pools first, finals last).
  Object.keys(groups).sort(function(a, b) {
    return (groups[a].order || 0) - (groups[b].order || 0);
  }).forEach(function(phaseName) {
    const group = groups[phaseName];
    html += `<div class="bracket-label ${esc(group.style.css)}">${esc(phaseName)}</div>`;
    group.sets.forEach(function(set, index) {
      html += buildMatchRow(set, index % 2 !== 0);
    });
  });

  document.querySelector('.matches').innerHTML = html;
}

// POLL EVERY 15 SECONDS
fetchAndRender();
setInterval(fetchAndRender, 15000);
