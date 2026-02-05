import { GenericSelector } from "@/components/ui/generic-selector";

interface TeamSelectorProps {
  index: number;
  label: string;
  labelColor: string;
  value: string;
  availableTeams: string[];
  onValueChange: (value: string) => void;
}

export const TeamSelector = ({ 
  label, 
  value, 
  availableTeams,
  onValueChange 
}: TeamSelectorProps) => {
  // Add "none" option to the beginning of the available teams
  const teamsWithNone = ["none", ...availableTeams];
  
  const displayFormat = (value: string) => {
    if (value === "none") return "No team";
    return value ? `Team ${value}` : "Select team";
  };

  return (
    <GenericSelector
      label={label}
      value={value || "none"}
      availableOptions={teamsWithNone}
      onValueChange={onValueChange}
      placeholder="Select team"
      displayFormat={displayFormat}
    />
  );
};
