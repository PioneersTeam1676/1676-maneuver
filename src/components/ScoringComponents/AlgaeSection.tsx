/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AlgaeSectionProps {
  onAlgaeAction: (action: any) => void;
  phase: "auto" | "teleop";
  showFlashing: boolean;
  currentAlgae: number;
  lastAlgaePickupLocation?: string;
}

const AlgaeSection = ({ onAlgaeAction, phase, showFlashing, currentAlgae, lastAlgaePickupLocation }: AlgaeSectionProps) => {

  const handleAlgaeAction = (actionType: string, location: string) => {
    // For pickup actions, allow changing pickup location even if already holding algae
    if (actionType === "pickup") {
      onAlgaeAction({
        type: actionType,
        location: location,
        pieceType: "algae",
        phase,
        replaceLastPickup: currentAlgae > 0 // If already holding algae, replace the last pickup
      });
      return;
    }
    
    // For scoring/action types, must have algae (miss is allowed without algae for tracking failed attempts)
    if ((actionType === "score" || actionType === "action") && currentAlgae <= 0 && location !== "miss") {
      console.log("Cannot score/remove algae - no algae held:", currentAlgae);
      return;
    }
    
    onAlgaeAction({
      type: actionType,
      location: location,
      pieceType: (actionType === "pickup" || actionType === "score" || actionType === "action") ? "algae" : undefined,
      phase
    });
  };

  // Different algae actions based on phase
  const getAlgaeActions = () => {
    // Reordered scoring actions: Net Shot, Remove, Processor, Miss
    const scoringActions = [
      { action: "net", label: "Net Shot", type: "score" },
      { action: "remove", label: "Remove", type: "action" },
      { action: "processor", label: "Processor", type: "score" },
      { action: "miss", label: "Miss", type: "score" },
    ];

    const pickupActions = phase === "auto" 
      ? [
          { action: "reef", label: "Reef", type: "pickup" },
          { action: "mark1", label: "Mark 1", type: "pickup" },
          { action: "mark2", label: "Mark 2", type: "pickup" },
          { action: "mark3", label: "Mark 3", type: "pickup" },
        ]
      : [
          { action: "reef", label: "Reef", type: "pickup" },
          { action: "carpet", label: "Carpet", type: "pickup" },
        ];

    return { scoring: scoringActions, pickup: pickupActions };
  };

  const algaeActions = getAlgaeActions();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Algae</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
            {currentAlgae}/1 Algae Held
          </Badge>
          {currentAlgae === 0 && (
            <Badge variant="outline" className="text-amber-600">
              Pick up algae first
            </Badge>
          )}
          {currentAlgae >= 1 && (
            <Badge variant="outline" className="text-green-600">
              Ready to score
            </Badge>
          )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Algae Interface - Side by Side Layout */}
        <div className="flex gap-4 h-80">
          {/* Algae Pickup Section - Left Side */}
          <div className="flex flex-col gap-2 w-32 lg:w-40">
            <div className="flex flex-col gap-2 flex-1">
              {algaeActions.pickup.map((action) => (
                <Button
                  key={action.action}
                  onClick={() => handleAlgaeAction(action.type, action.action)}
                  variant={currentAlgae > 0 && lastAlgaePickupLocation === action.action ? "default" : "outline"}
                  className={`h-12 text-xs lg:text-sm font-medium flex-1 ${
                    currentAlgae > 0 && lastAlgaePickupLocation === action.action ? 'bg-primary text-primary-foreground' : ''
                  }`}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Algae Scoring Section - Right Side */}
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex flex-col gap-2 flex-1">
              {algaeActions.scoring.map((action) => (
                <Button
                  key={action.action}
                  onClick={() => handleAlgaeAction(action.type, action.action)}
                  variant={action.action === "miss" ? "destructive" : "outline"}
                  disabled={(action.type === "score" || action.type === "action") && currentAlgae <= 0}
                  className={`h-16 text-sm font-medium flex-1 ${
                    phase === "auto" && showFlashing ? 'animate-pulse' : ''
                  } ${(action.type === "score" || action.type === "action") && currentAlgae <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AlgaeSection;