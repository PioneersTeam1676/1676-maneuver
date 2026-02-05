/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReefScoringSectionProps {
  onScoringAction: (action: any) => void;
  currentCoral: number;
  phase: "auto" | "teleop";
  showFlashing: boolean;
  lastCoralPickupLocation?: string;
}

const ReefScoringSection = ({ 
  onScoringAction, 
  currentCoral, 
  phase,
  lastCoralPickupLocation,
}: ReefScoringSectionProps) => {

  const handleReefScore = (level: string) => {
    // Must have coral to score on reef
    if (currentCoral <= 0) {
      console.log("Cannot score on reef - no coral held:", currentCoral);
      return;
    }
    
    onScoringAction({
      type: "score",
      location: "reef",
      level: level,
      pieceType: "coral",
      phase
    });
  };

  const handleCoralPickup = (location: string) => {
    onScoringAction({
      type: "pickup",
      location,
      pieceType: "coral",
      phase,
      replaceLastPickup: currentCoral > 0 // If already holding coral, replace the last pickup
    });
  };

  // Get coral pickup locations based on phase
  const getCoralPickupLocations = () => {
    if (phase === "auto") {
      return [
        { location: "preload", label: "Preload" },
        { location: "station", label: "Station" },
        { location: "mark1", label: "Mark 1" },
        { location: "mark2", label: "Mark 2" },
        { location: "mark3", label: "Mark 3" },
      ];
    } else {
      return [
        { location: "station", label: "Station" },
        { location: "carpet", label: "Carpet" },
      ];
    }
  };

  // Flipped order - L4 at top, Miss at bottom
  const reefLevels = [
    { level: "l4", label: "L4", position: "top" },
    { level: "l3", label: "L3", position: "mid-top" },
    { level: "l2", label: "L2", position: "mid-bottom" },
    { level: "l1", label: "L1", position: "bottom-high" },
    { level: "miss", label: "Drop/Miss", position: "bottom" },
  ];

  const coralPickupLocations = getCoralPickupLocations();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Coral</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {currentCoral}/1 Coral Held
            </Badge>
            {currentCoral === 0 && (
              <Badge variant="outline" className="text-amber-600">
                Pick up coral first
              </Badge>
            )}
            {currentCoral >= 1 && (
              <Badge variant="outline" className="text-green-600">
                Ready to score
              </Badge>
            )}
          </div>
        </div>
        
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Scoring Interface - Side by Side Layout */}
        <div className="flex gap-4 h-80">
          {/* Coral Pickup Section - Left Side */}
          <div className="flex flex-col gap-2 w-32 lg:w-40">
            <div className="flex flex-col gap-2 flex-1">
              {coralPickupLocations.map((pickup) => (
                <Button
                  key={pickup.location}
                  onClick={() => handleCoralPickup(pickup.location)}
                  variant={currentCoral > 0 && lastCoralPickupLocation === pickup.location ? "default" : "outline"}
                  className={`h-12 text-xs lg:text-sm font-medium flex-1 ${
                    currentCoral > 0 && lastCoralPickupLocation === pickup.location ? 'bg-primary text-primary-foreground' : ''
                  }`}
                >
                  {pickup.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Reef Visual Interface - Right Side */}
          <div 
            className="relative bg-cover bg-center bg-no-repeat rounded-lg overflow-hidden flex-1 border"
            style={{ 
              backgroundImage: `url(/ReefSideView.png)`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat'
            }}
          >
            {/* Overlay buttons for each level - equal height distribution */}
            <div className="absolute inset-0 flex flex-col p-1">
              {reefLevels.map((reef, index) => (
                <Button
                  key={reef.level}
                  onClick={() => handleReefScore(reef.level)}
                  disabled={currentCoral <= 0}
                  variant={reef.level === "miss" ? "destructive" : "default"}
                  className={`
                    flex-1 font-bold text-lg shadow-lg rounded-md
                    ${index < reefLevels.length - 1 ? 'mb-1' : ''}
                    ${currentCoral <= 0 ? 'cursor-not-allowed opacity-100' : 'opacity-95 hover:opacity-100'}
                    ${reef.level === "miss" 
                      ? 'bg-red-600 hover:bg-red-700 text-white border-2 border-red-800 opacity-100' 
                      : 'bg-white hover:bg-gray-100 text-black border-3 border-gray-800'
                    }
                  `}
                  style={{
                    textShadow: reef.level === "miss" ? '1px 1px 2px rgba(0,0,0,0.8)' : '1px 1px 2px rgba(255,255,255,0.8)',
                  }}
                >
                  {reef.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReefScoringSection;