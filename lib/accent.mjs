// A company's accent colour (tenants.settings.accent), picked in
// Settings → Company from these presets only, so nobody can choose a shade that
// makes buttons or links unreadable. Channel triplets for rgb(var(--primary)).
// Dark mode lifts most hues one step so accent text stays legible on the
// slate cards; teal and emerald stay put because white button text needs it.
export const ACCENTS = {
  saffron: { label: 'Saffron', light: '224 122 0', dark: '224 122 0' },
  blue: { label: 'Blue', light: '37 99 235', dark: '59 130 246' },
  indigo: { label: 'Indigo', light: '79 70 229', dark: '99 102 241' },
  teal: { label: 'Teal', light: '13 148 136', dark: '13 148 136' },
  emerald: { label: 'Emerald', light: '5 150 105', dark: '5 150 105' },
  rose: { label: 'Rose', light: '225 29 72', dark: '244 63 94' },
  violet: { label: 'Violet', light: '124 58 237', dark: '139 92 246' },
  slate: { label: 'Slate', light: '51 65 85', dark: '100 116 139' },
};

export const DEFAULT_ACCENT = 'saffron';

export function accentOf(key) {
  return Object.hasOwn(ACCENTS, key) ? key : DEFAULT_ACCENT;
}
