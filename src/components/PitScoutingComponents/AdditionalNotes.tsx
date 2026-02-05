import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface AdditionalNotesProps {
  notes: string;
  setNotes: (value: string) => void;
}

export const AdditionalNotes = ({ notes, setNotes }: AdditionalNotesProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Additional Notes</CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          placeholder="Any additional observations, special features, or notes about the robot..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
        />
      </CardContent>
    </Card>
  );
};
