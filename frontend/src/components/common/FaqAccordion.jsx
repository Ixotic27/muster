import 'react';
const questions = [['How do I register?', 'Create an account, choose an event and follow its registration steps. The event page lists the deadline and any entry requirements.'], ['Do I need a team?', 'Each event specifies individual or team participation. For team events, create a team and invite members before the leader submits the registration.'], ['When will I receive my pass?', 'Your individual entry pass becomes available after payment is confirmed and any required document is approved. Free events follow the organizer’s published requirements.'], ['How do refunds work?', 'The registration page shows available cancellation or refund actions. Refunds require organizer review; a submitted request does not mean money has been returned.']];
export default function FaqAccordion() {
  return <div className="faq-list">{questions.map(([question, answer]) => <details className="faq-item" key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>;
}
