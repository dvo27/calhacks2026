import { useTrekStore } from '@/lib/store';
import CreateStep from './steps/CreateStep';
import PlanStep from './steps/PlanStep';

export default function PlanScreen() {
  const planStep = useTrekStore((s) => s.planStep);

  if (planStep === 'discover') return <CreateStep />;
  return <PlanStep />;
}