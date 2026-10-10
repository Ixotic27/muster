// Live User data is the source for certificate recipient details. Legacy
// accounts may omit academic fields; never invent values or expose credentials.
const certificateRecipientFields = 'name email studentId college course specialization section year';
const certificateTeamPopulation = {
  path: 'teamId', select: 'teamName members status',
  populate: { path: 'members.userId', select: certificateRecipientFields }
};

function certificateRegistration(registration) {
  if (!registration?.teamId?.members) return registration;
  // Leaving and rejoining can produce a removed row and an accepted row for
  // the same User ID. Population matches IDs, so also enforce row status here.
  return { ...registration, teamId: { ...registration.teamId, members: registration.teamId.members.map(member =>
    member.status === 'accepted' ? member : { ...member, userId: member.userId?._id || member.userId }
  ) } };
}

module.exports = { certificateRecipientFields, certificateTeamPopulation, certificateRegistration };
