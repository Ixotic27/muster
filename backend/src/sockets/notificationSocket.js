const { recheckSocketAccess, startSocketAuthGuard } = require('./socketAuth');

function registerNotificationSocket(io) {
  io.on('connection', async (socket) => {
    try {
      const user = await recheckSocketAccess(socket);
      if (!user) return;
      startSocketAuthGuard(socket);
      socket.join(`user:${String(user._id)}`);
      socket.data.userId = String(user._id);
    } catch (_) {
      socket.disconnect(true);
    }
  });
}

module.exports = registerNotificationSocket;
