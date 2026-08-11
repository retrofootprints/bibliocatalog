import { t } from '../locales';
import type { TranslationKeys } from '../locales/keys';
import { currentRoute } from './router';

interface NavItem {
  route: string;
  key: keyof TranslationKeys;
  icon: string;
  match: string[];
  /** Marks an experimental module (SPEC §10, Phase 5). */
  beta?: boolean;
}

const items: NavItem[] = [
  { route: '/', key: 'nav.library', icon: '\u{1F4DA}', match: ['library', 'book', 'book-edit', 'shelves'] },
  { route: '/scan', key: 'nav.scan', icon: '\u{1F4F7}', match: ['scan'] },
  { route: '/spines', key: 'nav.spines', icon: '\u{1F516}', match: ['spines'], beta: true },
  { route: '/add', key: 'nav.add', icon: '➕', match: ['add'] },
  { route: '/settings', key: 'nav.settings', icon: '⚙️', match: ['settings'] },
];

export function NavBar() {
  const active = currentRoute.value.name;
  return (
    <nav class="navbar" aria-label={t('app.name')}>
      {items.map((item) => (
        <a key={item.route} href={`#${item.route}`} class={`navbar__item ${item.match.includes(active) ? 'navbar__item--active' : ''}`}>
          <span class="navbar__icon" aria-hidden="true">
            {item.icon}
          </span>
          <span class="navbar__label">{t(item.key)}</span>
          {item.beta && <span class="navbar__badge">{t('nav.beta')}</span>}
        </a>
      ))}
    </nav>
  );
}
