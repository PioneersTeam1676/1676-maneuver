export const clearAllStrategies = (setActiveTab: (tab: string) => void, activeTab: string) => {
  // Clear all localStorage data for the three stages
  localStorage.removeItem('fieldStrategy_autonomous');
  localStorage.removeItem('fieldStrategy_teleop');
  localStorage.removeItem('fieldStrategy_endgame');
  
  // Force refresh of all canvases by changing the activeTab and back
  const currentTab = activeTab;
  setActiveTab('');
  setTimeout(() => {
    setActiveTab(currentTab);
  }, 50);
  
};

export const saveAllStrategyCanvases = (matchNumber: string, selectedTeams: string[]) => {
  // Add a small delay to ensure all canvases are rendered
  setTimeout(() => {
    // Try to get from localStorage first since it's more reliable
    const autonomousData = localStorage.getItem('fieldStrategy_autonomous');
    const teleopData = localStorage.getItem('fieldStrategy_teleop');
    const endgameData = localStorage.getItem('fieldStrategy_endgame');

    if (!autonomousData || !teleopData || !endgameData) {
      alert('Please draw on all three strategy tabs (Autonomous, Teleop, and Endgame) before saving');
      return;
    }

    // Create a new canvas to composite all three images
    const compositeCanvas = document.createElement('canvas');
    const ctx = compositeCanvas.getContext('2d');
    if (!ctx) return;

    // Load all three images
    const autonomousImg = new Image();
    const teleopImg = new Image();
    const endgameImg = new Image();

    let loadedCount = 0;
    const totalImages = 3;

    const onImageLoad = () => {
      loadedCount++;
      if (loadedCount === totalImages) {
        // All images loaded, now composite them
        const imgWidth = autonomousImg.width;
        const imgHeight = autonomousImg.height;
        
        // Set composite canvas size (3x height for stacking + extra space for match number)
        const topMargin = matchNumber ? 60 : 40; // Extra space if match number exists
        compositeCanvas.width = imgWidth;
        compositeCanvas.height = imgHeight * 3 + topMargin;

        // Clear canvas with white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);

        // Add match number at the very top if provided
        if (matchNumber) {
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.font = 'bold 20px Arial';
          ctx.fillText(`Match ${matchNumber}`, imgWidth / 2, 30);
        }

        // Draw title labels for each section
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';

        // Draw Autonomous section
        ctx.fillText('AUTONOMOUS', imgWidth / 2, topMargin + 30);
        ctx.drawImage(autonomousImg, 0, topMargin + 40, imgWidth, imgHeight - 40);

        // Draw Teleop section
        ctx.fillText('TELEOP', imgWidth / 2, topMargin + imgHeight + 30);
        ctx.drawImage(teleopImg, 0, topMargin + imgHeight + 40, imgWidth, imgHeight - 40);

        // Draw Endgame section
        ctx.fillText('ENDGAME', imgWidth / 2, topMargin + (imgHeight * 2) + 30);
        ctx.drawImage(endgameImg, 0, topMargin + (imgHeight * 2) + 40, imgWidth, imgHeight - 40);

        // Add team information at the top - corrected positioning and alliance sides
        ctx.font = 'bold 16px Arial';
        const blueTeams = selectedTeams.slice(3, 6).filter(Boolean); // Blue teams (originally index 3-5)
        const redTeams = selectedTeams.slice(0, 3).filter(Boolean);  // Red teams (originally index 0-2)
        
        if (blueTeams.length > 0 || redTeams.length > 0) {
          const teamInfoY = matchNumber ? 50 : 20; // Position below match number if it exists
          
          // Blue alliance on left side
          ctx.fillStyle = '#0000ff';
          ctx.textAlign = 'left';
          ctx.fillText(`Blue: ${blueTeams.join(', ')}`, 10, teamInfoY);
          
          // Red alliance on right side
          ctx.fillStyle = '#ff0000';
          ctx.textAlign = 'right';
          ctx.fillText(`Red: ${redTeams.join(', ')}`, imgWidth - 10, teamInfoY);
        }

        // Download the composite image
        const dataURL = compositeCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        const filename = matchNumber 
          ? `match-${matchNumber}-strategy-${new Date().toISOString().slice(0, 10)}.png`
          : `match-strategy-complete-${new Date().toISOString().slice(0, 10)}.png`;
        link.download = filename;
        link.click();

      }
    };

    // Set up image load handlers
    autonomousImg.onload = onImageLoad;
    teleopImg.onload = onImageLoad;
    endgameImg.onload = onImageLoad;

    // Load the images
    autonomousImg.src = autonomousData;
    teleopImg.src = teleopData;
    endgameImg.src = endgameData;

  }, 100); // Small delay to ensure DOM is ready
};
