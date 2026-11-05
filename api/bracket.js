// GET /api/bracket -> in-progress and upcoming sets with stations, for the station board.
const { gql, getRoster } = require('./_startgg');

// Trimmed query (no nested team members) to stay under start.gg's object limit;
// players come from the cached roster instead.
const QUERY = `
  query EventSets($eventId: ID!) {
    event(id: $eventId) {
      name
      sets(perPage: 20, filters: { state: [1, 2] }) {
        nodes {
          id
          station { id number }
          fullRoundText
          phaseGroup { phase { name } }
          slots {
            entrant { id name }
            standing { stats { score { value } } }
          }
        }
      }
    }
  }`;

const phaseStyles = {
  'Group Stage':          { css: 'groups' },
  'Silver Bracket':       { css: 'silver' },
  'Silver Final Four':    { css: 'silver' },
  'Bronze Bracket':       { css: 'bronze' },
  'Redemption Bracket':   { css: 'redemption' },
  'Top 8':                { css: 'top8' },
  'Championship Bracket': { css: 'top8' },
  'Side Event':           { css: 'side' }
};
function getPhaseStyle(name) {
  if (phaseStyles[name]) return phaseStyles[name];
  if (/^(Group|Pool)/.test(name)) return phaseStyles['Group Stage'];
  return { css: 'side' };
}

module.exports = async function (req, res) {
  try {
    if (!process.env.EVENT_ID) throw new Error('EVENT_ID is not set');
    const mainStation = parseInt(process.env.MAIN_STATION || '6', 10);
    const [data, roster] = await Promise.all([gql(QUERY, { eventId: process.env.EVENT_ID }), getRoster()]);
    const sets = (data && data.event && data.event.sets && data.event.sets.nodes) || [];
    const out = sets.filter(function (s) {
      return s.slots && s.slots.length >= 2 && s.slots[0].entrant && s.slots[1].entrant &&
        s.slots[0].standing && s.slots[1].standing && s.phaseGroup && s.phaseGroup.phase && typeof s.id === 'number';
    }).map(function (s) {
      const t1 = s.slots[0], t2 = s.slots[1], phase = s.phaseGroup.phase.name;
      const r1 = roster[t1.entrant.id], r2 = roster[t2.entrant.id];
      const score = function (slot) { return (slot.standing.stats && slot.standing.stats.score && slot.standing.stats.score.value) ?? 0; };
      return {
        id: s.id,
        station: s.station ? (s.station.number === mainStation ? 'M' : s.station.number) : null,
        round: s.fullRoundText,
        phase: phase,
        phaseStyle: getPhaseStyle(phase),
        team1: { name: r1 ? r1.teamName : t1.entrant.name, players: r1 ? r1.players : [], score: score(t1) },
        team2: { name: r2 ? r2.teamName : t2.entrant.name, players: r2 ? r2.players : [], score: score(t2) }
      };
    });
    // Short shared cache so many screens don't each hit start.gg.
    res.setHeader('Cache-Control', 's-maxage=8, stale-while-revalidate=20');
    res.status(200).json(out);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch from start.gg: ' + error.message });
  }
};
