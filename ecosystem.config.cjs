module.exports = {
  apps: [
    {
      name: "1676-scouting-qe",
      cwd: "/srv/md0/robotics/maneuver-qe",
      script: "npm",
      args: "run preview -- --host --port 4176 --strictPort",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 2000,
      env: {
        NODE_ENV: "production",
      },
      out_file: "/home/alexradu/.pm2/logs/1676-scouting-qe-out.log",
      error_file: "/home/alexradu/.pm2/logs/1676-scouting-qe-error.log",
      merge_logs: true,
      time: true,
    },
  ],
}
