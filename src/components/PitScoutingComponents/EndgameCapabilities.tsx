import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { Label } from "@/components/ui/label";

interface EndgameCapabilitiesProps {
  reportedEndgame: {
    canShallowClimb: boolean;
    canDeepClimb: boolean;
    canPark: boolean;
  };
  setReportedEndgame: React.Dispatch<React.SetStateAction<{
    canShallowClimb: boolean;
    canDeepClimb: boolean;
    canPark: boolean;
  }>>;
}

export const EndgameCapabilities = ({ reportedEndgame, setReportedEndgame }: EndgameCapabilitiesProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reported Endgame Capabilities</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="canShallowClimb"
              checked={reportedEndgame.canShallowClimb}
              onCheckedChange={(checked) =>
                setReportedEndgame(prev => ({ ...prev, canShallowClimb: checked === true }))
              }
            />
            <Label htmlFor="canShallowClimb">Can Shallow Climb</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="canDeepClimb"
              checked={reportedEndgame.canDeepClimb}
              onCheckedChange={(checked) =>
                setReportedEndgame(prev => ({ ...prev, canDeepClimb: checked === true }))
              }
            />
            <Label htmlFor="canDeepClimb">Can Deep Climb</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="canPark"
              checked={reportedEndgame.canPark}
              onCheckedChange={(checked) =>
                setReportedEndgame(prev => ({ ...prev, canPark: checked === true }))
              }
            />
            <Label htmlFor="canPark">Can Park</Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
