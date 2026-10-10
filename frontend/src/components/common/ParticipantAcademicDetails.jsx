import 'react';

/** For authorized staff views only; older participant records can lack these fields. */
export default function ParticipantAcademicDetails({
  participant,
  snapshot = {},
  name
}) {
  const account = participant && typeof participant === 'object' ? participant : {};
  const value = field => {
    const raw = account[field] || (field === 'studentId' ? snapshot.studentIdSnapshot : undefined);
    return typeof raw === 'string' ? raw.trim() || 'Not provided' : raw || 'Not provided';
  };
  return <dl className="summary-list participant-academic-details" aria-label={'Academic details for ' + (name || account.name || snapshot.nameSnapshot || 'participant')}>
    {[['College / university', 'college'], ['Student ID', 'studentId'], ['Course', 'course'], ['Specialization', 'specialization'], ['Section', 'section'], ['Year', 'year']].map(([label, field]) => <div key={field}><dt>{label}</dt><dd>{value(field)}</dd></div>)}
  </dl>;
}
