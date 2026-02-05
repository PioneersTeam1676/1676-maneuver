import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GenericSelector } from "@/components/ui/generic-selector";
import { DRIVETRAIN_OPTIONS, PROGRAMMING_LANGUAGES } from "@/lib/pitScoutingTypes";

interface TechnicalSpecificationsProps {
  weight: string;
  setWeight: (value: string) => void;
  drivetrain: string;
  setDrivetrain: (value: string) => void;
  programmingLanguage: string;
  setProgrammingLanguage: (value: string) => void;
}

export const TechnicalSpecifications = ({
  weight,
  setWeight,
  drivetrain,
  setDrivetrain,
  programmingLanguage,
  setProgrammingLanguage,
}: TechnicalSpecificationsProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Technical Specifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="weight">Robot Weight (lbs)</Label>
            <Input
              id="weight"
              type="number"
              step="0.1"
              placeholder="e.g., 125.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="drivetrain">Drivetrain</Label>
            <GenericSelector
              label="Drivetrain"
              value={drivetrain}
              availableOptions={[...DRIVETRAIN_OPTIONS]}
              onValueChange={setDrivetrain}
              placeholder="Select drivetrain"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="programmingLanguage">Programming Language</Label>
            <GenericSelector
              label="Programming Language"
              value={programmingLanguage}
              availableOptions={[...PROGRAMMING_LANGUAGES]}
              onValueChange={setProgrammingLanguage}
              placeholder="Select language"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
