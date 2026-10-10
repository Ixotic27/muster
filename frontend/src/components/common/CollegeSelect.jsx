import 'react';
import { Field } from './Portal';
export default function CollegeSelect({
  value = '',
  onChange,
  name = 'college',
  disabled = false
}) {
  return <Field label="Organization / institution (optional)" name={name} value={value} onChange={onChange} maxLength={160} disabled={disabled} placeholder="Your organization or institution" />;
}
