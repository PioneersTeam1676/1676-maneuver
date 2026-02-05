// Spatial clustering algorithms for optimal pit scouting routes

export interface TeamPosition {
  teamNumber: number;
  x: number;
  y: number;
}

export type SpatialCluster = TeamPosition[];

// Helper function to calculate the maximum distance between any two teams in a cluster
export function calculateClusterSpread(cluster: TeamPosition[]): number {
  if (cluster.length <= 1) return 0;
  
  let maxDistance = 0;
  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      const distance = Math.sqrt(
        Math.pow(cluster[i].x - cluster[j].x, 2) + Math.pow(cluster[i].y - cluster[j].y, 2)
      );
      maxDistance = Math.max(maxDistance, distance);
    }
  }
  return maxDistance;
}

// Advanced spatial clustering using k-means with geographic coherence
export function createSpatialClusters(
  teamPositions: TeamPosition[], 
  numClusters: number
): SpatialCluster[] {
  if (teamPositions.length === 0 || numClusters === 0) {
    return [];
  }
  
  if (numClusters === 1) {
    return [teamPositions];
  }
  
  // Use k-means clustering for spatial grouping
  const clusters: SpatialCluster[] = [];
  
  // Initialize cluster centers using spread-out positions
  const sortedByX = [...teamPositions].sort((a, b) => a.x - b.x);
  const sortedByY = [...teamPositions].sort((a, b) => a.y - b.y);
  
  const minX = sortedByX[0].x;
  const maxX = sortedByX[sortedByX.length - 1].x;
  const minY = sortedByY[0].y;
  const maxY = sortedByY[sortedByY.length - 1].y;
  
  // Create initial cluster centers in a grid pattern
  const centersPerRow = Math.ceil(Math.sqrt(numClusters));
  const centersPerCol = Math.ceil(numClusters / centersPerRow);
  
  const centers: { x: number; y: number }[] = [];
  for (let i = 0; i < numClusters; i++) {
    const row = Math.floor(i / centersPerRow);
    const col = i % centersPerRow;
    
    const x = minX + (col / (centersPerRow - 1 || 1)) * (maxX - minX);
    const y = minY + (row / (centersPerCol - 1 || 1)) * (maxY - minY);
    
    centers.push({ x, y });
  }
  
  // K-means iterations
  for (let iteration = 0; iteration < 10; iteration++) {
    // Clear clusters
    for (let i = 0; i < numClusters; i++) {
      clusters[i] = [];
    }
    
    // Assign each team to nearest cluster center
    teamPositions.forEach(team => {
      let minDistance = Infinity;
      let closestCluster = 0;
      
      centers.forEach((center, clusterIndex) => {
        const distance = Math.sqrt(
          Math.pow(team.x - center.x, 2) + Math.pow(team.y - center.y, 2)
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestCluster = clusterIndex;
        }
      });
      
      clusters[closestCluster].push(team);
    });
    
    // Update cluster centers to centroid of assigned teams
    centers.forEach((center, clusterIndex) => {
      const clusterTeams = clusters[clusterIndex];
      if (clusterTeams.length > 0) {
        center.x = clusterTeams.reduce((sum, team) => sum + team.x, 0) / clusterTeams.length;
        center.y = clusterTeams.reduce((sum, team) => sum + team.y, 0) / clusterTeams.length;
      }
    });
  }
  
  // Sort teams within each cluster for optimal walking route (TSP approximation)
  clusters.forEach(cluster => {
    if (cluster.length <= 1) return;
    
    // Simple nearest-neighbor TSP approximation for walking route
    const sortedCluster: TeamPosition[] = [];
    const remaining = [...cluster];
    
    // Start with leftmost team
    let current = remaining.reduce((leftmost, team) => 
      team.x < leftmost.x ? team : leftmost
    );
    
    sortedCluster.push(current);
    remaining.splice(remaining.indexOf(current), 1);
    
    // Add nearest unvisited team
    while (remaining.length > 0) {
      let nearest = remaining[0];
      let minDistance = Infinity;
      
      remaining.forEach(team => {
        const distance = Math.sqrt(
          Math.pow(current.x - team.x, 2) + Math.pow(current.y - team.y, 2)
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearest = team;
        }
      });
      
      sortedCluster.push(nearest);
      remaining.splice(remaining.indexOf(nearest), 1);
      current = nearest;
    }
    
    // Replace original cluster with sorted version
    cluster.splice(0, cluster.length, ...sortedCluster);
  });
  
  // Apply proximity-based reassignment and geographic optimization
  applyProximityReassignment(clusters, teamPositions);
  applyGeographicOptimization(clusters);
  
  return clusters.filter(cluster => cluster.length > 0);
}

