import { redirect } from 'next/navigation';

export default function NewTransactionPage() {
  redirect('/transactions?new=1');
}
