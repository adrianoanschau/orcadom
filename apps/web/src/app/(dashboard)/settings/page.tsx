import Link from 'next/link';
import { PageHeader } from '@/components/ui';

const settings = [
  {
    href: '/profile',
    title: 'Perfil',
    description: 'Nome, e-mail, senha e localidade das datas.',
  },
  {
    href: '/settings/import-alias',
    title: 'Email',
    description: 'Endereço para encaminhar extratos e o mapeamento das contas.',
  },
  {
    href: '/settings/household',
    title: 'Família',
    description: 'Membros, convites e o nome do espaço compartilhado.',
  },
  {
    href: '/settings/activity',
    title: 'Atividade',
    description: 'Quem criou, editou ou removeu algo neste espaço.',
  },
];

export default function SettingsPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Ajustes da sua conta e do espaço em que você está."
      />
      <ul className="divide-y divide-hairline overflow-hidden rounded-lg bg-surface">
        {settings.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="block px-5 py-4 hover:bg-surface-sunken">
              <p className="text-sm font-medium text-ink">{item.title}</p>
              <p className="mt-1 text-sm text-ink-soft">{item.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
