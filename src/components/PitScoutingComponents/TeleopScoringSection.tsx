import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { Label } from "@/components/ui/label";
import { type TeleopScoring } from "@/lib/pitScoutingTypes";
import { LabeledCounter } from "./LabeledCounter";

interface TeleopScoringProps {
  teleopScoring: TeleopScoring;
  setTeleopScoring: React.Dispatch<React.SetStateAction<TeleopScoring>>;
}

export const TeleopScoringSection = ({ teleopScoring, setTeleopScoring }: TeleopScoringProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reported Teleop Scoring</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-3">Coral Scoring</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((level) => (
              <LabeledCounter
                key={`teleop-coral${level}`}
                label={`Level ${level}`}
                value={teleopScoring[`coralL${level}` as keyof TeleopScoring] as number}
                onChange={(value) =>
                  setTeleopScoring(prev => ({
                    ...prev,
                    [`coralL${level}`]: value
                  }))
                }
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Algae Scoring</h3>
          <div className="space-y-4">
            <LabeledCounter
              label="Total Algae Moved"
              value={teleopScoring.totalAlgae}
              onChange={(value) =>
                setTeleopScoring(prev => ({ ...prev, totalAlgae: value }))
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="teleopAlgaeNetShots"
                  checked={teleopScoring.algaeNetShots}
                  onCheckedChange={(checked) =>
                    setTeleopScoring(prev => ({ ...prev, algaeNetShots: checked === true }))
                  }
                />
                <Label htmlFor="teleopAlgaeNetShots">Can do Net Shots</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="teleopAlgaeProcessor"
                  checked={teleopScoring.algaeProcessor}
                  onCheckedChange={(checked) =>
                    setTeleopScoring(prev => ({ ...prev, algaeProcessor: checked === true }))
                  }
                />
                <Label htmlFor="teleopAlgaeProcessor">Can use Processor</Label>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
