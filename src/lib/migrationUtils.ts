import { db } from './dexieDB';

export const checkMigrationNeeded = async (): Promise<{
  needsMigration: boolean;
  oldIndexedDBCount: number;
  dexieCount: number;
  localStorageCount: number;
}> => {
  try {
    const dexieEntries = await db.scoutingData.count();
    
    let oldIndexedDBCount = 0;
    try {
      const { loadAllScoutingEntries } = await import('./indexedDBUtils');
      const oldEntries = await loadAllScoutingEntries();
      oldIndexedDBCount = oldEntries.length;
    } catch (error) {
      console.log('Old IndexedDB not accessible or empty:', error);
    }
    
    let localStorageCount = 0;
    try {
      const existingDataStr = localStorage.getItem('scoutingData');
      if (existingDataStr) {
        const parsed = JSON.parse(existingDataStr);
        if (Array.isArray(parsed.data)) {
          localStorageCount = parsed.data.length;
        } else if (Array.isArray(parsed.entries)) {
          localStorageCount = parsed.entries.length;
        }
      }
    } catch (error) {
      console.log('localStorage not accessible or invalid:', error);
    }
    
    return {
      needsMigration: (oldIndexedDBCount > 0 || localStorageCount > 0) && dexieEntries === 0,
      oldIndexedDBCount,
      dexieCount: dexieEntries,
      localStorageCount
    };
  } catch (error) {
    console.error('Error checking migration status:', error);
    return {
      needsMigration: false,
      oldIndexedDBCount: 0,
      dexieCount: 0,
      localStorageCount: 0
    };
  }
};

export const performMigration = async (): Promise<{
  success: boolean;
  migratedFrom: string[];
  totalMigrated: number;
  errors: string[];
}> => {
  const errors: string[] = [];
  const migratedFrom: string[] = [];
  let totalMigrated = 0;
  
  try {
    try {
      const { migrateFromIndexedDB } = await import('./dexieDB');
      const indexedDBResult = await migrateFromIndexedDB();
      
      if (indexedDBResult.success && indexedDBResult.migratedCount > 0) {
        migratedFrom.push('Old IndexedDB');
        totalMigrated += indexedDBResult.migratedCount;
        console.log(`Successfully migrated ${indexedDBResult.migratedCount} entries from old IndexedDB`);
      }
    } catch (error) {
      const errorMsg = `Failed to migrate from old IndexedDB: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }
    
    if (totalMigrated === 0) {
      try {
        const { migrateFromLocalStorage } = await import('./dexieDB');
        const localStorageResult = await migrateFromLocalStorage();
        
        if (localStorageResult.success && localStorageResult.migratedCount > 0) {
          migratedFrom.push('localStorage');
          totalMigrated += localStorageResult.migratedCount;
          console.log(`Successfully migrated ${localStorageResult.migratedCount} entries from localStorage`);
        }
      } catch (error) {
        const errorMsg = `Failed to migrate from localStorage: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
    
    return {
      success: totalMigrated > 0 || errors.length === 0,
      migratedFrom,
      totalMigrated,
      errors
    };
  } catch (error) {
    const errorMsg = `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    errors.push(errorMsg);
    return {
      success: false,
      migratedFrom,
      totalMigrated,
      errors
    };
  }
};

export const cleanupOldData = async (): Promise<{
  success: boolean;
  cleanedUp: string[];
  errors: string[];
}> => {
  const cleanedUp: string[] = [];
  const errors: string[] = [];
  
  try {
    try {
      const oldDBName = 'ScoutingAppDB';
      const deleteRequest = indexedDB.deleteDatabase(oldDBName + '_old');
      
      await new Promise<void>((resolve, reject) => {
        deleteRequest.onsuccess = () => {
          cleanedUp.push('Old IndexedDB');
          resolve();
        };
        deleteRequest.onerror = () => reject(deleteRequest.error);
        deleteRequest.onblocked = () => {
          console.warn('Old IndexedDB deletion blocked, will retry later');
          resolve();
        };
      });
    } catch (error) {
      const errorMsg = `Failed to clean up old IndexedDB: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
    }
    
    try {
      const backupData = localStorage.getItem('scoutingData_backup');
      if (backupData) {
        const currentData = localStorage.getItem('scoutingData');
        if (currentData) {
          localStorage.removeItem('scoutingData');
          cleanedUp.push('localStorage current data');
        }
      }
    } catch (error) {
      const errorMsg = `Failed to clean up localStorage: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
    }
    
    return {
      success: errors.length === 0,
      cleanedUp,
      errors
    };
  } catch (error) {
    const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    errors.push(errorMsg);
    return {
      success: false,
      cleanedUp,
      errors
    };
  }
};

export const autoMigrate = async (): Promise<void> => {
  try {
    const migrationStatus = await checkMigrationNeeded();
    
    if (migrationStatus.needsMigration) {
      console.log('Migration needed:', migrationStatus);
      
      const migrationResult = await performMigration();
      
      if (migrationResult.success && migrationResult.totalMigrated > 0) {
        console.log(`Migration completed successfully! Migrated ${migrationResult.totalMigrated} entries from:`, migrationResult.migratedFrom);
      } else {
        console.warn('Migration completed but no data was migrated or there were errors:', migrationResult.errors);
      }
    } else {
      console.log('No migration needed. Current data counts:', {
        dexie: migrationStatus.dexieCount,
        oldIndexedDB: migrationStatus.oldIndexedDBCount,
        localStorage: migrationStatus.localStorageCount
      });
    }
  } catch (error) {
    console.error('Auto-migration failed:', error);
  }
};

export default {
  checkMigrationNeeded,
  performMigration,
  cleanupOldData,
  autoMigrate
};
