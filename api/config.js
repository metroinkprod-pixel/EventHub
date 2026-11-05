// GET /api/config -> kept for older versions of the station board.
module.exports = function (req, res) {
  res.status(200).json({ eventId: process.env.EVENT_ID || null });
};
