function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    return next();
  };
}

function requireEventAssignment(paramName = 'eventId') {
  return (req, res, next) => {
    if (['admin', 'super_admin'].includes(req.user?.role)) return next();
    const eventId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    const assigned = (req.user?.assignedEvents || []).some((id) => String(id) === String(eventId));
    if (req.user?.role !== 'organizer' || !assigned) {
      return res.status(403).json({ success: false, message: 'Organizer is not assigned to this event' });
    }
    return next();
  };
}

module.exports = { requireRole, authorize: requireRole, requireEventAssignment };
