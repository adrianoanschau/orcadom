import { redirect } from 'next/navigation';

export default function NewSavingsGoalPage() {
  redirect('/savings-goals?new=1');
}
