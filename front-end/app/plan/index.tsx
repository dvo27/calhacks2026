import { useTrekStore } from '@/lib/store';
import LocationStep from './steps/LocationStep';
import ActivitiesStep from './steps/ActivitiesStep';
import CreateStep from './steps/CreateStep'; // search & drop pins (map screen)
import PlanStep from './steps/PlanStep';

export default function PlanScreen() {
  const planStep = useTrekStore((s) => s.planStep);

  if (planStep === 'location') return <LocationStep />;
  if (planStep === 'acts') return <ActivitiesStep />;
  if (planStep === 'discover') return <CreateStep />;
  return <PlanStep />;
}