import { redirect } from 'next/navigation';

export default function NewAccountPage() {
  redirect('/accounts?new=1');
}
