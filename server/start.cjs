// npm start serves the built client even when a local shell has no NODE_ENV.
process.env.NODE_ENV ||= 'production';
require('./dist/server/src/index.js');
