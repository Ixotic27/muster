export const site = {
  name: process.env.REACT_APP_SITE_NAME || 'Muster',
  tagline: process.env.REACT_APP_SITE_TAGLINE || 'Good events start with a clear plan.',
  supportEmail: process.env.REACT_APP_SUPPORT_EMAIL || '',
  currency: 'INR',
  locale: process.env.REACT_APP_LOCALE || 'en-IN',
  timeZone: process.env.REACT_APP_TIMEZONE || 'UTC'
};
