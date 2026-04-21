module.exports = {
  apps: [{
    name: 'vite',
    script: 'sh',
    args: '-c "npm run dev"',
    cwd: __dirname,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    }
  }]
};