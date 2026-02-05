import { GenericSelector } from "@/components/ui/generic-selector";
import type { SortOption } from "@/lib/pickListTypes";

interface SortSelectorProps {
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
}

const sortOptions = [
  { value: "number" as const, label: "Team Number" },
  { value: "totalCoral" as const, label: "Total Coral (All)" },
  { value: "totalAlgae" as const, label: "Total Algae (All)" },
  { value: "autoCorals" as const, label: "Auto Corals" },
  { value: "teleopCorals" as const, label: "Teleop Corals" },
  { value: "coralL1" as const, label: "Level 1 Coral (All)" },
  { value: "coralL2" as const, label: "Level 2 Coral (All)" },
  { value: "coralL3" as const, label: "Level 3 Coral (All)" },
  { value: "coralL4" as const, label: "Level 4 Coral (All)" },
  { value: "climb" as const, label: "Climb Rate" },
  { value: "matches" as const, label: "Matches Played" }
];

export const SortSelector = ({ sortBy, onSortChange }: SortSelectorProps) => {
  const sortValues = sortOptions.map(option => option.value);
  
  const displayFormat = (value: string) => {
    const option = sortOptions.find(opt => opt.value === value);
    return option?.label || value;
  };
  
  const handleValueChange = (value: string) => {
    onSortChange(value as SortOption);
  };

  return (
    <GenericSelector
      label="Sort Teams By"
      value={sortBy}
      availableOptions={sortValues}
      onValueChange={handleValueChange}
      placeholder="Sort by..."
      displayFormat={displayFormat}
    />
  );
};
