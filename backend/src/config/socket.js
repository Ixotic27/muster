let io = null;

function setIO(instance) { io = instance; }
function getIO() { return io; }
function emitToUser(userId, event, payload) {
  if (!io || !userId) return false;
  io.to(`user:${String(userId)}`).emit(event, payload);
  return true;
}

module.exports = { setIO, getIO, emitToUser };
