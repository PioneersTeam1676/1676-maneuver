const scheduleBackups = () => {
  if (process.env.DISABLE_DB_BACKUPS === "true") {
    console.log("[backup] Database snapshots disabled via DISABLE_DB_BACKUPS")
    return
  }
  console.log("[backup] MySQL is configured; filesystem snapshots are not supported.")
}

const createBackupSnapshot = () => {
  console.log("[backup] MySQL is configured; filesystem snapshots are not supported.")
}

const BACKUP_DIRECTORY = null

module.exports = {
  scheduleBackups,
  createBackupSnapshot,
  BACKUP_DIRECTORY,
}
