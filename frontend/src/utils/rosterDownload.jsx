const BASE = process.env.REACT_APP_API_URL || '/api/v1';
export async function downloadRoster(path, filename = 'eventflow-participants.csv') {
  let response;
  try {
    response = await fetch(BASE + path, {
      credentials: 'include'
    });
  } catch {
    throw new Error('Unable to download the participant list. Check your connection and try again.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || 'The participant list could not be downloaded. Please try again.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
