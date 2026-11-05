// GET /api/phases -> the event's bracket stages from start.gg and the color each gets
// on the station board. Use this to check names after setting EVENT_ID.
const { gql } = require('./_startgg');
const { getPhaseStyle } = require('./bracket');

const QUERY = `
  query EventPhases($eventId: ID!) {
    event(id: $eventId) { name phases { id name phaseOrder } }
  }`;
const NAMES = { groups: 'blue (groups)', silver: 'silver', bronze: 'bronze', redemption: 'green (redemption)', top8: 'gold (top 8)', side: 'grey (side / other)' };

module.exports = async function (req, res) {
  try {
    if (!process.env.EVENT_ID) throw new Error('EVENT_ID is not set');
    const d = await gql(QUERY, { eventId: process.env.EVENT_ID });
    if (!d.event) throw new Error('No event found for EVENT_ID ' + process.env.EVENT_ID);
    const phases = (d.event.phases || []).slice().sort((a, b) => (a.phaseOrder || 0) - (b.phaseOrder || 0)).map(function (p) {
      const css = getPhaseStyle(p.name).css;
      return { name: p.name, color: NAMES[css] || css };
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ event: d.event.name, eventId: process.env.EVENT_ID, phases });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
