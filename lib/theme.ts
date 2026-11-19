export const themeFields = [
  ['themeBackground', 'Page background', '--theme-background', '#ffffff'],
  ['themeText', 'Body text', '--theme-text', '#433654'],
  ['themeHeading', 'Headings', '--theme-heading', '#2d283e'],
  ['themeCard', 'Card background', '--theme-card', '#3a344e'],
  ['themeCardText', 'Card text', '--theme-card-text', '#ffffff'],
  ['themeSection', 'Section background', '--theme-section', '#ffffff'],
  ['themeHeader', 'Navigation background', '--theme-header', '#30233f'],
  ['themeHeaderText', 'Navigation text', '--theme-header-text', '#fff4df'],
  ['themeButton', 'Primary button background', '--theme-button', '#802bb1'],
  ['themeButtonText', 'Primary button text', '--theme-button-text', '#ffffff'],
  ['themeLink', 'Links', '--theme-link', '#682691'],
  ['themeBorder', 'Borders', '--theme-border', '#ded5e9'],
  ['themeHero', 'Banner background', '--theme-hero', '#745c97'],
  ['themeHeroText', 'Banner text', '--theme-hero-text', '#ffffff'],
  ['themeFooter', 'Footer background', '--theme-footer', '#3a2d53'],
  ['themeFooterText', 'Footer text', '--theme-footer-text', '#ffffff'],
] as const;

export const themeDefaults = Object.fromEntries(themeFields.map(([key, , , value]) => [key, value]));

export function themeStyles(branding: Record<string, unknown>) {
  return Object.fromEntries(themeFields.map(([key, , variable, fallback]) => {
    const value = branding[key];
    return [variable, typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback];
  }));
}
