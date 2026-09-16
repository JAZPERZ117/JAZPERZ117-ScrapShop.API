module.exports = {
  apps: [
    {
      name: 'scrapshop-api',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      // Cluster mode (pm2's default whenever `instances` is set) forks a separate worker
      // process that's the one actually holding the listening socket — pm2 itself only reports
      // the master's pid, not the worker's. watchdog.ps1 compares pm2's reported pid against
      // whatever's actually listening on port 4000 to detect an unmanaged/orphaned process; in
      // cluster mode that comparison always mismatches even when everything is completely
      // healthy, since it's checking the wrong pid. There's exactly one instance here, so
      // cluster mode's load-balancing-across-workers was never doing anything useful anyway —
      // fork mode makes pm2's reported pid the real listening pid directly.
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
