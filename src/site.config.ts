// One file to edit per client. Everything visible on the site comes from here.
export default {
  name: 'Example Business',
  tagline: 'Friendly, reliable local service',
  description:
    'Replace this with one or two plain sentences about what the business does and who it helps.',
  phone: '+1-317-555-0100',
  email: 'hello@example.com',
  areaServed: ['Indianapolis, IN', 'Carmel, IN', 'Fishers, IN'],
  // Hosted booking page (e.g. Cal.com). Payments happen on the provider, never on this site.
  bookingUrl: 'https://cal.com/your-handle/intro-call',
  services: [
    { name: 'Service one', blurb: 'A short, specific description of this service.' },
    { name: 'Service two', blurb: 'A short, specific description of this service.' },
    { name: 'Service three', blurb: 'A short, specific description of this service.' },
  ],
  // Public key only. The secret lives in the Pages project settings.
  turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_SITEKEY ?? '1x00000000000000000000AA',
};
