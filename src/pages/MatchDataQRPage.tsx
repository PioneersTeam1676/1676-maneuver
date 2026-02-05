import { useState } from "react";
import Button from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import MatchDataFountainGenerator from "@/components/DataTransferComponents/MatchDataFountainGenerator";
import MatchDataFountainScanner from "@/components/DataTransferComponents/MatchDataFountainScanner";

const MatchDataQRPage = () => {
  const [mode, setMode] = useState<'select' | 'generate' | 'scan'>('select');

  if (mode === 'generate') {
    return (
      <MatchDataFountainGenerator 
        onBack={() => setMode('select')} 
        onSwitchToScanner={() => setMode('scan')}
      />
    );
  }

  if (mode === 'scan') {
    return (
      <MatchDataFountainScanner 
        onBack={() => setMode('select')} 
        onSwitchToGenerator={() => setMode('generate')}
      />
    );
  }

  return (
    <div className="h-screen w-full flex flex-col items-center px-4 pt-6 pb-6">
      <div className="flex flex-col items-start gap-4 max-w-md w-full">
        <h1 className="text-2xl font-bold">Upload Match Data QR</h1>
        <p className="text-muted-foreground">
          Generate or scan fountain code QR sequences for reliable match data transfer between devices.
        </p>

        <div className="flex flex-col gap-4 w-full">
          <Button
            onClick={() => setMode('generate')}
            className="w-full h-16 text-xl"
          >
            Generate Match Data Fountain Codes
          </Button>
          
          <div className="flex items-center gap-4">
            <Separator className="flex-1" />
            <span className="text-sm text-muted-foreground">OR</span>
            <Separator className="flex-1" />
          </div>
          
          <Button
            onClick={() => setMode('scan')}
            variant="outline"
            className="w-full h-16 text-xl"
          >
            Scan Match Data Fountain Codes
          </Button>
        </div>

        <div className="text-xs text-muted-foreground text-start space-y-1">
          <p>• Fountain codes break large data into multiple QR codes</p>
          <p>• Scan packets in any order until reconstruction completes</p>
          <p>• More reliable than single large QR codes</p>
          <p>• No need to scan all packets</p>
        </div>
      </div>
    </div>
  );
};

export default MatchDataQRPage;