// Proximity-based reassignment to ensure teams go to their closest cluster
function applyProximityReassignment(clusters: SpatialCluster[], teamPositions: TeamPosition[]): void {
  const numClusters = clusters.length;
  const avgClusterSize = Math.floor(teamPositions.length / numClusters);
  const remainder = teamPositions.length % numClusters;
  
  let changed = true;
  let iterations = 0;
  
  console.log('=== Starting Proximity-Based Reassignment ===');
  console.log('Initial cluster sizes:', clusters.map(c => c.length));
  console.log('Target sizes:', clusters.map((_, i) => i < remainder ? avgClusterSize + 1 : avgClusterSize));
  
  while (changed && iterations < 5) {
    changed = false;
    iterations++;
    console.log(`\n--- Proximity Check Iteration ${iterations} ---`);
    
    // Check each team to see if it would be closer to a different cluster
    for (let i = 0; i < numClusters; i++) {
      for (let teamIndex = clusters[i].length - 1; teamIndex >= 0; teamIndex--) {
        const team = clusters[i][teamIndex];
        let currentMinDistance = Infinity;
        let bestCluster = i;
        
        // Find the absolute closest cluster for this team
        for (let j = 0; j < numClusters; j++) {
          if (j === i || clusters[j].length === 0) continue;
          
          // Find minimum distance to any team in cluster j
          let minDistanceToCluster = Infinity;
          clusters[j].forEach(otherTeam => {
            const distance = Math.sqrt(
              Math.pow(team.x - otherTeam.x, 2) + Math.pow(team.y - otherTeam.y, 2)
            );
            minDistanceToCluster = Math.min(minDistanceToCluster, distance);
          });
          
          if (minDistanceToCluster < currentMinDistance) {
            currentMinDistance = minDistanceToCluster;
            bestCluster = j;
          }
        }
        
        // Also check distance to current cluster
        let minDistanceToCurrentCluster = Infinity;
        clusters[i].forEach((otherTeam, otherIndex) => {
          if (otherIndex !== teamIndex) {
            const distance = Math.sqrt(
              Math.pow(team.x - otherTeam.x, 2) + Math.pow(team.y - otherTeam.y, 2)
            );
            minDistanceToCurrentCluster = Math.min(minDistanceToCurrentCluster, distance);
          }
        });
        
        // Debug logging for specific problematic teams
        if (team.teamNumber === 9977 || team.teamNumber === 9990) {
          console.log(`Team ${team.teamNumber}:`, {
            currentCluster: i,
            closestOtherCluster: bestCluster,
            distanceToClosestOther: currentMinDistance,
            distanceToCurrentCluster: minDistanceToCurrentCluster,
            ratio: currentMinDistance / minDistanceToCurrentCluster
          });
        }
        
        // If team is significantly closer to another cluster, move it
        const isVeryClose = currentMinDistance <= 150;
        const threshold = isVeryClose ? 1.5 : 1.1;
        
        if (bestCluster !== i && currentMinDistance < minDistanceToCurrentCluster * threshold) {
          const currentTargetSize = i < remainder ? avgClusterSize + 1 : avgClusterSize;
          const bestTargetSize = bestCluster < remainder ? avgClusterSize + 1 : avgClusterSize;
          
          // Geographic coherence check
          const testCluster = [...clusters[bestCluster], team];
          const clusterSpread = calculateClusterSpread(testCluster);
          const maxAllowedSpread = isVeryClose ? 800 : 600;
          
          if (clusters[bestCluster].length < bestTargetSize + 2 && 
              clusters[i].length > Math.max(1, currentTargetSize - 2) &&
              clusterSpread <= maxAllowedSpread) {
            
            // Move the team
            clusters[i].splice(teamIndex, 1);
            clusters[bestCluster].push(team);
            changed = true;
            
            console.log(`✅ Moved team ${team.teamNumber} from cluster ${i} to cluster ${bestCluster} for better proximity`);
            console.log(`  Distance improvement: ${minDistanceToCurrentCluster.toFixed(1)} → ${currentMinDistance.toFixed(1)}`);
            console.log(`  Cluster spread after move: ${clusterSpread.toFixed(1)}`);
          } else {
            const reasons = [];
            if (clusters[bestCluster].length >= bestTargetSize + 2) reasons.push('target cluster too large');
            if (clusters[i].length <= Math.max(1, currentTargetSize - 2)) reasons.push('source cluster too small');
            if (clusterSpread > maxAllowedSpread) reasons.push(`spread too large (${clusterSpread.toFixed(1)} > ${maxAllowedSpread})`);
            
            console.log(`❌ Cannot move team ${team.teamNumber} due to constraints: ${reasons.join(', ')}`);
          }
        }
      }
    }
    
    console.log(`Iteration ${iterations} complete. Changed: ${changed}`);
    console.log('Updated cluster sizes:', clusters.map(c => c.length));
  }
}

