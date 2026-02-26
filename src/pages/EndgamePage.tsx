/* QE: reduced button heights (h-12→h-8), text sizes (text-2xl→text-lg, text-lg→text-sm), gaps (gap-6→gap-3), and padding */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Button from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SpecialMultipleChoice } from "@/components/ui/special-multiple-choice";
import { toast } from "sonner";
import { transformToObjectFormat } from "@/lib/dataTransformation";
import { generateEntryId } from "@/lib/scoutingDataUtils";
import { saveScoutingEntry } from "@/lib/dexieDB";
import type { ScoutingDataWithId } from "@/lib/scoutingDataUtils";
import { ArrowRight } from "lucide-react";

const EndgamePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const states = location.state;

  const [shallowClimbAttempted, setShallowClimbAttempted] = useState(false);
  const [deepClimbAttempted, setDeepClimbAttempted] = useState(false);
  const [parkAttempted, setParkAttempted] = useState(false);
  const [climbFailed, setClimbFailed] = useState(false);
  const [brokeDown, setBrokeDown] = useState(false);
  const [comment, setComment] = useState("");

  const climbSelection = shallowClimbAttempted
    ? "Shallow Climb"
    : deepClimbAttempted
      ? "Deep Climb"
      : parkAttempted
        ? "Park"
        : "None";

  const handleClimbSelection = (value: string) => {
    setShallowClimbAttempted(value === "Shallow Climb");
    setDeepClimbAttempted(value === "Deep Climb");
    setParkAttempted(value === "Park");
  };

  const getActionsFromLocalStorage = (phase: string) => {
    const saved = localStorage.getItem(`${phase}StateStack`);
    return saved ? JSON.parse(saved) : [];
  };

  const handleSubmit = async () => {
    try {
      const autoActions = getActionsFromLocalStorage("auto");
      const teleopActions = getActionsFromLocalStorage("teleop");
      
      const scoutingInputs = {
        matchNumber: states?.inputs?.matchNumber || "",
        alliance: states?.inputs?.alliance || "",
        scoutName: states?.inputs?.scoutName || "",
        selectTeam: states?.inputs?.selectTeam || "",
        eventName: states?.inputs?.eventName || localStorage.getItem("eventName") || "",
        startPoses: states?.inputs?.startPoses || [false, false, false, false, false, false],
        autoActions: autoActions,
        teleopActions: teleopActions,
        autoPassedStartLine: states?.inputs?.autoPassedStartLine || false,
        teleopPlayedDefense: states?.inputs?.teleopPlayedDefense || false,
        shallowClimbAttempted,
        deepClimbAttempted,
        parkAttempted,
        climbFailed,
        brokeDown,
        comment
      };

      const objectData = transformToObjectFormat(scoutingInputs);
      const uniqueId = generateEntryId(objectData);
      
      const entryWithId: ScoutingDataWithId = {
        id: uniqueId,
        data: objectData,
        timestamp: Date.now()
      };

      await saveScoutingEntry(entryWithId);

      localStorage.removeItem("autoStateStack");
      localStorage.removeItem("teleopStateStack");

      const currentMatchNumber = localStorage.getItem("currentMatchNumber") || "1";
      const nextMatchNumber = (parseInt(currentMatchNumber) + 1).toString();
      localStorage.setItem("currentMatchNumber", nextMatchNumber);

      toast.success("Match data saved successfully!");
      navigate("/game-start");
      
    } catch (error) {
      console.error("Error saving match data:", error);
      toast.error("Error saving match data");
    }
  };

  const handleBack = () => {
    navigate("/teleop-scoring", {
      state: {
        inputs: {
          ...states?.inputs,
          endgameData: {
            shallowClimbAttempted,
            deepClimbAttempted,
            parkAttempted,
            climbFailed,
            brokeDown,
            comment
          }
        }
      }
    });
  };

  return (
    <div className="h-full w-full flex flex-col items-center px-2 pt-2 pb-2">
      <div className="w-full max-w-2xl">
        <h1 className="text-base font-semibold pb-1">Endgame</h1>
      </div>
      <div className="flex flex-col items-center gap-2 max-w-2xl w-full h-full min-h-0 pb-2">
        {/* Match Info */}
        {states?.inputs && (
          <Card className="w-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Match Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {states.inputs.eventName && (
                <div className="col-span-2 flex justify-between gap-2">
                  <span className="text-muted-foreground">Event</span>
                  <span className="font-medium truncate">{states.inputs.eventName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Match</span>
                <span className="font-medium">{states.inputs.matchNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Alliance</span>
                <Badge 
                  variant={states.inputs.alliance === "red" ? "destructive" : "default"}
                  className={states.inputs.alliance === "blue" ? "bg-blue-500 text-white text-[10px]" : "bg-red-500 text-white text-[10px]"}
                >
                  {states.inputs.alliance?.charAt(0).toUpperCase() + states.inputs.alliance?.slice(1)}
                </Badge>
              </div>
              <div className="col-span-2 flex justify-between gap-2">
                <span className="text-muted-foreground">Team</span>
                <span className="font-medium">{states.inputs.selectTeam}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Climbing Section */}
        <Card className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Climbing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Label className="text-xs">Climb Outcome</Label>
            <SpecialMultipleChoice
              ariaLabel="Climb Outcome"
              options={["None", "Shallow Climb", "Deep Climb", "Park"]}
              value={climbSelection}
              onValueChange={handleClimbSelection}
              allowDeselect={false}
            />
          </CardContent>
        </Card>

        {/* Issues Section */}
        <Card className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Issues</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Climb Failed</Label>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  className={`flex-1 h-7 text-xs ${!climbFailed ? 'border-primary bg-primary/35 text-white' : 'border-border/70 bg-card'}`}
                  onClick={() => setClimbFailed(false)}
                >
                  No
                </Button>
                <Button
                  variant="outline"
                  className={`flex-1 h-7 text-xs ${climbFailed ? 'border-primary bg-primary/35 text-white' : 'border-border/70 bg-card'}`}
                  onClick={() => setClimbFailed(true)}
                >
                  Yes
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Broke Down</Label>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  className={`flex-1 h-7 text-xs ${!brokeDown ? 'border-primary bg-primary/35 text-white' : 'border-border/70 bg-card'}`}
                  onClick={() => setBrokeDown(false)}
                >
                  No
                </Button>
                <Button
                  variant="outline"
                  className={`flex-1 h-7 text-xs ${brokeDown ? 'border-primary bg-primary/35 text-white' : 'border-border/70 bg-card'}`}
                  onClick={() => setBrokeDown(true)}
                >
                  Yes
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Comments Section */}
        <Card className="w-full flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Comments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <Label htmlFor="comment" className="text-xs">Additional Notes</Label>
              <Textarea
                id="comment"
                placeholder="Optional notes"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="min-h-16 text-xs leading-tight"
              />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-2 w-full pb-2">
          <Button
            variant="outline"
            onClick={handleBack}
            className="flex-1 h-7 px-2 text-xs"
          >
            Back
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-2 h-7 px-2 text-xs font-semibold"
            style={{
              backgroundColor: '#16a34a',
              color: 'white'
            }}
          >
            Submit Match Data
            <ArrowRight className="ml-0.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EndgamePage;
