import { Label } from "@/components/ui/label";
import { Counter } from "@/components/animate-ui/components/counter";

interface LabeledCounterProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export const LabeledCounter = ({ label, value, onChange, min = 0, max = 20 }: LabeledCounterProps) => {
  const handleChange = (newValue: number) => {
    const clampedValue = Math.max(min, Math.min(max, newValue));
    onChange(clampedValue);
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <Label className="text-sm font-medium">{label}</Label>
      <Counter 
        number={value} 
        setNumber={handleChange}
        buttonProps={{ size: "sm" }}
      />
    </div>
  );
};
