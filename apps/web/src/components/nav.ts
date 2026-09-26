export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Destinos do dia a dia — tabs inferiores no mobile e topo da sidebar no desktop. */
export const primaryNav: NavItem[] = [
  { href: '/dashboard', label: 'Painel' },
  { href: '/transactions', label: 'Lançamentos' },
  { href: '/imports', label: 'Importar' },
];

/** Demais seções, agrupadas para o menu "Mais" e para a sidebar. */
export const moreNav: NavGroup[] = [
  {
    title: 'Organização',
    items: [
      { href: '/accounts', label: 'Contas' },
      { href: '/categories', label: 'Categorias' },
      { href: '/budgets', label: 'Orçamentos' },
    ],
  },
  {
    title: 'Compromissos',
    items: [
      { href: '/installments', label: 'Parcelas' },
      { href: '/recurring', label: 'Recorrentes' },
    ],
  },
  {
    title: 'Espaço',
    items: [
      { href: '/settings/import-alias', label: 'Email' },
      { href: '/settings/household', label: 'Família' },
      { href: '/settings/activity', label: 'Atividade' },
    ],
  },
];

export const allNavItems: NavItem[] = [...primaryNav, ...moreNav.flatMap((group) => group.items)];

export function isNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isMoreActive(pathname: string) {
  return moreNav.some((group) => group.items.some((item) => isNavActive(pathname, item.href)));
}
