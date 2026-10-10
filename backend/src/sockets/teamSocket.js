const { Team } = require('../models');
const { recheckSocketAccess, startSocketAuthGuard } = require('./socketAuth');

function registerTeamSocket(io) {
  io.on('connection', async (socket) => {
    try {
      const user = await recheckSocketAccess(socket);
      if (!user) return;
      startSocketAuthGuard(socket);
      socket.on('team:join', async (teamId) => {
        try {
          const current = await recheckSocketAccess(socket);
          if (!current) return;
          const team = await Team.findOne({ _id: teamId, 'members': { $elemMatch: { userId: current._id, status: 'accepted' } } }).select('_id').lean();
          if (team) socket.join(`team:${String(team._id)}`);
        } catch (_) { /* An invalid team identifier must not crash the socket. */ }
      });
      socket.data.userId = String(user._id);
    } catch (_) {
      socket.disconnect(true);
    }
  });
}

module.exports = registerTeamSocket;
