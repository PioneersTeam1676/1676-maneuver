import { Button } from "@/components/ui/button";
import { Download, Upload, Users, EyeOff } from "lucide-react";

interface PickListHeaderProps {
  onExport: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  showAllianceSelection: boolean;
  onToggleAllianceSelection: () => void;
}

export const PickListHeader = ({ onExport, onImport, showAllianceSelection, onToggleAllianceSelection }: PickListHeaderProps) => {
  const handleImportClick = () => {
    const input = document.getElementById('import-input') as HTMLInputElement;
    if (input) {
      // Clear any previous value to ensure onChange fires even for the same file
      input.value = '';
      input.click();
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
      <div>
        <p className="text-muted-foreground">Create and manage alliance selection pick lists</p>
      </div>
      
      <div className="flex gap-2">
        <Button 
          onClick={onToggleAllianceSelection} 
          variant={showAllianceSelection ? "default" : "outline"} 
          size="sm"
        >
          {showAllianceSelection ? <EyeOff className="w-4 h-4 mr-2" /> : <Users className="w-4 h-4 mr-2" />}
          {showAllianceSelection ? "Hide Alliances" : "Show Alliances"}
        </Button>
        <Button onClick={onExport} variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
        <input
          type="file"
          accept=".json"
          onChange={onImport}
          style={{ display: 'none' }}
          id="import-input"
        />
        <Button 
          onClick={handleImportClick} 
          variant="outline" 
          size="sm"
        >
          <Upload className="w-4 h-4 mr-2" />
          Import
        </Button>
      </div>
    </div>
  );
};