// Geographic coherence optimization through beneficial team swaps
function applyGeographicOptimization(clusters: SpatialCluster[]): void {
  const numClusters = clusters.length;
  let geographicImprovement = true;
  let geoIterations = 0;

  console.log('\n=== Geographic Coherence Optimization ===');

  while (geographicImprovement && geoIterations < 3) {
    geographicImprovement = false;
    geoIterations++;
    
    // Find the best possible swap across all cluster pairs
    let bestSwap: {
      clusterI: number, clusterJ: number, teamI: number, teamJ: number,
      improvement: number, teamFromI: TeamPosition, teamFromJ: TeamPosition
    } | null = null;
    
    for (let i = 0; i < numClusters; i++) {
      for (let j = i + 1; j < numClusters; j++) {
        const clusterI = clusters[i];
        const clusterJ = clusters[j];
        
        // Try swapping each team from cluster i with each team from cluster j
        for (let teamI = 0; teamI < clusterI.length; teamI++) {
          for (let teamJ = 0; teamJ < clusterJ.length; teamJ++) {
            const teamFromI = clusterI[teamI];
            const teamFromJ = clusterJ[teamJ];
            
            // Calculate current geographic coherence
            const currentSpreadI = calculateClusterSpread(clusterI);
            const currentSpreadJ = calculateClusterSpread(clusterJ);
            const currentTotalSpread = currentSpreadI + currentSpreadJ;
            
            // Calculate spreads after swapping
            const testClusterI = [...clusterI];
            const testClusterJ = [...clusterJ];
            testClusterI[teamI] = teamFromJ;
            testClusterJ[teamJ] = teamFromI;
            
            const newSpreadI = calculateClusterSpread(testClusterI);
            const newSpreadJ = calculateClusterSpread(testClusterJ);
            const newTotalSpread = newSpreadI + newSpreadJ;
            
            const improvement = currentTotalSpread - newTotalSpread;
            
            // If this swap is better than our current best, save it
            if (improvement > 0 && (!bestSwap || improvement > bestSwap.improvement)) {
              bestSwap = {
                clusterI: i, clusterJ: j, teamI, teamJ,
                improvement, teamFromI, teamFromJ
              };
              
              // Debug specific teams we're interested in
              if (teamFromI.teamNumber === 8876 || teamFromJ.teamNumber === 8876 ||
                  teamFromI.teamNumber === 9991 || teamFromJ.teamNumber === 9991) {
                console.log(`  Considering swap: ${teamFromI.teamNumber} ↔ ${teamFromJ.teamNumber}, improvement: ${improvement.toFixed(1)}`);
              }
            }
          }
        }
      }
    }
    
    // Perform the best swap if one was found
    if (bestSwap && bestSwap.improvement > 10) {
      console.log(`🔄 Swapping team ${bestSwap.teamFromI.teamNumber} (cluster ${bestSwap.clusterI}) with team ${bestSwap.teamFromJ.teamNumber} (cluster ${bestSwap.clusterJ}) for better geography`);
      console.log(`  Spread improvement: ${bestSwap.improvement.toFixed(1)} units`);
      
      // Perform the swap
      clusters[bestSwap.clusterI][bestSwap.teamI] = bestSwap.teamFromJ;
      clusters[bestSwap.clusterJ][bestSwap.teamJ] = bestSwap.teamFromI;
      geographicImprovement = true;
    }
    
    if (geographicImprovement) {
      console.log(`Geographic optimization iteration ${geoIterations} complete`);
      console.log('Updated cluster sizes:', clusters.map(c => c.length));
    }
  }
}
