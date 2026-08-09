import { t } from '../locales';
import { currentRoute } from './router';

const items: { route: string; key: 'nav.library' | 'nav.scan' | 'nav.add' | 'nav.settings'; icon: string; match: string[] }[] = [
  { route: '/', key: 'nav.library', icon: '\u{1F4DA}', match: ['library', 'book', 'book-edit'] },
  { route: '/scan', key: 'nav.scan', icon: '\u{1F4F7}', match: ['scan'] },
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
        </a>
      ))}
    </nav>
  );
}
