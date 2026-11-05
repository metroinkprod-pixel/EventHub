// GET /api/roster -> { teams: [{ name, players: [...] }] } for the check-in import.
const { getRoster } = require('./_startgg');

module.exports = async function (req, res) {
  try {
    if (!process.env.EVENT_ID) throw new Error('EVENT_ID is not set');
    const roster = await getRoster(true);
    const teams = Object.keys(roster).map(function (id) {
      return { id: id, name: roster[id].teamName, players: roster[id].players || [] };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ teams: teams });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
