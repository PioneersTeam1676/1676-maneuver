import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/animate-ui/radix/tabs";
import { type AutoPositionScoring } from "@/lib/pitScoutingTypes";
import { LabeledCounter } from "./LabeledCounter";
import { FieldPositionVisual } from "./FieldPositionVisual";

interface AutoScoringByPositionProps {
  autoScoring: {
    position0: AutoPositionScoring;
    position1: AutoPositionScoring;
    position2: AutoPositionScoring;
    position3: AutoPositionScoring;
    position4: AutoPositionScoring;
  };
  setAutoScoring: React.Dispatch<React.SetStateAction<{
    position0: AutoPositionScoring;
    position1: AutoPositionScoring;
    position2: AutoPositionScoring;
    position3: AutoPositionScoring;
    position4: AutoPositionScoring;
  }>>;
}

export const AutoScoringByPosition = ({ autoScoring, setAutoScoring }: AutoScoringByPositionProps) => {
  const [activeTab, setActiveTab] = useState("0");
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reported Auto Scoring by Position</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs 
          value={activeTab} 
          onValueChange={handleTabChange} 
          enableSwipe={true}
          className="touch-pan-y"
        >
          <TabsList className="grid w-full grid-cols-5">
            {[0, 1, 2, 3, 4].map((position) => (
              <TabsTrigger key={position} value={position.toString()}>
                Pos {position}
              </TabsTrigger>
            ))}
          </TabsList>
          {[0, 1, 2, 3, 4].map((position) => (
            <TabsContent key={position} value={position.toString()} className="space-y-4 min-h-[400px] w-full">
              <FieldPositionVisual selectedPosition={position} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="font-medium">Coral Levels</h4>
                  {[1, 2, 3, 4].map((level) => (
                    <LabeledCounter
                      key={`pos${position}-coral${level}`}
                      label={`Level ${level}`}
                      value={autoScoring[`position${position}` as keyof typeof autoScoring][`coralL${level}` as keyof AutoPositionScoring] as number}
                      onChange={(value) =>
                        setAutoScoring(prev => ({
                          ...prev,
                          [`position${position}`]: {
                            ...prev[`position${position}` as keyof typeof prev],
                            [`coralL${level}`]: value
                          }
                        }))
                      }
                    />
                  ))}
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium">Algae</h4>
                  <LabeledCounter
                    label="Algae to Net"
                    value={autoScoring[`position${position}` as keyof typeof autoScoring].algaeNet}
                    onChange={(value) =>
                      setAutoScoring(prev => ({
                        ...prev,
                        [`position${position}`]: {
                          ...prev[`position${position}` as keyof typeof prev],
                          algaeNet: value
                        }
                      }))
                    }
                  />
                  <LabeledCounter
                    label="Algae to Processor"
                    value={autoScoring[`position${position}` as keyof typeof autoScoring].algaeProcessor}
                    onChange={(value) =>
                      setAutoScoring(prev => ({
                        ...prev,
                        [`position${position}`]: {
                          ...prev[`position${position}` as keyof typeof prev],
                          algaeProcessor: value
                        }
                      }))
                    }
                  />
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};
