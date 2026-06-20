import { useTrekStore } from '@/lib/store';
import CreateStep from './steps/CreateStep';
import ActivitiesStep from './steps/ActivitiesStep';
import DiscoverStep from './steps/DiscoverStep';
import PlanStep from './steps/PlanStep';

export default function PlanScreen() {
  const planStep = useTrekStore((s) => s.planStep);

  if (planStep === 'create') return <CreateStep />;
  if (planStep === 'acts') return <ActivitiesStep />;
  if (planStep === 'discover') return <DiscoverStep />;
  return <PlanStep />;
}
