import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface BackupRecommendationAlertProps {
  onClearAllClick: () => void;
}

export const BackupRecommendationAlert = ({ onClearAllClick }: BackupRecommendationAlertProps) => {
  return (
    <Alert>
      <AlertTitle>💡 Backup Recommendation</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>Consider downloading your data before clearing it. Use the JSON Transfer page to export your data.</p>
        <p className="text-xs text-muted-foreground">
          ⚠️ The button below will completely reset this device, clearing ALL stored data including settings.
        </p>
        <Button 
          variant="destructive" 
          size="sm" 
          onClick={onClearAllClick}
          className="w-full"
        >
          🗑️ Clear All Data
        </Button>
      </AlertDescription>
    </Alert>
  );
};
